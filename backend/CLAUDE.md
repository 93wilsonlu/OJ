# Backend CLAUDE.md

## Stack
- **Python 3.12**, FastAPI (async), SQLAlchemy 2 (asyncio), Alembic, PostgreSQL (asyncpg)
- **Auth**: JWT (HS256, python-jose), bcrypt/passlib; 15-min access tokens + 7-day refresh tokens stored in `refresh_tokens` table
- **Storage**: MinIO (`minio` SDK) — test case files and submission code stored as objects; keys held in DB
- **Judge queue**: Redis + RQ; submissions enqueued to `judge` queue, worker calls `worker.judge_submission`
- **Logging**: structlog
- **Package manager**: `uv`; deps in `pyproject.toml`

## Project layout
```
app/
  main.py          # FastAPI app, lifespan (bucket init + admin seed), CORS
  config.py        # pydantic-settings (DATABASE_URL, REDIS_URL, SECRET_KEY, MINIO_*, ADMIN_*)
  database.py      # async engine, AsyncSessionLocal, Base
  deps.py          # get_current_user (JWT → User)
  models/          # SQLAlchemy ORM models (one file per table)
  schemas/         # Pydantic v2 request/response models
  routers/         # FastAPI routers (thin: validate, call service, serialize)
  services/        # Business logic (auth, problem, exam, submission, admin, queue, storage)
alembic/           # DB migrations
tests/
```

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
`DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET/SECURE`, `ADMIN_EMAIL/PASSWORD/NAME`
