from datetime import timedelta

from google.cloud import storage as gcs

from lib.config import settings

_client: gcs.Client | None = None


def _get_client() -> gcs.Client:
    global _client
    if _client is None:
        project = settings.GCS_PROJECT or None
        _client = gcs.Client(project=project)
    return _client


def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    blob = _get_client().bucket(settings.GCS_BUCKET).blob(key)
    blob.upload_from_string(data, content_type=content_type)


def get_object_text(key: str) -> str:
    blob = _get_client().bucket(settings.GCS_BUCKET).blob(key)
    return blob.download_as_text(encoding="utf-8")


def delete_object(key: str) -> None:
    blob = _get_client().bucket(settings.GCS_BUCKET).blob(key)
    blob.delete()


def presigned_get_url(key: str, expires_seconds: int = 3600) -> str:
    blob = _get_client().bucket(settings.GCS_BUCKET).blob(key)
    return blob.generate_signed_url(
        expiration=timedelta(seconds=expires_seconds),
        method="GET",
        version="v4",
    )
