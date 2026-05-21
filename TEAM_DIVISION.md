# Team Division Plan

> Suggested 5-person division for the Online Code Test System final project.

## Guiding Principle

This project should not be divided only as "frontend / backend / documentation".

The core risks are:

- Role-based permission control
- Hidden test case security
- Asynchronous submission flow
- Judge Worker sandbox execution
- End-to-end integration from exam assignment to verdict result

Therefore, the team should divide work by system responsibility and risk boundary.

---

## Member A — Infrastructure, Database, and Auth Owner

### Responsibilities

- Maintain `docker-compose.yml`
- Maintain Nginx reverse proxy configuration
- Manage environment variables and service startup settings
- Set up PostgreSQL schema and Alembic migrations
- Implement authentication:
  - Login
  - Refresh token
  - Logout
  - `GET /auth/me`
- Implement role guards and current-user dependency
- Implement first admin account seeding from environment variables

### Related Phases

- Phase 1 — Infrastructure & Skeleton
- Phase 2 — Auth
- Supports Phase 7 — User Management API

### Verification

- `docker compose up -d` starts the full stack
- Health endpoint returns `200`
- Seeded admin can log in
- Invalid token returns `401`
- Wrong role returns `403`
- Auth tests pass

---

## Member B — Problem Bank, Test Case, and MinIO Owner

### Responsibilities

- Implement problem CRUD APIs
- Implement test case upload APIs
- Store test case input and expected output in MinIO
- Ensure hidden test cases never leak through API responses
- Implement per-test-case time and memory overrides
- Support Problem Admin workflows
- Coordinate with frontend for problem editor UI data shape

### Related Phases

- Phase 3 — Problem & Test Case Management
- Phase 6 — Problem Editor UI & Test Case Management

### Verification

- Problem Admin can create, update, and delete problems
- Problem Admin can upload visible and hidden test cases
- Candidate cannot create or modify problems
- Candidate API response never includes hidden test cases
- Integration test verifies hidden test case data is absent
- Test case files are stored in MinIO correctly

---

## Member C — Exam, Submission API, and Queue Owner

### Responsibilities

- Implement exam CRUD APIs
- Implement exam assignment APIs
- Implement candidate submission intake
- Validate candidate assignment before accepting submission
- Enforce exam `end_time` server-side
- Enforce submission rate limit
- Store submitted code in MinIO
- Create submission records with `pending` status
- Enqueue judge jobs into RQ
- Implement submission query APIs
- Enforce candidate submission visibility rules

### Related Phases

- Phase 5 — Exam Management & Submission Intake

### Verification

- Interviewer can create exams and assign problems to candidates
- Candidate can submit code only for assigned problems
- `POST /submissions` returns `202` with `pending` status
- `POST /submissions` returns within 500ms
- Submission after `exam.end_time` returns `403`
- Repeated submission within 30 seconds is blocked
- Candidate cannot access another candidate's submission
- RQ job is created after submission

---

## Member D — Judge Worker and Sandbox Owner

This is the highest-risk role and should start early.

### Responsibilities

- Maintain `Dockerfile.worker`
- Install and configure `isolate` inside the judge worker container
- Implement RQ worker job entry point
- Implement Python 3.12 runner
- Implement C++17 compile and run flow
- Execute code inside isolate only
- Apply explicit limits:
  - CPU time
  - Wall time
  - Memory
  - Process count
  - Output size
- Compare actual output with expected output
- Compute verdict:
  - Accepted
  - Wrong Answer
  - Compile Error
  - Runtime Error
  - Time Limit Exceeded
  - Memory Limit Exceeded
  - System Error
- Compute score, passed count, and total count
- Respect per-test-case time and memory overrides
- Upload execution logs to MinIO
- Implement judge result idempotency
- Implement retry behavior and final System Error handling

### Related Phases

- Phase 8 — Judge Worker

### Verification

- Correct Python solution returns Accepted
- Wrong Python solution returns Wrong Answer
- Infinite loop returns Time Limit Exceeded
- C++ compile error returns Compile Error
- Runtime exception returns Runtime Error
- Re-running the same job does not double-write `judge_results`
- Final verdict appears within 60 seconds for normal submissions
- Worker never executes candidate code directly in the API server process

