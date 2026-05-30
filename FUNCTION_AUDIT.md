# Backend Function Audit

Five-axis review of `backend/`. HTTP/service/schema layers are clean; the judge worker + sandbox carry the serious findings.

## 🔴 Critical

- **C1 — Sandbox resource limits not enforced.** ✅ Resolved (`b87ca37`). `services/sandbox.py` now sets per-test `mem_limit`/`memswap_limit`, `pids_limit`, `nano_cpus`, `cap_drop=["ALL"]`, `security_opt=["no-new-privileges"]`, non-root `SANDBOX_USER`, and reads peak memory from the cgroup. (`network_mode="none"` retained.)
- **C2 — Internal exceptions leaked to candidates.** ✅ Resolved (`2f49790`). `worker.py` stores a generic `SYSTEM_ERROR_MESSAGE` (real detail logged server-side); `routers/submission.py:39` gates `error_message` behind `hide_score` like score.
- **C3 — Sync MinIO + bcrypt block the event loop.** ✅ Resolved (`a2126eb`). Storage and bcrypt calls offloaded via `anyio.to_thread.run_sync` (`services/auth.py:38,107`, `services/submission.py:92,142`, `services/problem.py:121-175`).

## 🟠 Important

- **I1 — `delete_exam` 500s on exams with data.** ✅ Resolved (`6955740`). `services/exam.py:114-137` now deletes dependents in FK order (JudgeResult → Submission → ExamAssignment → Exam) before the exam; covered by `test_delete_exam_commits` and `test_delete_exam_cleans_up_dependent_rows`. (Note: orphaned MinIO objects — submission `code_storage_key`, judge `log_storage_key` — are not purged; tracked separately, not part of the 500 fix.)
- **I2 — Submissions accepted before exam start.** ✅ Resolved (`f5fb867`). `services/submission.py:78-81` rejects submissions before `start_time` (403 "Exam has not started") in addition to the `end_time` check.
- **I3 — Default `SECRET_KEY="changeme"` only warns** (`config.py:9`, `main.py:17-21`) → forgeable JWTs. Fail-closed in prod; same for default `minioadmin`.
- **I4 — Judge infra failures misclassified.** `sandbox.py:38-41,68-69`: runtime `images.pull` can hang; any docker error → "Compile Error" with raw text (feeds C2). Container leaks if worker killed mid-run. Fix: pre-pull images, distinguish System Error vs Compile Error, robust cleanup/reaper.
- **I5 — No ownership scoping on exam writes.** ✅ Resolved (`f88c28c`). `services/exam.py:78-88` `get_owned_exam` enforces owner-or-admin scope (403 otherwise); used by exam update/delete in `routers/exam.py:72,86`.

## 🟡 Suggestions

- Dead code: `sandbox.py` unused `import os`, unused `SandboxError`, vestigial `box_id`; `box_dir` is a dict not a dir; empty `app/judge/languages/`.
- Two parallel role guards: `deps.require_roles` vs `auth.require_role` — unify.
- `_run_judge` returns a 7-tuple (`worker.py:37,77`) — use a dataclass.
- `worker.py`/`sandbox.py` style drifts from service layer; magic exit codes 124/137/9.
- bcrypt 72-byte truncation vs 128-char password cap (`schemas/admin.py:13`).
- Unbounded list endpoints (`list_submissions`, `list_problems`, `get_exam_results`).
- `time_used_ms` is wall-clock, not CPU time.

## ✅ Done well

No N+1 (single multi-join queries); IDOR scoping via `get_exam_for_user` (404 not 403); input caps on code/uploads; admin self-protection; JWT pins `HS256` + re-checks `is_active`.

## Remaining work

C1, C2, C3, I1, I2, I5 are resolved (see ✅ above). Still open: **I3** (fail-closed on default `SECRET_KEY`/`minioadmin`) → **I4** (pre-pull images, distinguish System vs Compile Error, container reaper), plus the 🟡 suggestions.
