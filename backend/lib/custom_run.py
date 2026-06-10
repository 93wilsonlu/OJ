import uuid

import redis

from lib.config import settings

RUN_RESULT_TTL_SECONDS = 10 * 60

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _run_key(run_id: uuid.UUID | str) -> str:
    return f"custom_run:{run_id}"


def _active_key(candidate_id: uuid.UUID) -> str:
    return f"custom_run_active:{candidate_id}"
