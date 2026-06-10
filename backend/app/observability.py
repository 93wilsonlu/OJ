from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import anyio
import redis
from prometheus_client import Gauge, generate_latest
from redis import Redis
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.services import storage

METRIC_JUDGE_SUCCESS = "oj:metrics:judge:success_total"
METRIC_JUDGE_FAILURE = "oj:metrics:judge:failure_total"
METRIC_JUDGE_DURATION_TOTAL = "oj:metrics:judge:duration_total_seconds"
METRIC_JUDGE_DURATION_COUNT = "oj:metrics:judge:duration_count"
METRIC_STUCK_MARKED = "oj:metrics:stuck_marked_total"
WORKER_HEARTBEAT_KEY = "oj:worker:last_heartbeat"
READINESS_CHECK_TIMEOUT_SECONDS = 1.0

QUEUE_LENGTH = Gauge("oj_queue_length", "Number of jobs waiting in the judge queue.")
JUDGE_SUCCESS_TOTAL = Gauge("oj_judge_success_total", "Judge jobs completed successfully.")
JUDGE_FAILURE_TOTAL = Gauge("oj_judge_failure_total", "Judge jobs failed with system errors.")
JUDGE_AVERAGE_SECONDS = Gauge("oj_judge_average_seconds", "Average judge wall time in seconds.")
WORKER_HEARTBEAT_UNIXTIME = Gauge(
    "oj_worker_heartbeat_unixtime", "Last judge worker heartbeat as a Unix timestamp."
)
STUCK_SUBMISSIONS_MARKED_TOTAL = Gauge(
    "oj_stuck_submissions_marked_total",
    "Submissions marked as failed because they were stuck in judging.",
)
READINESS_UP = Gauge(
    "oj_readiness_dependency_up",
    "Readiness check result by dependency. 1 means reachable, 0 means unavailable.",
    ["dependency"],
)


@dataclass
class DependencyStatus:
    ok: bool
    detail: str


def get_redis_client() -> Redis:
    return redis.from_url(settings.REDIS_URL)


async def check_db() -> DependencyStatus:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return DependencyStatus(ok=True, detail="ok")
    except Exception as exc:
        return DependencyStatus(ok=False, detail=str(exc))


async def check_redis() -> DependencyStatus:
    try:
        client = get_redis_client()
        await anyio.to_thread.run_sync(client.ping, abandon_on_cancel=True)
        return DependencyStatus(ok=True, detail="ok")
    except Exception as exc:
        return DependencyStatus(ok=False, detail=str(exc))


async def check_storage() -> DependencyStatus:
    try:
        bucket = await anyio.to_thread.run_sync(
            lambda: storage._get_client().lookup_bucket(settings.GCS_BUCKET)
        )
        if bucket is not None:
            return DependencyStatus(ok=True, detail="ok")
        return DependencyStatus(ok=False, detail=f"bucket {settings.GCS_BUCKET} not found")
    except Exception as exc:
        return DependencyStatus(ok=False, detail=str(exc))


async def check_pubsub() -> DependencyStatus:
    try:
        from google.cloud import pubsub_v1
        subscriber = pubsub_v1.SubscriberClient()
        await anyio.to_thread.run_sync(
            lambda: subscriber.get_subscription(request={"subscription": settings.PUBSUB_JUDGE_SUBSCRIPTION})
        )
        return DependencyStatus(ok=True, detail="ok")
    except Exception as exc:
        return DependencyStatus(ok=False, detail=str(exc))


async def _check_with_timeout(check) -> DependencyStatus:
    try:
        with anyio.fail_after(READINESS_CHECK_TIMEOUT_SECONDS):
            return await check()
    except TimeoutError:
        return DependencyStatus(
            ok=False,
            detail=f"timeout after {READINESS_CHECK_TIMEOUT_SECONDS}s",
        )


async def readiness_report() -> dict[str, object]:
    db, redis_status, storage_status = await asyncio.gather(
        _check_with_timeout(check_db),
        _check_with_timeout(check_redis),
        _check_with_timeout(check_storage),
    )
    checks = {"db": db, "redis": redis_status, "storage": storage_status}
    return {
        "status": "ready" if all(check.ok for check in checks.values()) else "not_ready",
        "checks": {
            name: {"ok": check.ok, "detail": check.detail} for name, check in checks.items()
        },
    }


def record_worker_heartbeat() -> None:
    try:
        get_redis_client().set(WORKER_HEARTBEAT_KEY, str(time.time()))
    except Exception:
        pass


def record_judge_result(success: bool, duration_seconds: float) -> None:
    try:
        client = get_redis_client()
        pipe = client.pipeline()
        pipe.incr(METRIC_JUDGE_SUCCESS if success else METRIC_JUDGE_FAILURE)
        pipe.incrbyfloat(METRIC_JUDGE_DURATION_TOTAL, duration_seconds)
        pipe.incr(METRIC_JUDGE_DURATION_COUNT)
        pipe.execute()
    except Exception:
        pass


def record_stuck_submissions(count: int) -> None:
    if count <= 0:
        return
    try:
        get_redis_client().incrby(METRIC_STUCK_MARKED, count)
    except Exception:
        pass


def _redis_float(client: Redis, key: str, default: float = 0.0) -> float:
    value = client.get(key)
    if value is None:
        return default
    return float(value)


async def refresh_prometheus_metrics() -> None:
    checks = (await readiness_report())["checks"]
    for dependency, check in checks.items():
        READINESS_UP.labels(dependency=dependency).set(1 if check["ok"] else 0)

    QUEUE_LENGTH.set(-1)  # queue depth now tracked via GCP Cloud Monitoring (Pub/Sub)

    try:
        client = get_redis_client()
        success = _redis_float(client, METRIC_JUDGE_SUCCESS)
        failure = _redis_float(client, METRIC_JUDGE_FAILURE)
        duration_total = _redis_float(client, METRIC_JUDGE_DURATION_TOTAL)
        duration_count = _redis_float(client, METRIC_JUDGE_DURATION_COUNT)
        JUDGE_SUCCESS_TOTAL.set(success)
        JUDGE_FAILURE_TOTAL.set(failure)
        JUDGE_AVERAGE_SECONDS.set(duration_total / duration_count if duration_count else 0)
        WORKER_HEARTBEAT_UNIXTIME.set(_redis_float(client, WORKER_HEARTBEAT_KEY))
        STUCK_SUBMISSIONS_MARKED_TOTAL.set(_redis_float(client, METRIC_STUCK_MARKED))
    except Exception:
        JUDGE_SUCCESS_TOTAL.set(0)
        JUDGE_FAILURE_TOTAL.set(0)
        JUDGE_AVERAGE_SECONDS.set(0)
        WORKER_HEARTBEAT_UNIXTIME.set(0)
        STUCK_SUBMISSIONS_MARKED_TOTAL.set(0)


async def prometheus_response_body() -> bytes:
    await refresh_prometheus_metrics()
    return generate_latest()