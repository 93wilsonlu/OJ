# Implementation Phases

> Execution order follows dependency and risk. Phase 8 (Judge Worker) carries the most
> uncertainty — consider a Docker/isolate spike at the start of Phase 7 in parallel.

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

## Phase 3 — Problem & Test Case Management (Backend)

**Goal:** Problem admin can create problems with hidden test cases; no hidden data leaks.

- `Problem` + `TestCase` models
- Full problem CRUD endpoints (problem_admin writes; all roles read)
- `POST /problems/{id}/test-cases` — uploads `input_data` + `expected_output` to MinIO
- Response schemas filter out `is_hidden=True` rows
- Integration test: hidden test case absent from GET response (required success criterion)

**Verify:** Create a problem with 2 visible + 2 hidden test cases; GET response has 0 hidden cases; problem_admin can delete test cases; candidate gets 403 on write.

---

## Phase 4 — App Shell & Navigation

**Goal:** Every authenticated page has a working navbar with logout and role-appropriate navigation. The app is navigable end-to-end before domain pages are built.

- `AppShell.tsx` — top navbar wrapping all authenticated routes; replaces per-page layout
- Navbar content: app logo/name, role badge, current user name, logout button
- Role-based nav links:
  - `admin` → User Management
  - `problem_admin` → Problems
  - `interviewer` → Exams (placeholder until Phase 5)
  - `candidate` → My Exams (placeholder until Phase 5)
- `useAuth().logout()` wired to the logout button (calls `POST /auth/logout`, clears token, redirects to `/login`)
- Stub placeholder pages remain for routes not yet implemented; they render inside the shell

**Verify:** Log in as each role → correct nav links appear; logout button clears session and redirects to `/login`; back-button after logout stays on `/login`; 403 page renders inside the shell.

---

## Phase 5 — Exam Management & Submission Intake

**Goal:** Interviewer can create an exam and assign problems/candidates. Candidate can submit code.

- `Exam` + `ExamAssignment` + `Submission` models
- Exam CRUD + assignment endpoints (`POST/PATCH/DELETE /exams`, `POST/DELETE /exams/{id}/assignments`)
- `POST /submissions` — validates assignment, rate limit, `end_time`, uploads to MinIO, enqueues RQ job, returns 202
- `GET /submissions/{id}` + `GET /submissions` (interviewer filter list)
- `GET /exams/{id}/problems` — returns problems assigned to the calling user (candidate: own assignments only; interviewer/admin: all)
- Frontend:
  - `CandidateDashboard` — exam list for candidates; for interviewers adds "New Exam" button and "Manage" link per exam
  - `ExamManagePage` — create/edit exam form (title, description, start/end time, show_score) + assignment management table (add problem + candidate, remove assignments); routes `/exams/new` and `/exams/:examId/manage` (interviewer/admin)
  - `ExamView` — exam detail with problem list, difficulty badges, latest submission verdict per problem; links disabled when exam has ended
  - `ProblemEditor` — Monaco editor split layout: left description panel (40%) + right code editor (60%) + submit button + result panel

**Verify:** Candidate submits → gets `submission_id` + `status=pending` in <500ms; submitting after `end_time` → 403; rate limit blocks second submit within 30s; RQ job appears in queue; interviewer creates exam and assigns problems/candidates via UI.

---

## Phase 6 — Problem Editor UI & Test Case Management

**Goal:** Problem admin can edit problems and manage test cases with per-test-case time/memory overrides through the UI. Interviewers can preview problem details before assigning.

- Backend: add `time_limit_override` (ms, nullable) and `memory_limit_override` (MB, nullable) columns to `TestCase` — inherits problem-level defaults when null
- Backend: expose `PATCH /problems/{id}` and update `POST /problems/{id}/test-cases` to accept overrides; add `name` field to `TestCase`
- Frontend: `/problems/:id` (`ProblemDetailPage`) — problem detail page with:
  - Inline edit form for title, description, difficulty, time limit, memory limit, allowed languages
  - Test case list showing `is_hidden`, `score_weight`, per-case overrides, name
  - Add/edit/delete test case modals