---

## Member E — Frontend, Reporting, and Integration QA Owner

### Responsibilities

- Implement React app shell and routing
- Implement login page and auth context integration
- Implement role-based navigation
- Implement candidate dashboard
- Implement exam view
- Implement code editor and file upload UI
- Implement submission status polling
- Implement verdict display
- Implement user management UI
- Implement interviewer result dashboard
- Implement filtering for submission results
- Implement admin statistics dashboard
- Own end-to-end demo flow and frontend tests

### Related Phases

- Phase 4 — App Shell & Navigation
- Phase 5 — Candidate submission frontend
- Phase 7 — User Management frontend
- Phase 9 — Reporting & Observability frontend

### Verification

- Each role sees the correct navigation after login
- Logout clears session and redirects to login
- Candidate can open assigned exam
- Candidate can write code in editor
- Candidate can upload `.py` or `.cpp` file
- Candidate can submit code and see pending status
- Frontend polls every 2 seconds until final result
- Interviewer can view exam results
- Admin can manage users
- `npm test` passes

---

## Recommended Timeline

## Week 1 — Build Critical Foundations

### Member A

- Finish Docker Compose services
- Finish database setup and migrations
- Finish auth and role guards

### Member B

- Finish problem and test case backend
- Finish MinIO integration for test case files
- Add hidden test case leak tests

### Member C

- Finish exam and assignment backend
- Build submission API skeleton
- Connect submission creation to RQ

### Member D

- Start isolate spike immediately
- Verify Python execution inside isolate
- Verify C++ compile and run inside isolate

### Member E

- Finish login UI
- Finish app shell
- Finish role-based routing
- Start candidate dashboard and exam view

---

## Week 2 — Integration

### Main Goals

- Connect submission API with real judge worker
- Connect frontend candidate flow with backend APIs
- Ensure hidden test cases remain protected
- Produce first full demo flow

### Target Demo Flow

1. Admin logs in.
2. Admin creates users.
3. Problem Admin creates a problem and test cases.
4. Interviewer creates an exam.
5. Interviewer assigns a candidate and problem.
6. Candidate logs in.
7. Candidate opens exam.
8. Candidate writes or uploads code.
9. Candidate submits code.
10. Judge Worker evaluates the submission.
11. Candidate sees verdict.
12. Interviewer sees result.

---

## Final Stabilization

Before final submission, every member should help verify the complete system.

### Required Checks

- `docker compose up -d` starts the full system without manual steps
- Backend tests pass
- Frontend tests pass
- Candidate submission does not block API server
- Hidden test cases do not appear in any API response
- Judge Worker handles AC, WA, CE, RE, and TLE
- Admin cannot delete or demote their own account
- Interviewer cannot create non-candidate accounts
- Candidate cannot access another candidate's submission
- Results and stats are visible to interviewer/admin

---

## Important Coordination Points

### Submission Contract

Member C and Member D must agree on the queue contract early.

Recommended contract:

```text
RQ job payload: submission_id
```

The Judge Worker should use `submission_id` to fetch all required data from the database and MinIO.

### API Contract

Member B, C, and E should keep frontend and backend types aligned:

- Backend Pydantic schemas
- Frontend TypeScript types
- API wrapper return values

### Security Rules

These rules should not be relaxed:

- Never expose hidden test cases through the API
- Never run candidate code inside the API server
- Never judge synchronously inside `POST /submissions`
- Never store plaintext passwords
- Never write duplicate `judge_results` for the same submission

---

## Summary

The most important early decision is to let the Judge Worker owner start immediately.

The project can still progress if some frontend pages are incomplete, but it will fail as a cloud native OJ system if the asynchronous judge pipeline does not work. The team should prioritize:

1. Auth and permissions
2. Problem and hidden test case safety
3. Exam assignment and submission intake
4. Queue-based judge execution
5. Candidate-to-verdict end-to-end flow
