import uuid

import redis
from rq import Queue

from app.config import settings

_queue: Queue | None = None


def get_queue() -> Queue:
    global _queue
    if _queue is None:
        conn = redis.from_url(settings.REDIS_URL)
        _queue = Queue("judge", connection=conn)
    return _queue


def enqueue_submission(submission_id: uuid.UUID) -> None:
    get_queue().enqueue("worker.judge_submission", str(submission_id))
