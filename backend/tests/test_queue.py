import uuid
from unittest.mock import MagicMock, patch
import pytest
from app.services import queue

def test_get_queue():
    with patch("app.services.queue.redis") as mock_redis:
        with patch("app.services.queue.Queue") as mock_rq_queue:
            with patch("app.services.queue._queue", None):
                q = queue.get_queue()
                mock_redis.from_url.assert_called_once()
                mock_rq_queue.assert_called_once_with("judge", connection=mock_redis.from_url.return_value)
                assert q is mock_rq_queue.return_value

def test_get_run_queue():
    with patch("app.services.queue.redis") as mock_redis:
        with patch("app.services.queue.Queue") as mock_rq_queue:
            with patch("app.services.queue._run_queue", None):
                q = queue.get_run_queue()
                mock_redis.from_url.assert_called_once()
                mock_rq_queue.assert_called_once_with("run", connection=mock_redis.from_url.return_value)
                assert q is mock_rq_queue.return_value

def test_enqueue_submission():
    mock_q = MagicMock()
    submission_id = uuid.uuid4()
    with patch("app.services.queue.get_queue", return_value=mock_q):
        queue.enqueue_submission(submission_id)
        mock_q.enqueue.assert_called_once_with("worker.judge_submission", str(submission_id))

def test_enqueue_custom_run():
    mock_q = MagicMock()
    run_id = uuid.uuid4()
    with patch("app.services.queue.get_run_queue", return_value=mock_q):
        queue.enqueue_custom_run(run_id)
        mock_q.enqueue.assert_called_once_with("worker.run_custom_submission", str(run_id))
