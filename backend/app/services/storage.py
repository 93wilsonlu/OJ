import io

from minio import Minio

from app.config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def ensure_bucket() -> None:
    client = get_minio()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET)


def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    get_minio().put_object(
        settings.MINIO_BUCKET, key, io.BytesIO(data), len(data), content_type=content_type
    )


def delete_object(key: str) -> None:
    get_minio().remove_object(settings.MINIO_BUCKET, key)
