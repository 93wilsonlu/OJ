import time

import redis
from redis import Redis

from lib.config import settings

METRIC_JUDGE_SUCCESS = "oj:metrics:judge:success_total"
METRIC_JUDGE_FAILURE = "oj:metrics:judge:failure_total"
METRIC_JUDGE_DURATION_TOTAL = "oj:metrics:judge:duration_total_seconds"
METRIC_JUDGE_DURATION_COUNT = "oj:metrics:judge:duration_count"
METRIC_STUCK_MARKED = "oj:metrics:stuck_marked_total"
WORKER_HEARTBEAT_KEY = "oj:worker:last_heartbeat"

_redis: redis.Redis | None = None


def get_redis_client() -> Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


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
