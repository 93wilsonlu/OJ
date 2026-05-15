# Spec: Online Code Test System (OJ)

> Source of truth for implementation. All architectural decisions reference `G7-Architecture Design.md`.
> Code and comments in English; Chinese identifiers preserved when quoting the spec.

---

## Objective

Build a sandboxed online judge for technical interviews. Four actor roles:

- **Admin** — manages all user accounts and roles. Seeded via environment variable at first boot.
- **Interviewer** — creates candidate accounts, builds exam sessions, assigns problems, reviews scores.
- **Problem Admin** — creates and maintains problems and test cases (including hidden ones).
- **Candidate** — takes assigned exams, writes/uploads code, sees their own results.

**Success looks like:** a candidate can log in, open an assigned exam, write Python or C++ code in a browser editor, submit, and see a verdict within 60 seconds — without any of this ever blocking the API server or exposing hidden test cases.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, TypeScript, TailwindCSS |
| Code editor | Monaco Editor |
| API Server | FastAPI 0.111, Python 3.12, SQLAlchemy 2.0 (async) |
| Auth | JWT (access + refresh tokens), bcrypt for password hashing |
| Message Queue | Redis 7 + RQ (Redis Queue) |
| Database | PostgreSQL 16 |
| Object Storage | MinIO (S3-compatible, self-hosted) |
| Sandbox | **isolate** (Linux namespaces + cgroups, setuid binary inside judge container) |
| Reverse proxy | Nginx |
| Deployment | Docker Compose (single-machine) |
| Frontend tests | Vitest + React Testing Library |
| Backend tests | pytest + pytest-asyncio + httpx |

**Supported judge languages at launch:** Python 3.12, C++17 (g++13).

---

## Commands

All commands run from the repo root unless noted.

```bash
# Start full stack (detached)
docker compose up -d

# Start with rebuild
docker compose up -d --build

# Stop everything
docker compose down

# --- Backend (run inside /backend or via compose exec) ---
# Install deps
uv sync

# Run API server (dev, with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run RQ worker
rq worker --with-scheduler

# Apply migrations
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "<message>"

# Run backend tests
pytest -x -v

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Lint + format
ruff check . && ruff format --check .

# --- Frontend (run inside /frontend) ---
# Install deps
npm install

# Dev server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm run coverage

# Lint
npm run lint
```

---

## Project Structure

