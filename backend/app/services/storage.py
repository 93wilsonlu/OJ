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


def get_object_text(key: str) -> str:
    response = get_minio().get_object(settings.MINIO_BUCKET, key)
    try:
        return response.read().decode("utf-8")
    finally:
        response.close()
        response.release_conn()


def delete_object(key: str) -> None:
    get_minio().remove_object(settings.MINIO_BUCKET, key)


def presigned_get_url(key: str, expires_seconds: int = 3600) -> str:
    from datetime import timedelta
    return get_minio().presigned_get_object(
        settings.MINIO_BUCKET, key, expires=timedelta(seconds=expires_seconds)
    )
