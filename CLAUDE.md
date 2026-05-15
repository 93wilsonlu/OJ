# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is currently **design-phase only**. The single source file is `G7-Architecture Design.md` — a Traditional-Chinese architecture spec for an online coding-test / interview judging system ("Online Code Test System"). There is no source code, build system, or test suite yet. Do not invent build/lint/test commands; if asked to "run tests" or "build", note that nothing is implemented and ask which component to scaffold first.

## Planned architecture (from `G7-Architecture Design.md`)

The spec describes a sandboxed online judge with a queue-based judging pipeline. When implementing, preserve these boundaries — they exist for security and scalability reasons, not stylistic ones:

- **Web Frontend** — React + Vite. Talks to the API only via REST.
- **Reverse proxy / API gateway** — Nginx in front of the API servers.
- **API Server** — FastAPI + SQLAlchemy. Handles auth, RBAC, problem/exam CRUD, and submission *intake*. **Must never execute candidate code.** On submission it persists a row with status `PENDING` and enqueues a job.
- **Message Queue** — Redis Queue. Decouples submission intake from judging so the API stays responsive under load.
- **Judge Worker** — Standalone Python workers, stateless, horizontally scalable. Consume jobs from Redis, fetch code + test cases, run them in a sandbox, write results back to Postgres.
- **Sandbox Runtime** — Docker container per submission, with CPU / memory / wall-time / process-count / filesystem / network limits. Container is destroyed after each run.
- **Relational DB** — PostgreSQL. Tables: `users`, `problems`, `test_cases`, `exams`, `exam_assignments`, `submissions`, `judge_results`.
- **Object Storage** — Holds candidate source code, test-case input/expected-output files, and execution logs. The DB stores only the storage key, not the blob.

### Roles (RBAC)

Three user roles with distinct permissions; check the spec before broadening any endpoint:

- `candidate` — sees only their own assigned exams, submissions, and results.
- `interviewer` — creates candidate accounts, builds exam sessions, assigns problems, views scores.
- `problem_admin` — creates and maintains problems and test cases (including hidden ones).

### Non-obvious constraints to respect

- **Hidden test cases (`is_hidden=true`) must never reach the frontend** — not in problem detail responses, not in judge-result detail, not in error messages.
- **Submission lifecycle is `pending → judging → completed | failed`** and each submission has a unique ID. A submission must not be double-scored; failed worker runs may be retried but the final verdict is written once.
- **Submit endpoint must return immediately** with the submission ID and `pending` status. The frontend polls (or uses WebSocket) for the final verdict — do not block the HTTP request on judging.
- **Verdicts** to support: `Accepted`, `Wrong Answer`, `Compile Error`, `Runtime Error`, `Time Limit Exceeded`, `Memory Limit Exceeded`, `System Error`.
- **Anti-cheat hooks expected by the spec**: per-user submission rate limiting, IP logging on each submission, full submission history retained.
- **Passwords**: hashed at rest. All API routes except login require auth.

### Submission flow (end-to-end)

1. Candidate submits code via the editor or file upload.
2. API Server validates auth/role, writes the source blob to Object Storage, inserts a `submissions` row with status `PENDING`, and pushes a job to Redis Queue. Returns `submission_id` + `pending`.
3. A Judge Worker pops the job, pulls code + test cases from Object Storage, spawns a sandboxed Docker container per run, executes against each test case in order, captures stdout/stderr/time/memory.
4. Worker compares outputs, computes `passed_count`, `score` (weighted by `score_weight`), and verdict; uploads execution log to Object Storage; inserts a `judge_results` row and flips the submission to `completed` (or `failed` on system error).
5. Frontend polling surfaces the final result.

## Working in this repo

- The spec is the canonical source of truth for behavior, table schemas, and verdict semantics — read the relevant section of `G7-Architecture Design.md` before designing an endpoint or migration.
- The spec is written in Traditional Chinese; preserve Chinese identifiers when quoting it, but write code, comments, and commit messages in English unless the user asks otherwise.
- The file is large (~420KB) because it embeds base64 architecture diagrams at the bottom — read by line range (the prose ends around line 360) rather than loading the whole file.
- No CI, linters, or test runners are configured yet. When scaffolding a component, also propose the matching `make`/`uv`/`npm` scripts rather than assuming they exist.