```
/
├── docker-compose.yml          # Full stack orchestration
├── nginx/
│   └── nginx.conf              # Reverse proxy config
│
├── backend/
│   ├── pyproject.toml          # uv / dependencies
│   ├── alembic/                # DB migrations
│   │   └── versions/
│   ├── app/
│   │   ├── main.py             # FastAPI app factory
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   ├── database.py         # Async SQLAlchemy engine + session
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── refresh_token.py
│   │   │   ├── problem.py
│   │   │   ├── test_case.py
│   │   │   ├── exam.py
│   │   │   ├── exam_assignment.py
│   │   │   ├── submission.py
│   │   │   └── judge_result.py
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   │   ├── auth.py
│   │   │   ├── problem.py
│   │   │   ├── exam.py
│   │   │   ├── submission.py
│   │   │   └── judge_result.py
│   │   ├── routers/            # FastAPI routers (one per domain)
│   │   │   ├── auth.py
│   │   │   ├── problems.py
│   │   │   ├── exams.py
│   │   │   ├── submissions.py
│   │   │   └── admin.py
│   │   ├── deps.py             # FastAPI dependencies: get_current_user, get_db
│   │   ├── services/           # Business logic (no HTTP awareness)
│   │   │   ├── auth.py         # login, refresh, logout, require_role
│   │   │   ├── storage.py      # MinIO client wrapper
│   │   │   └── queue.py        # RQ enqueue helpers
│   │   └── judge/              # Judge worker process
│   │       ├── worker.py       # RQ job entry point
│   │       ├── runner.py       # isolate invocation + result parsing
│   │       └── languages/
│   │           ├── python.py
│   │           └── cpp.py
│   └── tests/
│       ├── conftest.py         # Fixtures: test DB, async client
│       ├── test_auth.py
│       ├── test_problems.py
│       ├── test_submissions.py
│       └── test_judge_worker.py
│
└── frontend/
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── api/                # Typed fetch wrappers (one per domain)
    │   │   ├── auth.ts
    │   │   ├── problems.ts
    │   │   ├── exams.ts
    │   │   └── submissions.ts
    │   ├── components/         # Reusable UI components
    │   │   ├── CodeEditor.tsx  # Monaco wrapper
    │   │   └── VerdictBadge.tsx
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   ├── RoleHome.tsx            # Role-based redirect: / → role's default page
    │   │   ├── NotFound.tsx            # 404 — unknown route
    │   │   ├── ErrorPage.tsx           # Generic error display (403, 500, network)
    │   │   ├── CandidateDashboard.tsx
    │   │   ├── ExamView.tsx            # Problem list for one exam
    │   │   ├── ProblemEditor.tsx       # Code editor + submission
    │   │   ├── SubmissionStatus.tsx    # Polling result page
    │   │   ├── InterviewerDashboard.tsx
    │   │   ├── AdminDashboard.tsx      # Exam results + stats
    │   │   └── UserManagement.tsx      # [admin] list, create, edit, delete users
    │   ├── contexts/
    │   │   └── AuthContext.tsx      # Access token (memory) + user state
    │   ├── hooks/
    │   │   ├── useAuth.ts           # Login, logout, refresh helpers
    │   │   └── useSubmissionPoller.ts  # Polls GET /submissions/{id}
    │   └── types/              # Shared TypeScript types (mirrors schemas/)
    └── tests/
        ├── setup.ts
        ├── auth.test.tsx
        └── submission.test.tsx
```

---

## Database Schema

All tables use UUID primary keys. `created_at` / `updated_at` are `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

### users
```sql
user_id       UUID PK
name          TEXT NOT NULL
email         TEXT NOT NULL UNIQUE
password_hash TEXT NOT NULL
role          TEXT NOT NULL CHECK (role IN ('admin','interviewer','problem_admin','candidate'))
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
```

### refresh_tokens
```sql
token_id    UUID PK DEFAULT gen_random_uuid()
user_id     UUID FK users.user_id ON DELETE CASCADE
expires_at  TIMESTAMPTZ NOT NULL
revoked     BOOLEAN NOT NULL DEFAULT FALSE
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### problems
```sql
problem_id     UUID PK
title          TEXT NOT NULL
description    TEXT NOT NULL
input_format   TEXT
output_format  TEXT
sample_input   TEXT            -- shown to candidate; not hidden
sample_output  TEXT            -- shown to candidate; not hidden
difficulty     TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard'))
time_limit     INTEGER NOT NULL  -- milliseconds
memory_limit   INTEGER NOT NULL  -- megabytes
allowed_langs  TEXT[] NOT NULL   -- e.g. ['python3','cpp17']
created_by     UUID FK users.user_id
created_at     TIMESTAMPTZ
```

### test_cases
```sql
testcase_id           UUID PK
problem_id            UUID FK problems.problem_id
input_data_key        TEXT NOT NULL   -- MinIO object key
expected_output_key   TEXT NOT NULL   -- MinIO object key
is_hidden             BOOLEAN NOT NULL DEFAULT TRUE
score_weight          NUMERIC(5,2) NOT NULL DEFAULT 1.0
```

### exams
```sql
exam_id       UUID PK
title         TEXT NOT NULL
description   TEXT
start_time    TIMESTAMPTZ NOT NULL
end_time      TIMESTAMPTZ NOT NULL
show_score    BOOLEAN NOT NULL DEFAULT FALSE
created_by    UUID FK users.user_id
created_at    TIMESTAMPTZ
```

