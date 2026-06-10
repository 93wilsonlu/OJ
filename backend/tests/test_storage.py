from unittest.mock import MagicMock, patch
import pytest
from app.services import storage
from app.config import settings

def test_get_client():
    with patch("lib.storage.gcs.Client") as mock_gcs_client:
        with patch("lib.storage._client", None):
            client = storage._get_client()
            mock_gcs_client.assert_called_once_with(project=settings.GCS_PROJECT or None)
            assert client is mock_gcs_client.return_value

def test_put_object():
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_bucket.blob.return_value = mock_blob
    mock_client = MagicMock()
    mock_client.bucket.return_value = mock_bucket

    with patch("lib.storage._get_client", return_value=mock_client):
        storage.put_object("key1", b"data1", "text/plain")
        mock_client.bucket.assert_called_once_with(settings.GCS_BUCKET)
        mock_bucket.blob.assert_called_once_with("key1")
        mock_blob.upload_from_string.assert_called_once_with(b"data1", content_type="text/plain")

def test_get_object_text():
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_blob.download_as_text.return_value = "my data"
    mock_bucket.blob.return_value = mock_blob
    mock_client = MagicMock()
    mock_client.bucket.return_value = mock_bucket

    with patch("lib.storage._get_client", return_value=mock_client):
        res = storage.get_object_text("key1")
        assert res == "my data"
        mock_bucket.blob.assert_called_once_with("key1")
        mock_blob.download_as_text.assert_called_once_with(encoding="utf-8")

def test_delete_object():
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_bucket.blob.return_value = mock_blob
    mock_client = MagicMock()
    mock_client.bucket.return_value = mock_bucket

    with patch("lib.storage._get_client", return_value=mock_client):
        storage.delete_object("key1")
        mock_bucket.blob.assert_called_once_with("key1")
        mock_blob.delete.assert_called_once()

def test_presigned_get_url():
    mock_bucket = MagicMock()
    mock_blob = MagicMock()
    mock_blob.generate_signed_url.return_value = "https://example.com/signed-url"
    mock_bucket.blob.return_value = mock_blob
    mock_client = MagicMock()
    mock_client.bucket.return_value = mock_bucket

    with patch("lib.storage._get_client", return_value=mock_client):
        url = storage.presigned_get_url("key1", expires_seconds=7200)
        assert url == "https://example.com/signed-url"
        mock_bucket.blob.assert_called_once_with("key1")
        mock_blob.generate_signed_url.assert_called_once()
