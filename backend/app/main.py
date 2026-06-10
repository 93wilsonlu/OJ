import warnings
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST

from app.config import settings
from app.logging import configure_logging
from app.observability import prometheus_response_body, readiness_report
from app.routers import admin as admin_router
from app.routers import auth as auth_router
from app.routers import exam as exam_router
from app.routers import internal as internal_router
from app.routers import problem as problem_router
from app.routers import submission as submission_router

configure_logging()
log = structlog.get_logger()

if settings.SECRET_KEY == "changeme":
    warnings.warn(
        "SECRET_KEY is the default 'changeme' — do not use in production",
        stacklevel=1,
    )

if settings.INTERNAL_TOKEN == "changeme-internal":
    warnings.warn(
        "INTERNAL_TOKEN is the default 'changeme-internal' — do not use in production",
        stacklevel=1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(internal_router.router, prefix="/api/v1")


@app.get("/api/v1/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/health")
@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
@app.get("/api/v1/ready")
async def ready(response: Response):
    report = await readiness_report()
    if report["status"] != "ready":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report


@app.get("/metrics")
async def metrics():
    body = await prometheus_response_body()
    return Response(content=body, media_type=CONTENT_TYPE_LATEST)
