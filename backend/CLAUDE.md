# Backend CLAUDE.md

## Stack
- **Python 3.12**, FastAPI (async), SQLAlchemy 2 (asyncio), Alembic, PostgreSQL (asyncpg)
- **Auth**: JWT (HS256, python-jose), bcrypt/passlib; 15-min access tokens + 7-day refresh tokens stored in `refresh_tokens` table
- **Storage**: GCS (google-cloud-storage) — test case files and submission code stored as GCS objects; keys held in DB
- **Judge queue**: GCP Pub/Sub — submissions published as full message dicts (include language, code key, problem config, test case keys); worker subscribes and POSTs results back via HTTP webhook
- **Logging**: structlog
- **Package manager**: `uv`; deps in `pyproject.toml`

## Project layout
```
app/
  main.py          # FastAPI app, lifespan (bucket init + admin seed), CORS
  config.py        # pydantic-settings (DATABASE_URL, REDIS_URL, SECRET_KEY, GCS_*, PUBSUB_*, ADMIN_*, CALLBACK_URL, INTERNAL_TOKEN)
  database.py      # async engine, AsyncSessionLocal, Base
  deps.py          # get_current_user (JWT → User)
  models/          # SQLAlchemy ORM models (one file per table)
  schemas/         # Pydantic v2 request/response models
  routers/         # FastAPI routers (thin: validate, call service, serialize)
  services/        # Business logic (auth, problem, exam, submission, admin, queue, storage)
alembic/           # DB migrations
tests/
```

## Judge worker architecture

The worker (`worker.py`) runs as a separate process (GKE in production, `docker-compose worker` service locally).

**Worker dependencies (NO PostgreSQL):**
- GCP Pub/Sub — subscribe to judge and custom-run topics
- GCS — read submission code and test case files
- Redis — store/retrieve custom run state
- HTTP — POST results to `CALLBACK_URL` (API)

**Judge flow:**
1. Worker receives Pub/Sub message with full job data (submission_id, language, code_storage_key, problem limits, test case GCS keys)
2. Worker POSTs `POST {CALLBACK_URL}/api/v1/internal/judge-start` (best-effort, sets status=judging)
3. Worker executes code in gVisor sandbox
4. Worker POSTs `POST {CALLBACK_URL}/api/v1/internal/judge-result` with result (3 retries: 1s, 2s, 4s)
5. API writes JudgeResult + updates submission status

**Custom run flow:**
1. API stores run payload in Redis (includes problem time_limit, memory_limit)
2. Worker reads from Redis, runs code, writes result back to Redis

**Stuck submission cleanup:**
- Worker (or k8s CronJob) POSTs `POST {CALLBACK_URL}/api/v1/internal/mark-stuck`
- API scans submissions stuck in "judging" longer than `STUCK_SUBMISSION_SECONDS` and marks failed

**Local vs cloud config:**
- `CALLBACK_URL=http://api:8000` in docker-compose (local)
- `CALLBACK_URL=https://your-domain.com` in k8s secret (cloud)
- `INTERNAL_TOKEN` — shared secret for all `/internal/*` endpoints

## API prefix
All routes are under `/api/v1`.

## Roles
`admin` | `interviewer` | `problem_admin` | `candidate`

- `require_role(user, *roles)` in `services/auth.py` raises 403 if user's role isn't in the allowed set
- `get_current_user` in `deps.py` raises 401 for invalid/expired tokens

## Key route groups
| Router | Prefix | Write roles |
|--------|--------|-------------|
| auth | `/auth` | public (login/refresh/logout) |
| admin | `/admin` | admin only (via service-layer check) |
| problems | `/problems` | `problem_admin`, `admin` |
| exams | `/exams` | `interviewer`, `admin` |
| submissions | `/submissions` | create: `candidate` only |

## Data model relationships
- `Exam` → `ExamAssignment` (exam × candidate × problem, unique triple)
- `Submission` → `JudgeResult` (1-to-1, unique on `submission_id`)
- `Problem` → `TestCase` (test cases stored as MinIO objects; keys in `input_data_key` / `expected_output_key`)
- `Submission.code_storage_key` → MinIO object

## Score visibility
`Exam.show_score` controls whether candidates see `score` and `passed_count` in `JudgeResult`. Interviewers always see full results.

## Dev commands
```bash
uv run uvicorn app.main:app --reload   # dev server
uv run alembic upgrade head            # run migrations
uv run pytest                          # tests
uv run ruff check .                    # lint
```

## Testing
pytest-asyncio with `asyncio_mode = "auto"`. Tests in `tests/`.

## Environment variables (`.env`)
`DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `GCS_BUCKET`, `GCS_PROJECT`, `PUBSUB_JUDGE_TOPIC`, `PUBSUB_RUN_TOPIC`, `PUBSUB_JUDGE_SUBSCRIPTION`, `PUBSUB_RUN_SUBSCRIPTION`, `ADMIN_EMAIL/PASSWORD/NAME`, `CALLBACK_URL`, `INTERNAL_TOKEN`