### exam_assignments
```sql
assignment_id       UUID PK
exam_id             UUID FK exams.exam_id
candidate_id        UUID FK users.user_id
problem_id          UUID FK problems.problem_id
assigned_difficulty TEXT    -- override difficulty for this specific candidate, may be NULL
created_at          TIMESTAMPTZ
UNIQUE (exam_id, candidate_id, problem_id)
```

### submissions
```sql
submission_id    UUID PK
exam_id          UUID FK exams.exam_id
problem_id       UUID FK problems.problem_id
candidate_id     UUID FK users.user_id
language         TEXT NOT NULL CHECK (language IN ('python3','cpp17'))  -- candidate-selected
code_storage_key TEXT NOT NULL   -- MinIO object key
status           TEXT NOT NULL CHECK (status IN ('pending','judging','completed','failed'))
ip_address       INET NOT NULL
submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### judge_results
```sql
result_id       UUID PK
submission_id   UUID FK submissions.submission_id UNIQUE
verdict         TEXT NOT NULL CHECK (verdict IN ('Accepted','Wrong Answer','Compile Error',
                'Runtime Error','Time Limit Exceeded','Memory Limit Exceeded','System Error'))
score           NUMERIC(6,2) NOT NULL
passed_count    INTEGER NOT NULL
total_count     INTEGER NOT NULL
execution_time  INTEGER   -- ms, NULL on compile error
memory_usage    INTEGER   -- MB, NULL on compile error
error_message   TEXT      -- compile stderr or first runtime exception; NULL if Accepted/WA
log_storage_key TEXT      -- MinIO key for full execution log; may be NULL
judged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

---

## API Endpoints

Base path: `/api/v1`. All endpoints except `/auth/login` require `Authorization: Bearer <token>`.

### Auth
```
POST   /auth/login          body: {email, password}
                            → {access_token, refresh_token, user: {user_id, name, email, role}}
POST   /auth/refresh        body: {refresh_token}    → {access_token}
POST   /auth/logout         body: {refresh_token}    → 204 (invalidates refresh token)
GET    /auth/me             header: Bearer token     → {user_id, name, email, role}
```

**Token details:**
- Access token: JWT, HS256, signed with `SECRET_KEY` from env, **15-minute expiry**. Payload: `{sub: user_id, role, exp}`.
- Refresh token: opaque UUID stored in a `refresh_tokens` table `(token_id UUID PK, user_id FK, expires_at TIMESTAMPTZ, revoked BOOLEAN DEFAULT FALSE)`. Expiry: **7 days**. Logout sets `revoked=TRUE`.
- `POST /auth/refresh` checks the DB that the token exists, is not revoked, and is not expired.

**`get_current_user` dependency (used by every protected router):**
```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

**RBAC enforcement pattern** — a reusable helper, called at the top of each service function:
```python
def require_role(user: User, *allowed: str) -> None:
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
```
Never put role checks in routers — always in the service layer so tests can call services directly.

**Frontend auth state:**
- On login: store `access_token` in memory (React context), `refresh_token` in `localStorage`.
- On page load: if `refresh_token` exists in `localStorage`, call `POST /auth/refresh` to recover a new access token before rendering protected routes.
- On 401 response: auto-call refresh once, retry original request; if refresh also fails, redirect to `/login`.
- Auth context shape: `{ user: {user_id, name, email, role} | null, accessToken: string | null }`.
- File: `src/contexts/AuthContext.tsx` + `src/hooks/useAuth.ts`.

### Problems (problem_admin only for write, all roles read)
```
GET    /problems                          → paginated list (no hidden test cases)
POST   /problems                          → create problem         [problem_admin]
GET    /problems/{problem_id}             → problem detail (no hidden test cases)
PATCH  /problems/{problem_id}             → update problem         [problem_admin]
DELETE /problems/{problem_id}             → soft-delete            [problem_admin]

