import json

from google.cloud import pubsub_v1

from app.config import settings

_publisher: pubsub_v1.PublisherClient | None = None


def _get_publisher() -> pubsub_v1.PublisherClient:
    global _publisher
    if _publisher is None:
        _publisher = pubsub_v1.PublisherClient()
    return _publisher


def enqueue_submission(message: dict) -> None:
    future = _get_publisher().publish(
        settings.PUBSUB_JUDGE_TOPIC,
        json.dumps(message).encode(),
    )
    future.result()


def enqueue_custom_run(message: dict) -> None:
    future = _get_publisher().publish(
        settings.PUBSUB_RUN_TOPIC,
        json.dumps(message).encode(),
    )
    future.result()
