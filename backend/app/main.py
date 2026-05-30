import warnings
from contextlib import asynccontextmanager

import anyio
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin as admin_router
from app.routers import auth as auth_router
from app.routers import exam as exam_router
from app.routers import problem as problem_router
from app.routers import submission as submission_router

log = structlog.get_logger()

if settings.SECRET_KEY == "changeme":
    warnings.warn(
        "SECRET_KEY is the default 'changeme' — do not use in production",
        stacklevel=1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # MinIO bucket
    try:
        from app.services.storage import ensure_bucket
        await anyio.to_thread.run_sync(ensure_bucket)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:80", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(problem_router.router, prefix="/api/v1")
app.include_router(exam_router.router, prefix="/api/v1")
app.include_router(submission_router.router, prefix="/api/v1")


@app.get("/api/v1/healthz")
async def healthz():
    return {"status": "ok"}