POST   /problems/{problem_id}/test-cases  → add test case          [problem_admin]
DELETE /problems/{problem_id}/test-cases/{testcase_id}             [problem_admin]
```

### Exams (interviewer only for write)
```
GET    /exams                             → list (filtered by role)
POST   /exams                             → create exam            [interviewer]
GET    /exams/{exam_id}                   → exam detail + problems
PATCH  /exams/{exam_id}                   → update exam            [interviewer]

POST   /exams/{exam_id}/assignments       body: {candidate_id, problem_id}  [interviewer]
DELETE /exams/{exam_id}/assignments/{assignment_id}                         [interviewer]
```

### Submissions
```
POST   /submissions
         body (JSON):      {exam_id, problem_id, language, code: string}
         body (multipart): {exam_id, problem_id, language, file: <upload>}
         → 202 {submission_id, status: "pending"}

GET    /submissions/{submission_id}
         candidate: own submissions only (403 otherwise)
         interviewer: any submission
         → {submission_id, exam_id, problem_id, candidate_id, language, status,
            submitted_at, ip_address,
            code_url: <signed MinIO URL, 1h TTL>,   ← "View Code" button
            judge_result?: {verdict, score, passed_count, total_count,
                            execution_time, memory_usage, error_message,
                            judged_at}
           }
         NOTE: if exam.show_score=false and requester is candidate,
               omit score, passed_count from judge_result response.

GET    /submissions
         [interviewer only]
         query params:
           exam_id          UUID     filter by exam
           candidate_id     UUID     filter by candidate
           candidate_name   TEXT     partial name match (ILIKE)
           problem_id       UUID     filter by problem
           status           TEXT     pending|judging|completed|failed
           verdict          TEXT     Accepted|Wrong Answer|... (filters on judge_results)
           score_min        NUMERIC  inclusive lower bound on judge_results.score
           score_max        NUMERIC  inclusive upper bound on judge_results.score
           submitted_after  ISO8601  inclusive
           submitted_before ISO8601  inclusive
           page             INT      default 1
           page_size        INT      default 20, max 100
         → paginated list of submissions (same shape as GET /submissions/{id})
```

### Admin / Reporting
```
GET    /admin/exams/{exam_id}/results
         [interviewer, admin]
         → [{candidate_id, name, email,
             problems: [{problem_id, title, best_score, submission_count,
                         last_verdict, last_submitted_at}],
             total_score}]

GET    /admin/exams/{exam_id}/stats
         [interviewer, admin]
         → {exam_id, title, candidate_count, total_submissions,
            problems: [{problem_id, title,
                        submission_count,
                        accepted_count,
                        pass_rate: float,           ← accepted / unique candidates attempted
                        avg_score: float,
                        avg_execution_time_ms: int}]}
```

### User Management
```
POST   /admin/users
         [interviewer, admin]
         interviewer: may only set role="candidate"
         admin:       may set any role
         body: {name, email, password, role}
         → {user_id, name, email, role, created_at}

GET    /admin/users
         [admin only]
         query: role, name (partial), page, page_size
         → paginated list of {user_id, name, email, role, created_at}

GET    /admin/users/{user_id}
         [admin only]
         → {user_id, name, email, role, created_at, updated_at}

PATCH  /admin/users/{user_id}
         [admin only]
         body: {role?, name?, email?}   ← any subset
         constraint: admin cannot change their own role (prevent lockout)
         → updated user object

DELETE /admin/users/{user_id}
         [admin only]
         constraint: admin cannot delete themselves
         → 204
