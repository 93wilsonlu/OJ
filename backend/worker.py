import asyncio
import json
import random
import sys
import threading
import time
import traceback
import uuid
from types import SimpleNamespace

import httpx
import redis
import structlog
from google.cloud import pubsub_v1

from app.config import settings
from app.logging import configure_logging
from app.observability import record_judge_result, record_stuck_submissions, record_worker_heartbeat
from app.services import custom_run, storage
from app.services.sandbox import (
    cleanup_box,
    compile_code,
    init_box,
    run_custom_input,
    run_test_case,
)

configure_logging()
logger = structlog.get_logger(__name__)

SYSTEM_ERROR_MESSAGE = (
    "An internal error occurred while judging this submission. "
    "Please contact the administrator."
)

_worker_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_loop() -> asyncio.AbstractEventLoop:
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)
    return _worker_loop


async def _post_webhook(url: str, payload: dict) -> None:
    """POST to an internal endpoint with up to 3 retries (1s, 2s, 4s backoff)."""
    delays = [1, 2, 4]
    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=30) as client:
        for i, delay in enumerate(delays):
            try:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={"X-Internal-Token": settings.INTERNAL_TOKEN},
                )
                resp.raise_for_status()
                return
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "worker.webhook.failed",
                    url=url,
                    attempt=i + 1,
                    error=str(exc),
                )
                if i < len(delays) - 1:
                    await asyncio.sleep(delay)
    raise last_exc or RuntimeError("all webhook retries exhausted")


def judge_submission(message: dict) -> None:
    _get_worker_loop().run_until_complete(_judge_submission_async(message))


def run_custom_submission(run_id_str: str) -> None:
    _get_worker_loop().run_until_complete(
        _run_custom_submission_async(uuid.UUID(run_id_str))
    )


async def _judge_submission_async(message: dict) -> None:
    submission_id = uuid.UUID(message["submission_id"])
    started_at = time.perf_counter()

    # Best-effort: mark submission as "judging"
    try:
        await _post_webhook(
            f"{settings.CALLBACK_URL}/api/v1/internal/judge-start",
            {"submission_id": str(submission_id)},
        )
    except Exception as exc:
        logger.warning("judge.start_webhook.failed", submission_id=str(submission_id), error=str(exc))

    problem = SimpleNamespace(**message["problem"])
    test_cases = [SimpleNamespace(**tc) for tc in message["test_cases"]]
    code = storage.get_object_text(message["code_storage_key"])

    logger.info("judge.started", submission_id=str(submission_id))

    try:
        verdict, score, exec_time, mem_usage, error_msg, passed, total = await _run_judge(
            message["language"], code, problem, test_cases
        )
        submission_status = "completed"
    except Exception as exc:
        logger.error(
            "judge.failed",
            submission_id=str(submission_id),
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        verdict = "System Error"
        score = 0.0
        exec_time = 0
        mem_usage = 0
        error_msg = SYSTEM_ERROR_MESSAGE
        passed = 0
        total = len(test_cases)
        submission_status = "failed"

    duration_seconds = time.perf_counter() - started_at
    record_judge_result(
        success=(submission_status == "completed"), duration_seconds=duration_seconds
    )

    try:
        await _post_webhook(
            f"{settings.CALLBACK_URL}/api/v1/internal/judge-result",
            {
                "submission_id": str(submission_id),
                "verdict": verdict,
                "score": score,
                "passed_count": passed,
                "total_count": total,
                "execution_time": exec_time,
                "memory_usage": mem_usage,
                "error_message": error_msg,
                "submission_status": submission_status,
            },
        )
        logger.info(
            "judge.completed",
            submission_id=str(submission_id),
            verdict=verdict,
            duration_seconds=round(duration_seconds, 3),
            passed=passed,
            total=total,
        )
    except Exception as exc:
        logger.error(
            "judge.result_webhook.failed",
            submission_id=str(submission_id),
            error=str(exc),
        )


async def mark_stuck_submissions() -> int:
    url = f"{settings.CALLBACK_URL}/api/v1/internal/mark-stuck"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url, headers={"X-Internal-Token": settings.INTERNAL_TOKEN}
            )
            resp.raise_for_status()
        count = resp.json().get("marked", 0)
        if count:
            record_stuck_submissions(count)
        return count
    except Exception as exc:
        logger.warning("worker.mark_stuck.failed", error=str(exc))
        return 0


def _heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        record_worker_heartbeat()
        stop_event.wait(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)


def main() -> None:
    stop_event = threading.Event()
    heartbeat = threading.Thread(target=_heartbeat_loop, args=(stop_event,), daemon=True)
    heartbeat.start()
    try:
        subscriber = pubsub_v1.SubscriberClient()
        flow = pubsub_v1.types.FlowControl(max_messages=1)

        def on_judge(message: pubsub_v1.subscriber.message.Message) -> None:
            data = json.loads(message.data)
            judge_submission(data)
            message.ack()

        def on_run(message: pubsub_v1.subscriber.message.Message) -> None:
            data = json.loads(message.data)
            run_custom_submission(data["run_id"])
            message.ack()

        fut_judge = subscriber.subscribe(
            settings.PUBSUB_JUDGE_SUBSCRIPTION, on_judge, flow_control=flow
        )
        fut_run = subscriber.subscribe(
            settings.PUBSUB_RUN_SUBSCRIPTION, on_run, flow_control=flow
        )
        logger.info(
            "worker.started",
            judge_sub=settings.PUBSUB_JUDGE_SUBSCRIPTION,
            run_sub=settings.PUBSUB_RUN_SUBSCRIPTION,
        )
        try:
            fut_judge.result()
        finally:
            fut_run.cancel()
    finally:
        stop_event.set()
        heartbeat.join(timeout=2)


