from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import anyio
from google.cloud import monitoring_v3
from prometheus_client import Gauge, generate_latest
from sqlalchemy import func, select, text

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.judge_result import JudgeResult
from app.models.worker_heartbeat import WorkerHeartbeat
from app.services import storage

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


async def check_db() -> DependencyStatus:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
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
            lambda: subscriber.get_subscription(
                request={"subscription": settings.PUBSUB_JUDGE_SUBSCRIPTION}
            )
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
    db, storage_status, pubsub_status = await asyncio.gather(
        _check_with_timeout(check_db),
        _check_with_timeout(check_storage),
        _check_with_timeout(check_pubsub),
    )
    checks = {"db": db, "storage": storage_status, "pubsub": pubsub_status}
    return {
        "status": "ready" if all(check.ok for check in checks.values()) else "not_ready",
        "checks": {
            name: {"ok": check.ok, "detail": check.detail} for name, check in checks.items()
        },
    }


async def _get_pubsub_queue_depth() -> int:
    parts = settings.PUBSUB_JUDGE_SUBSCRIPTION.split("/")
    if len(parts) < 4:
        raise ValueError(
            "PUBSUB_JUDGE_SUBSCRIPTION must be projects/{project}/subscriptions/{name}"
        )
    project_id, subscription_id = parts[1], parts[3]
    now = time.time()

    def _query() -> int:
        client = monitoring_v3.MetricServiceClient()
        results = client.list_time_series(
            request={
                "name": f"projects/{project_id}",
                "filter": (
                    'metric.type = "pubsub.googleapis.com/subscription/num_undelivered_messages"'
                    f' AND resource.labels.subscription_id = "{subscription_id}"'
                ),
                "interval": monitoring_v3.TimeInterval(
                    end_time={"seconds": int(now), "nanos": 0},
                    start_time={"seconds": int(now - 120), "nanos": 0},
                ),
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
            }
        )
        total = 0
        for ts in results:
            if ts.points:
                total += int(ts.points[0].value.int64_value)
        return total

    return await anyio.to_thread.run_sync(_query, abandon_on_cancel=True)


async def _load_db_metrics() -> dict[str, float]:
    async with AsyncSessionLocal() as db:
        success = await db.scalar(
            select(func.count()).select_from(JudgeResult).where(
                JudgeResult.verdict != "System Error"
            )
        )
        failure = await db.scalar(
            select(func.count()).select_from(JudgeResult).where(
                JudgeResult.verdict == "System Error"
            )
        )
        avg_duration_ms = await db.scalar(
            select(func.avg(JudgeResult.judge_duration_ms)).where(
                JudgeResult.judge_duration_ms.is_not(None)
            )
        )
        stuck_marked = await db.scalar(
            select(func.count()).select_from(JudgeResult).where(
                JudgeResult.stuck_marked.is_(True)
            )
        )
        heartbeat = await db.scalar(select(func.max(WorkerHeartbeat.last_seen_at)))

    heartbeat_ts = heartbeat.timestamp() if heartbeat is not None else 0.0
    return {
        "success": float(success or 0),
        "failure": float(failure or 0),
        "avg_seconds": float(avg_duration_ms or 0) / 1000.0,
        "stuck_marked": float(stuck_marked or 0),
        "heartbeat": heartbeat_ts,
    }


async def refresh_prometheus_metrics() -> None:
    checks = (await readiness_report())["checks"]
    for dependency, check in checks.items():
        READINESS_UP.labels(dependency=dependency).set(1 if check["ok"] else 0)

    try:
        QUEUE_LENGTH.set(await _get_pubsub_queue_depth())
    except Exception:
        QUEUE_LENGTH.set(-1)

    try:
        db_metrics = await _load_db_metrics()
        JUDGE_SUCCESS_TOTAL.set(db_metrics["success"])
        JUDGE_FAILURE_TOTAL.set(db_metrics["failure"])
        JUDGE_AVERAGE_SECONDS.set(db_metrics["avg_seconds"])
        WORKER_HEARTBEAT_UNIXTIME.set(db_metrics["heartbeat"])
        STUCK_SUBMISSIONS_MARKED_TOTAL.set(db_metrics["stuck_marked"])
    except Exception:
        JUDGE_SUCCESS_TOTAL.set(0)
        JUDGE_FAILURE_TOTAL.set(0)
        JUDGE_AVERAGE_SECONDS.set(0)
        WORKER_HEARTBEAT_UNIXTIME.set(0)
        STUCK_SUBMISSIONS_MARKED_TOTAL.set(0)


async def prometheus_response_body() -> bytes:
    await refresh_prometheus_metrics()
    return generate_latest()