```

**Admin seed:** The first admin account is created from environment variables at startup if no `admin` role user exists:
```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong secret>
ADMIN_NAME=System Admin
```
This runs as an `on_startup` hook in `app/main.py`. If an admin already exists, the hook is a no-op.

---

## Frontend Routes

| Path | Component | Guard | Notes |
|---|---|---|---|
| `/login` | `Login.tsx` | public | Redirects to `/` if already authenticated |
| `/` | `RoleHome.tsx` | auth | Redirects to role's default page (see below) |
| `/dashboard` | `CandidateDashboard.tsx` | candidate | Lists assigned exams |
| `/exams/:examId` | `ExamView.tsx` | candidate | Problem list for one exam |
| `/exams/:examId/problems/:problemId` | `ProblemEditor.tsx` | candidate | Monaco editor + submit |
| `/submissions/:submissionId` | `SubmissionStatus.tsx` | candidate | Polls for verdict |
| `/interviewer` | `InterviewerDashboard.tsx` | interviewer | Exam management |
| `/admin` | `AdminDashboard.tsx` | interviewer, admin | Exam results + stats |
| `/admin/users` | `UserManagement.tsx` | admin | User CRUD |
| `*` | `NotFound.tsx` | public | 404 for any unmatched route |

**Role-based redirect from `/`:**
- `candidate` → `/dashboard`
- `interviewer` → `/interviewer`
- `problem_admin` → `/interviewer` (same view, write access scoped by API)
- `admin` → `/admin/users`

**Error states (rendered by `ErrorPage.tsx`):**
- `403` — Forbidden (wrong role for this route)
- `404` — Shown by `NotFound.tsx` (dedicated page, not ErrorPage)
- `500` / network — Unexpected API failure

## Code Style

### Backend (Python)

```python
# Routers are thin — delegate to services
@router.post("/submissions", response_model=SubmissionOut, status_code=202)
async def create_submission(
    body: SubmissionIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionOut:
    _require_role(current_user, "candidate")
    return await submissions_service.create(db, current_user, body)
```

- `ruff` for linting and formatting; line length 100.
- Async everywhere in routers and services (`async def`, `await`).
- Pydantic v2 schemas; never expose ORM models directly in responses.
- Hidden test cases: never include `is_hidden=True` rows in any response schema.
- Services return domain objects or raise `HTTPException`; no `Response` objects in services.
- Environment variables via `pydantic-settings` `Settings` class; no `os.environ` calls outside `config.py`.

### Frontend (TypeScript)

```tsx
// Hooks encapsulate side-effects; components stay declarative
function ProblemEditor({ submissionId }: { submissionId: string }) {
  const { verdict, isPending } = useSubmissionPoller(submissionId);
  return isPending ? <Spinner /> : <VerdictBadge verdict={verdict} />;
}
```

- Strict TypeScript (`"strict": true`).
- Types in `src/types/` mirror backend Pydantic schemas exactly.
- `fetch` wrappers in `src/api/` — no raw `fetch` calls in components.
- Polling interval: 2 seconds, stops on `completed` or `failed` status.
- Hidden test cases: never render test case inputs/outputs that arrive from the API in problem detail views (only examples explicitly marked non-hidden come back from the API anyway).

---

## Testing Strategy

### Backend — pytest

- **Unit tests** — service logic in isolation (mock DB session with `AsyncMock`).
- **Integration tests** — full request/response via `httpx.AsyncClient` against a real test PostgreSQL instance (separate DB, migrations applied in fixtures).
- **Judge worker tests** — mock isolate subprocess calls; test verdict computation and score logic directly.
- Coverage target: **80% line coverage** on `app/` excluding migrations.
- Run: `pytest -x -v --cov=app`

Key test cases required:
- `POST /submissions` returns 202 with `submission_id` and `status=pending` without waiting for judge
- Hidden test cases are absent from all API responses
- Candidate cannot access another candidate's submission
- Double-scoring prevention: judge writes result exactly once per submission

### Frontend — Vitest

- **Unit tests** — hooks (especially `useSubmissionPoller`), API wrappers.
- **Component tests** — React Testing Library; test behavior not markup.
- No E2E tests in v1.
- Coverage target: **70% line coverage** on `src/`.
- Run: `npm test`

---

## Submission Flow (Implementation Reference)

```
Candidate POST /submissions
    │
    ▼
API Server:
  1. Validate auth + role = "candidate"
  2. Verify assignment exists for (candidate, exam, problem)
  3. Check rate limit (max 1 submission per 30s per candidate per problem)
  4. Upload code blob to MinIO → code_storage_key
  5. INSERT submissions (status=PENDING, ip_address=request.client.host)
  6. rq.enqueue(judge_job, submission_id)
  7. Return 202 {submission_id, status: "pending"}
    │
    ▼ (async)
Judge Worker:
  1. UPDATE submission SET status=JUDGING
  2. Fetch code from MinIO, write to isolate box directory
  3. Compile if needed (C++17: g++ -O2 -std=c++17)
     → on compile failure: set error_message=stderr, verdict=Compile Error, skip to step 7
  4. Fetch all test_cases for problem (ordered, hidden included)
  5. For each test_case:
     a. Write input to isolate box stdin file
     b. Run: isolate --box-id=<N> --mem=<limit> --time=<limit> --wall-time=<limit+2>
                     --processes=32 --stdin=input --stdout=actual.out --stderr=err.out
                     --run -- <compiled_binary or python3 solution.py>
     c. Read isolate exit status (OK / TO / MO / RE / SG / XX)
     d. Compare actual.out to expected_output (exact match, trailing whitespace stripped)
  6. Compute verdict (first non-AC test case verdict wins), score, passed_count
     Collect error_message from err.out of failing test case (truncated to 4KB)
  7. Upload full stderr/stdout log to MinIO → log_storage_key
  8. INSERT judge_results (check for existing row first — idempotency guard)
  9. UPDATE submission SET status=COMPLETED (or FAILED on system error)
  On RQ job failure: retry up to 3 times with exponential backoff (30s, 90s, 270s).
  After 3 failures: set submission.status=FAILED, judge_results.verdict=System Error.
```

**isolate limits per run:**
- Memory: `problem.memory_limit` MB (cgroup hard limit)
- CPU time: `problem.time_limit` ms (isolate `--time` flag, user+system)
- Wall time: `problem.time_limit` ms + 2000ms grace (isolate `--wall-time`)
- Processes: max 32 (`--processes`)
- Output size: 64 MB (`--fsize`)
- Network: none (isolate default — no network namespace access)

**isolate worker container requirements (docker-compose):**
```yaml
judge-worker:
  cap_add: [SYS_ADMIN]
  security_opt: [seccomp:unconfined]
  # isolate is installed at image build time as a setuid binary
```

---

## Observability

**Structured logging** — every service uses Python `structlog` (JSON output). Required fields on every log line: `timestamp`, `level`, `service` (`api` or `judge`), `submission_id` (where applicable), `candidate_id` (where applicable).

Mandatory log events:
| Event | Level | Service |
|---|---|---|
| Request received (method, path, status, latency_ms) | INFO | api |
| Submission enqueued | INFO | api |
| Judge job started (submission_id, language) | INFO | judge |
| Compile error (submission_id, stderr snippet) | WARNING | judge |
| Test case result (submission_id, testcase_id, verdict, time_ms, mem_mb) | INFO | judge |
| Judge job completed (submission_id, verdict, score) | INFO | judge |
| Judge job failed after retries (submission_id, error) | ERROR | judge |
| RQ queue depth | INFO | judge (every 60s) |

**Metrics** — expose `GET /metrics` (Prometheus format) from the API server via `prometheus-fastapi-instrumentator`. Worker emits metrics via Redis-backed gauge updated after each job.

Required metrics:
- `http_requests_total` (method, path, status)
- `http_request_duration_seconds` (histogram)
- `rq_queue_length` (gauge)
- `judge_execution_seconds` (histogram, by language)
- `judge_worker_errors_total` (counter)
- `db_query_duration_seconds` (histogram)

**Alerts** (document thresholds; wiring to alerting tool is out of v1 scope):
- `rq_queue_length > 50` for > 5 minutes → backlog alert
- `judge_worker_errors_total` rate > 5/min → worker instability alert
- `http_request_duration_seconds p95 > 1s` → API latency alert

---

## Boundaries

**Always:**
- Run `pytest -x` before marking any backend task complete
- Run `npm test` before marking any frontend task complete
- Apply `alembic upgrade head` after any model change — never modify the DB directly
- Log `submission_id` and `candidate_id` on every judge job start/end
- Return 202 (not 200) from `POST /submissions` — it is async by definition

**Ask first:**
- Adding a new Python or C++ runtime version to the judge
- Changing the `submissions.status` state machine (new states or transitions)
- Adding a new database index (needs query analysis first)
- Any change to the isolate sandbox resource limits (time, memory, process count)
- Enabling WebSocket support (requires Nginx config change + frontend changes)

**Never:**
- Allow an admin to change or delete their own account via the API (prevent self-lockout)
- Allow interviewer or problem_admin to create accounts with role other than `candidate`
- Return `is_hidden=True` test cases in any API response (any role, any endpoint)
- Execute candidate code inside the API server process
- Store plaintext passwords — always bcrypt
- Skip the RQ queue and judge synchronously inside a request handler
- Double-write a `judge_results` row — check existence before INSERT
- Accept a submission when `NOW() > exam.end_time` — reject with 403 before any DB write
- Commit secrets or `.env` files
- Run candidate code outside isolate (no bare `subprocess.run` on user code, ever)
- Run isolate without explicit `--mem`, `--time`, `--wall-time`, and `--processes` flags

---

## Success Criteria

- [ ] Candidate can log in, see assigned exam, write Python or C++ code in Monaco editor, and submit
- [ ] Candidate can upload a `.py` or `.cpp` file as an alternative to typing in the editor
- [ ] Problem detail shows `sample_input` / `sample_output` but never hidden test case content
- [ ] `POST /submissions` returns 202 within 500ms regardless of queue depth
- [ ] `POST /submissions` returns 403 when `NOW() > exam.end_time`
- [ ] Frontend polls every 2s and shows final verdict (including `error_message` on CE/RE) within 60s
- [ ] "View Code" button on submission record opens code via signed URL
- [ ] When `exam.show_score=false`, candidate's `GET /submissions/{id}` omits `score` and `passed_count`
- [ ] Hidden test cases never appear in any API response (verified by integration test)
- [ ] Candidate cannot read another candidate's submission (403 enforced)
- [ ] Verdict is written exactly once per submission even if worker retries (idempotency test passes)
- [ ] Worker retries up to 3 times on system error; submission flips to `failed` after exhaustion
- [ ] Interviewer submission list supports filtering by candidate name, problem, status, score range, and time range
- [ ] `GET /admin/exams/{id}/stats` returns per-problem pass rate and avg score
- [ ] Structured JSON logs emitted by API and judge worker; `submission_id` present on all judge log lines
- [ ] `GET /metrics` returns Prometheus metrics including queue length and judge execution histogram
- [ ] Admin can list all users, change any user's role, and delete users via the web UI
- [ ] Admin cannot change or delete their own account (blocked with 403)
- [ ] Interviewer creating a user via `POST /admin/users` with role ≠ "candidate" is rejected (403)
- [ ] First admin account is seeded automatically from env vars on first boot
- [ ] `docker compose up -d` starts the full stack with no manual steps

---

## Decisions

1. **Exam `end_time` is enforced server-side.** `POST /submissions` must reject (HTTP 403) any submission where `NOW() > exam.end_time`. The API server checks this before writing to the DB or enqueuing the job. The frontend should also disable the submit button and show a "Exam has ended" message once `end_time` passes, but the server check is the authoritative gate.

2. **File upload is required in v1.** `POST /submissions` accepts either `code` (raw string from Monaco) or a file upload (`multipart/form-data`). The candidate must also select the language when uploading a file. Both paths write the source to MinIO and produce the same submission record.

3. **Interviewer dashboard uses manual refresh.** No WebSocket or polling on the interviewer side. A "Refresh" button re-fetches `GET /admin/exams/{exam_id}/results`. No open questions remain.
