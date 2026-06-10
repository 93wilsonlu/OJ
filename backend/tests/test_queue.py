import uuid
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services import queue

def test_enqueue_submission():
    mock_publisher = MagicMock()
    mock_future = MagicMock()
    mock_publisher.publish.return_value = mock_future
    with patch("app.services.queue._get_publisher", return_value=mock_publisher):
        message = {"submission_id": "test123", "language": "python"}
        queue.enqueue_submission(message)
        mock_publisher.publish.assert_called_once()
        # Verify the message was published to the correct topic
        call_args = mock_publisher.publish.call_args
        assert call_args[0][1] == json.dumps(message).encode()
        mock_future.result.assert_called_once()

def test_enqueue_custom_run():
    mock_publisher = MagicMock()
    mock_future = MagicMock()
    mock_publisher.publish.return_value = mock_future
    with patch("app.services.queue._get_publisher", return_value=mock_publisher):
        message = {
            "run_id": str(uuid.uuid4()), "language": "python3",
            "code": "print(1)", "stdin": "", "time_limit": 1000, "memory_limit": 256,
        }
        queue.enqueue_custom_run(message)
        mock_publisher.publish.assert_called_once()
        call_args = mock_publisher.publish.call_args
        assert call_args[0][1] == json.dumps(message).encode()
        mock_future.result.assert_called_once()
