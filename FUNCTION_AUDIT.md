# Backend Function Audit

Five-axis review of `backend/`. HTTP/service/schema layers are clean; the judge worker + sandbox carry the serious findings.

## 🔴 Critical

- **C1 — Sandbox resource limits not enforced.** `services/sandbox.py:43-50,95-105`: `mem_limit` hardcoded `"512m"`, `memory_limit_mb` ignored; `mem_used_kb` always 0. No `pids_limit` (fork bomb → host PID exhaustion), no CPU cap, runs as root, writable rootfs. (`network_mode="none"` is good.) Fix: per-test cgroup mem, `pids_limit`, `nano_cpus`, `cap_drop=["ALL"]`, `read_only`, non-root UID.
- **C2 — Internal exceptions leaked to candidates.** `worker.py:71` stores `str(e)`; `routers/submission.py:30-41` `_judge_result_out` hides score but always returns `error_message`. Fix: generic message for System Error, log detail server-side, gate `error_message` like score.
- **C3 — Sync MinIO + bcrypt block the event loop.** `services/storage.py` (all), `submission.py:86,134`, `routers/problem.py:117-118`, `auth.py:18,22` called inline in async handlers → stalls whole API. Fix: `anyio.to_thread.run_sync`.

## 🟠 Important

- **I1 — `delete_exam` 500s on exams with data.** `services/exam.py:99-101` just `db.delete(exam)`; FKs have no cascade (unlike `delete_problem`). Fix: clean up deps or add `ondelete="CASCADE"` + migration.
- **I2 — Submissions accepted before exam start.** `services/submission.py:75-78` only checks `end_time`. Add start check + `end_time > start_time` validator.
- **I3 — Default `SECRET_KEY="changeme"` only warns** (`config.py:9`, `main.py:17-21`) → forgeable JWTs. Fail-closed in prod; same for default `minioadmin`.
- **I4 — Judge infra failures misclassified.** `sandbox.py:38-41,68-69`: runtime `images.pull` can hang; any docker error → "Compile Error" with raw text (feeds C2). Container leaks if worker killed mid-run. Fix: pre-pull images, distinguish System Error vs Compile Error, robust cleanup/reaper.
- **I5 — No ownership scoping on exam writes.** `routers/exam.py:64-86`: any interviewer can edit/delete any exam. Decide intentional vs scope by `created_by`.

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

## Suggested order

C1 → C3 → C2 → I1/I2 → I3.
