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
        run_id = uuid.uuid4()
        queue.enqueue_custom_run(run_id)
        mock_publisher.publish.assert_called_once()
        # Verify the message was published
        call_args = mock_publisher.publish.call_args
        expected_message = json.dumps({"run_id": str(run_id)}).encode()
        assert call_args[0][1] == expected_message
        mock_future.result.assert_called_once()
