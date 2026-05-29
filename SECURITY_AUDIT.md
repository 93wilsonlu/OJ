# Security Audit — OJ Backend

Date: 2026-05-29 · Scope: `backend/app/`, `docker-compose.yml`, `nginx/nginx.conf`, `.env.example`

## Critical

- **C1. No judge sandbox exists** — `queue.py:20` enqueues `worker.judge_submission` and `docker-compose.yml:78-81` runs judge-worker with `SYS_ADMIN` + `seccomp:unconfined`, but no worker module exists. Any flaw in future execution code = root on judge host. Design sandbox (isolate-only privileges, no shell, resource limits, network isolation) before merging worker code.
- **C2. Default `SECRET_KEY="changeme"`** — `config.py:9` defaults the JWT key; `main.py:17` only warns. App can start signing prod tokens with a public key → forged admin tokens. Hard-fail on missing/default key.
- **C3. Refresh tokens stored unhashed, never rotated** — `auth.py:42-73` stores raw UUID in DB, reuses it on refresh. DB leak = 7-day valid tokens; no reuse detection; no "revoke all sessions". Store sha256(secret), rotate on refresh, revoke family on reuse.

## High

- **H1. Problem/test-case IDOR** — ✅ **Fixed.** Read routes (`list_problems`, `get_problem`, `list_test_cases`) now guarded by a `require_roles("problem_admin", "admin", "interviewer")` dependency (`deps.py:require_roles`); candidates get 403 and must use `/exams/{id}/problems`.
- **H2. Exam read IDOR** — ✅ **Fixed.** `get_exam`/`list_exam_problems` now resolve through a `get_scoped_exam` dependency backed by `exam_service.get_exam_for_user`, which 404s candidates without an `ExamAssignment` (no existence leak).
- **H3. Racy submission rate limiter** — `submission.py:47-62` does SELECT-then-INSERT; concurrent requests bypass the 30s guard → queue flooding. Use Redis `SET NX EX 30` or unique index.
- **H4. No rate limiting on `/auth/login`** — no limiter anywhere. Enables credential stuffing. Add per-IP/per-email limits (nginx `limit_req` or slowapi).
- **H5. No size limit on code/test-case uploads** — ✅ **Partially fixed.** `SubmissionCreate.code` capped at 256KB via `Field(max_length=...)` (422 on overflow); test-case uploads read through `_read_capped` (413 over 256KB, no full buffering). **Still TODO:** global request-body size limit (nginx `client_max_body_size`, see L3) and streaming MinIO writes.
- **H6. CORS hard-coded, `allow_methods/headers=["*"]` + credentials** — `main.py:49-55`. Not configurable for prod. Drive origins from config, restrict methods.

## Medium

- **M1. `python-jose==3.3.0`** — affected by CVE-2024-33664 (JWT bomb). Migrate to pyjwt/authlib.
- **M2. `passlib==1.7.4` + `bcrypt==4.1.3` mismatch** — passlib unmaintained, incompatible with bcrypt 4.1+. Use bcrypt directly.
- **M3. Inconsistent 401/403/404** — existence leaks via differing auth-check order (`admin.py` _require_admin vs get_user).
- **M4. Refresh tokens never garbage-collected** — `refresh_tokens` grows unbounded. Add expiry/revoked cleanup job.
- **M5. `seed_admin` swallows all exceptions** — `auth.py:107-110` `except Exception`; should be `except IntegrityError` only.
- **M6. `request.client.host` trusted** — `submission.py:52` records `127.0.0.1` behind nginx; ignores X-Forwarded-For. Use ProxyHeadersMiddleware.
- **M7. No security headers** — no HSTS/CSP/X-Frame-Options/X-Content-Type-Options on API or nginx.
- **M8. `/metrics` publicly exposed** — `nginx.conf:16-19` proxies metrics on public port. Move behind internal port/auth before enabling instrumentator.

## Low

- **L1.** `submission.py:104` swallows queue-enqueue failures silently → submission never judged, no signal. Add logging.
- **L2.** `admin.py:144` password change doesn't revoke that user's refresh tokens.
- **L3.** `nginx.conf` no `client_max_body_size` set (default 1MB breaks uploads, allows repeated 1MB POSTs).
- **L4.** `.env.example` ships `ADMIN_PASSWORD=changeme` — ensure deploy docs force change.
- **L5.** Refresh token in `localStorage` (`AuthContext.tsx:25-68`) — XSS yields 7-day token (compounds C3). Documented tradeoff.
- **L6.** `admin.py:104-105` ILIKE pattern doesn't escape `%`/`_` (UX bug, not injection).
- **L7.** No `npm audit` / `pip audit` in CI.

## Priority order

1. C2 (one-line, catastrophic footgun)
2. ~~H1, H2 (IDOR, small router changes)~~ ✅ done
3. H4, H3 (rate limits, before public deploy)
4. C3 + L2 + L5 (session model rewrite, do once)
5. C1 (judge sandbox — block before enabling worker)
6. H5 (✅ app-level caps done; nginx body limit + MinIO streaming remain), H6, M1, M2, M7, M8 (hardening)
