import uuid

import redis
from rq import Queue

from app.config import settings

_queue: Queue | None = None
_run_queue: Queue | None = None


def get_queue() -> Queue:
    global _queue
    if _queue is None:
        conn = redis.from_url(settings.REDIS_URL)
        _queue = Queue("judge", connection=conn)
    return _queue


def get_run_queue() -> Queue:
    global _run_queue
    if _run_queue is None:
        conn = redis.from_url(settings.REDIS_URL)
        _run_queue = Queue("run", connection=conn)
    return _run_queue


def enqueue_submission(submission_id: uuid.UUID) -> None:
    get_queue().enqueue("worker.judge_submission", str(submission_id))


def enqueue_custom_run(run_id: uuid.UUID) -> None:
    get_run_queue().enqueue("worker.run_custom_submission", str(run_id))