async def monitor_stuck_submissions_loop() -> None:
    logger.info("worker.stuck_monitor.started")
    while True:
        try:
            await mark_stuck_submissions()
        except Exception as exc:
            logger.warning("worker.stuck_scan.failed", error=str(exc))
        await asyncio.sleep(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)


async def _run_custom_submission_async(run_id: uuid.UUID) -> None:
    redis_client = custom_run.get_redis()
    run_key = custom_run._run_key(run_id)
    raw = redis_client.get(run_key)
    if raw is None:
        return

    payload = json.loads(raw)
    candidate_id = uuid.UUID(payload["candidate_id"])
    active_key = custom_run._active_key(candidate_id)
    payload["status"] = "running"
    redis_client.setex(run_key, custom_run.RUN_RESULT_TTL_SECONDS, json.dumps(payload))

    try:
        result = await _run_custom_judge(
            payload["language"],
            payload["code"],
            payload["stdin"],
            payload["time_limit"],
            payload["memory_limit"],
        )
        payload = {
            "run_id": str(run_id),
            "candidate_id": str(candidate_id),
            "status": "completed",
            **result,
        }
    except Exception as exc:
        logger.error(f"Error running custom run {run_id}: {exc}")
        logger.error(traceback.format_exc())
        payload = {
            "run_id": str(run_id),
            "candidate_id": str(candidate_id),
            "status": "failed",
            "verdict": "System Error",
            "stdout": "",
            "stderr": "",
            "stdout_truncated": False,
            "stderr_truncated": False,
            "execution_time": 0,
            "memory_usage": 0,
            "error_message": SYSTEM_ERROR_MESSAGE,
        }
    finally:
        redis_client.delete(active_key)

    redis_client.setex(run_key, custom_run.RUN_RESULT_TTL_SECONDS, json.dumps(payload))


async def _run_custom_judge(
    lang: str,
    code: str,
    stdin: str,
    time_limit: int,
    memory_limit: int,
) -> dict:
    box_id = random.randint(0, 999)
    box_dir = ""
    try:
        box_dir = init_box(box_id)
        success, comp_err = compile_code(box_id, lang, code, box_dir)
        if not success:
            truncated = len(comp_err.encode("utf-8")) > 32 * 1024
            comp_err = comp_err[: 32 * 1024]
            return {
                "verdict": "Compile Error",
                "stdout": "",
                "stderr": comp_err,
                "stdout_truncated": False,
                "stderr_truncated": truncated,
                "execution_time": 0,
                "memory_usage": 0,
                "error_message": comp_err,
            }

        verdict, time_used, mem_used, stdout, stderr, stdout_truncated, stderr_truncated = (
            run_custom_input(box_id, lang, time_limit, memory_limit, stdin, box_dir)
        )
        return {
            "verdict": verdict,
            "stdout": stdout,
            "stderr": stderr,
            "stdout_truncated": stdout_truncated,
            "stderr_truncated": stderr_truncated,
            "execution_time": time_used,
            "memory_usage": mem_used,
            "error_message": stderr if verdict != "OK" else None,
        }
    finally:
        if box_dir:
            cleanup_box(box_dir)


async def _run_judge(
    lang: str, code: str, problem: SimpleNamespace, test_cases: list
) -> tuple:
    # returns: verdict, score, max_time, max_mem, error_msg, passed_count, total_count
    box_id = random.randint(0, 999)
    box_dir = ""
    try:
        box_dir = init_box(box_id)

        success, comp_err = compile_code(box_id, lang, code, box_dir)
        if not success:
            return "Compile Error", 0, 0, 0, comp_err, 0, len(test_cases)

        max_time = 0
        max_mem = 0
        passed = 0
        total_score = 0.0
        final_verdict = "Accepted"

        if not test_cases:
            return "System Error", 0, 0, 0, "No test cases found for this problem.", 0, 0

        for tc in test_cases:
            try:
                input_data = storage.get_object_text(tc.input_data_key)
                expected_output = storage.get_object_text(tc.expected_output_key)
            except Exception as e:
                logger.error(
                    "judge.testcase_load_failed",
                    problem_id=str(getattr(problem, "problem_id", "unknown")),
                    error=str(e),
                )
                return "System Error", 0, 0, 0, SYSTEM_ERROR_MESSAGE, 0, len(test_cases)

            time_limit = (
                tc.time_limit_override
                if tc.time_limit_override is not None
                else problem.time_limit
            )
            mem_limit = (
                tc.memory_limit_override
                if tc.memory_limit_override is not None
                else problem.memory_limit
            )

            verdict, t_used, m_used = run_test_case(
                box_id, lang, time_limit, mem_limit, input_data, expected_output, box_dir
            )

            max_time = max(max_time, t_used)
            max_mem = max(max_mem, m_used)

            if verdict == "Accepted":
                passed += 1
                total_score += float(tc.score_weight)
            else:
                if final_verdict == "Accepted":
                    final_verdict = verdict

        return (
            final_verdict,
            min(100.0, total_score),
            max_time,
            max_mem // 1024,
            None,
            passed,
            len(test_cases),
        )

    finally:
        if box_dir:
            cleanup_box(box_dir)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "monitor":
        asyncio.run(monitor_stuck_submissions_loop())
    elif len(sys.argv) > 1 and sys.argv[1] == "monitor-once":
        asyncio.run(mark_stuck_submissions())
    else:
        main()
