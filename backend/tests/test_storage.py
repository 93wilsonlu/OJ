from unittest.mock import MagicMock, patch
import pytest
from app.services import storage

def test_get_minio():
    with patch("app.services.storage.Minio") as mock_minio:
        with patch("app.services.storage._client", None):
            client = storage.get_minio()
            mock_minio.assert_called_once()
            assert client is mock_minio.return_value

def test_ensure_bucket_exists():
    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = True
    with patch("app.services.storage.get_minio", return_value=mock_client):
        storage.ensure_bucket()
        mock_client.bucket_exists.assert_called_once()
        mock_client.make_bucket.assert_not_called()

def test_ensure_bucket_not_exists():
    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = False
    with patch("app.services.storage.get_minio", return_value=mock_client):
        storage.ensure_bucket()
        mock_client.bucket_exists.assert_called_once()
        mock_client.make_bucket.assert_called_once()

def test_put_object():
    mock_client = MagicMock()
    with patch("app.services.storage.get_minio", return_value=mock_client):
        storage.put_object("key1", b"data1", "text/plain")
        mock_client.put_object.assert_called_once()

def test_get_object_text():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.read.return_value = b"my data"
    mock_client.get_object.return_value = mock_response
    with patch("app.services.storage.get_minio", return_value=mock_client):
        res = storage.get_object_text("key1")
        assert res == "my data"
        mock_response.close.assert_called_once()
        mock_response.release_conn.assert_called_once()

def test_delete_object():
    mock_client = MagicMock()
    with patch("app.services.storage.get_minio", return_value=mock_client):
        storage.delete_object("key1")
        mock_client.remove_object.assert_called_once()

def test_presigned_get_url():
    mock_client = MagicMock()
    with patch("app.services.storage.get_minio", return_value=mock_client):
        storage.presigned_get_url("key1")
        mock_client.presigned_get_object.assert_called_once()
