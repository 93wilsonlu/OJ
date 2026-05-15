# Implementation Phases

> Execution order follows dependency and risk. Phase 5 (Judge Worker) carries the most
> uncertainty — consider a Docker/isolate spike at the start of Phase 4 in parallel.

---

## Phase 1 — Infrastructure & Skeleton

**Goal:** `docker compose up` starts everything; you can hit a health endpoint.

- `docker-compose.yml` — all 6 services: postgres, redis, minio, api, judge-worker, nginx
- Nginx reverse proxy config
- FastAPI app factory (`main.py`, `config.py`, `database.py`) with `GET /healthz → 200`
- Alembic wired up; all 7 tables migrated in one initial migration
- MinIO bucket creation on startup
- `pyproject.toml` with all deps; `package.json` with all frontend deps

**Verify:** `curl localhost/api/v1/healthz` returns 200; all 6 containers healthy.

---

## Phase 2 — Auth

**Goal:** You can log in and get a token. All role guards work.

- `User` + `RefreshToken` models
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `get_current_user` dep + `require_role` helper
- Admin seed on startup (env vars)
- Frontend: `Login.tsx`, `AuthContext.tsx`, `useAuth.ts`, protected route wrapper

**Verify:** Log in as seeded admin; token refreshes; logout invalidates token; 401 on bad token; 403 on wrong role.

---

## Phase 3 — Problem & Test Case Management

**Goal:** Problem admin can create problems with hidden test cases; no hidden data leaks.

- `Problem` + `TestCase` models
- Full problem CRUD endpoints (problem_admin writes; all roles read)
- `POST /problems/{id}/test-cases` — uploads `input_data` + `expected_output` to MinIO
- Response schemas filter out `is_hidden=True` rows
- Integration test: hidden test case absent from GET response (required success criterion)

**Verify:** Create a problem with 2 visible + 2 hidden test cases; GET response has 0 hidden cases; problem_admin can delete test cases; candidate gets 403 on write.

---

## Phase 4 — Exam Management & Submission Intake

**Goal:** Interviewer can create an exam and assign problems/candidates. Candidate can submit code.

- `Exam` + `ExamAssignment` + `Submission` models
- Exam CRUD + assignment endpoints
- `POST /submissions` — validates assignment, rate limit, `end_time`, uploads to MinIO, enqueues RQ job, returns 202
- `GET /submissions/{id}` + `GET /submissions` (interviewer filter list)
- Frontend: `CandidateDashboard`, `ExamView`, `ProblemEditor` (Monaco + file upload), submit button

**Verify:** Candidate submits → gets `submission_id` + `status=pending` in <500ms; submitting after `end_time` → 403; rate limit blocks second submit within 30s; RQ job appears in queue.

---

## Phase 5 — Judge Worker ⚠️ Highest Risk

**Goal:** Submitted code gets judged by isolate; verdict appears in DB.

- Docker image for judge-worker with isolate built as setuid binary
- `worker.py` (RQ job entry point) + `runner.py` (isolate invocation + result parsing)
- Python 3 runner + C++17 runner (compile → run)
- Verdict computation (first non-AC test case wins), score, `passed_count`
- Idempotency guard on `judge_results` INSERT
- 3-retry with 30/90/270s backoff → `System Error` after exhaustion
- Log upload to MinIO
- Frontend: `SubmissionStatus.tsx` with 2s polling; `VerdictBadge.tsx`; `error_message` on CE/RE

**Verify:** Submit correct Python solution → Accepted; wrong answer → Wrong Answer; infinite loop → TLE; submission record shows final verdict within 60s; retrying a completed job doesn't double-write `judge_results`.

---

## Phase 6 — Reporting, Admin, & Observability

**Goal:** Interviewers see scores; admin manages users; logs/metrics are structured.

- `GET /admin/exams/{id}/results` — per-candidate scorecards
- `GET /admin/exams/{id}/stats` — per-problem pass rate + avg score
- `show_score=false` gate on candidate `GET /submissions/{id}`
- Signed MinIO URL (`code_url`, 1h TTL) for "View Code" button
- Admin CRUD for users (`GET/PATCH/DELETE /admin/users`) with self-lockout
- Frontend: `InterviewerDashboard.tsx` (results table + filters), `AdminDashboard.tsx` (stats), `UserManagement.tsx`
- structlog JSON output + Prometheus `/metrics` endpoint

**Verify:** All 21 success criteria in SPEC.md pass; `docker compose up -d` from scratch boots the full stack with no manual steps.