- Frontend: `/problems/:id/view` (`ProblemViewPage`) — read-only problem view for interviewers/admins: title, difficulty badge, time/memory limits, allowed languages, description, input/output format, sample I/O; accessible to `interviewer`, `problem_admin`, `admin`

**Verify:** Edit problem title → change persists on reload; upload a hidden test case with 2× time limit → GET as candidate returns 0 hidden cases; GET as problem_admin returns the case with correct overrides; delete test case removes it from list; interviewer can navigate to `/problems/:id/view` and see description without edit controls.

---

## Phase 7 — User Management

**Goal:** Admin can create, view, edit, and deactivate user accounts through the UI.

- Backend: `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/{id}`, `DELETE /admin/users/{id}` with self-lockout guard
- Frontend: `UserManagement.tsx` — paginated user table, create-user modal (name, email, password, role), edit role/name inline, deactivate button
- Self-lockout prevention: admin cannot delete or demote their own account

**Verify:** Create a new interviewer account; log in as that interviewer; admin cannot delete own account; 403 on non-admin access.

---

## Phase 8 — Judge Worker ⚠️ Highest Risk

**Goal:** Submitted code gets judged by isolate; verdict appears in DB.

- Docker image for judge-worker with isolate built as setuid binary
- `worker.py` (RQ job entry point) + `runner.py` (isolate invocation + result parsing)
- Python 3 runner + C++17 runner (compile → run)
- Verdict computation (first non-AC test case wins), score, `passed_count`; respects per-test-case `time_limit_override` / `memory_limit_override`
- Partial scoring: candidate earns proportional credit for passing k of n test cases (weighted by `score_weight`)
- Idempotency guard on `judge_results` INSERT
- 3-retry with 30/90/270s backoff → `System Error` after exhaustion
- Log upload to MinIO
- Frontend: `SubmissionStatus.tsx` with 2s polling; `VerdictBadge.tsx`; `error_message` on CE/RE

**Verify:** Submit correct Python solution → Accepted; wrong answer → Wrong Answer; infinite loop → TLE; submission record shows final verdict within 60s; retrying a completed job doesn't double-write `judge_results`.

---

## Phase 9 — Reporting & Observability

**Goal:** Interviewers see scores; logs/metrics are structured.

- `GET /admin/exams/{id}/results` — per-candidate scorecards
- `GET /admin/exams/{id}/stats` — per-problem pass rate + avg score
- `show_score=false` gate on candidate `GET /submissions/{id}`
- Signed MinIO URL (`code_url`, 1h TTL) for "View Code" button
- Frontend: `InterviewerDashboard.tsx` (results table + filters), `AdminDashboard.tsx` (stats)
- structlog JSON output + Prometheus `/metrics` endpoint
- Per-problem statistics: pass rate, average solve time, common wrong-answer test case distribution
- Export exam results as CSV (per-candidate scores + verdicts per problem)
- Plagiarism similarity score: token-based diff between submissions within the same exam, flagging suspiciously similar code

**Verify:** All success criteria in SPEC.md pass; `docker compose up -d` from scratch boots the full stack with no manual steps.

---

## Phase 10 — UX Polish & Advanced Features

**Goal:** Elevate the day-to-day experience for all roles with the features most requested after initial launch.

**Problem management:**
- Search/filter bar on the problems list (by title, difficulty, language)
- Problem tags/categories (e.g. "graph", "dp", "string") — tag model, many-to-many, filterable in the list and assignable in the editor
- Markdown + LaTeX rendering for problem descriptions (`react-markdown` + KaTeX)
- Pagination on the problems list (backend `limit`/`offset`; frontend page controls)

**Exam & candidate experience:**
- Scheduled exams with auto-open/close by time (`start_time` / `end_time` enforced server-side; exam not visible before start)
- Email invitations sent to candidates when assigned to an exam
- Countdown timer visible in `ExamView` (time remaining until `end_time`)
- Toast notification when submission verdict arrives instead of requiring the candidate to stay on the status page
- Monaco or CodeMirror editor in `ProblemEditor` for syntax highlighting
- View past submission history per problem (list of prior attempts with verdict and timestamp)
