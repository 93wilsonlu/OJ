from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # MinIO bucket
    try:
        from app.services.storage import ensure_bucket
        ensure_bucket()
        log.info("minio.bucket.ready", bucket=settings.MINIO_BUCKET)
    except Exception as exc:
        log.warning("minio.bucket.unavailable", error=str(exc))

    yield


app = FastAPI(title="OJ API", version="0.1.0", lifespan=lifespan)


@app.get("/api/v1/healthz")
async def healthz():
    return {"status": "ok"}
