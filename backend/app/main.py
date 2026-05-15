from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings
from app.routers import auth as auth_router

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

    # Admin seed
    try:
        from app.database import AsyncSessionLocal
        from app.services.auth import seed_admin
        async with AsyncSessionLocal() as db:
            await seed_admin(db)
        log.info("admin.seed.done")
    except Exception as exc:
        log.warning("admin.seed.failed", error=str(exc))

    yield


app = FastAPI(title="OJ API", version="0.1.0", lifespan=lifespan)

app.include_router(auth_router.router, prefix="/api/v1")


@app.get("/api/v1/healthz")
async def healthz():
    return {"status": "ok"}
