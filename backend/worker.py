import asyncio
import json
import random
import threading
import time
import traceback
import uuid
from types import SimpleNamespace

import httpx
import structlog
from google.cloud import pubsub_v1

from lib import storage
from lib.config import settings
from lib.logging import configure_logging
from lib.observability import (
    decrement_queue_length,
    record_judge_result,
    record_worker_heartbeat,
)
from lib.services.sandbox import (
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


def handle_custom_run(message: dict) -> None:
    _get_worker_loop().run_until_complete(_handle_custom_run_async(message))


async def _judge_submission_async(message: dict) -> None:
    started_at = time.perf_counter()
    submission_id = uuid.UUID(message["submission_id"])
    test_cases = []

    # Best-effort: mark submission as "judging"
    try:
        await _post_webhook(
            f"{settings.CALLBACK_URL}/api/v1/internal/judge-start",
            {"submission_id": str(submission_id)},
        )
    except Exception as exc:
        logger.warning(
            "judge.start_webhook.failed",
            submission_id=str(submission_id),
            error=str(exc),
        )

    logger.info("judge.started", submission_id=str(submission_id))

    try:
        problem = SimpleNamespace(**message["problem"])
        test_cases = [SimpleNamespace(**tc) for tc in message["test_cases"]]
        code = storage.get_object_text(message["code_storage_key"])
        (
            verdict,
            score,
            exec_time,
            mem_usage,
            error_msg,
            passed,
            total,
            case_results,
        ) = await _run_judge(message["language"], code, problem, test_cases)
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
        case_results = []
        submission_status = "failed"

    record_judge_result(
        success=verdict != "System Error",
        duration_seconds=time.perf_counter() - started_at,
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
                "case_results": case_results,
                "submission_status": submission_status,
            },
        )
        logger.info(
            "judge.completed",
            submission_id=str(submission_id),
            verdict=verdict,
            passed=passed,
            total=total,
        )
    except Exception as exc:
        logger.error(
            "judge.result_webhook.failed",
            submission_id=str(submission_id),
            error=str(exc),
        )


async def _handle_custom_run_async(message: dict) -> None:
    run_id = message["run_id"]
    lang = message["language"]
    code = message["code"]
    stdin = message.get("stdin", "")
    time_limit_ms = message["time_limit"]
    memory_limit_mb = message["memory_limit"]

    logger.info("custom_run.started", run_id=run_id)

    box_id = random.randint(0, 999)
    box_dir = ""
    verdict = "System Error"
    time_ms = 0
    mem_kb = 0
    stdout = ""
    stderr = ""
    stdout_truncated = False
    stderr_truncated = False
    error_message: str | None = SYSTEM_ERROR_MESSAGE

    try:
        box_dir = init_box(box_id)
        success, comp_err = compile_code(box_id, lang, code, box_dir)
        if not success:
            verdict = "Compile Error"
            error_message = comp_err
        else:
            (
                verdict,
                time_ms,
                mem_kb,
                stdout,
                stderr,
                stdout_truncated,
                stderr_truncated,
            ) = run_custom_input(box_id, lang, time_limit_ms, memory_limit_mb, stdin, box_dir)
            error_message = None
    except Exception as exc:
        logger.error(
            "custom_run.failed",
            run_id=run_id,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
    finally:
        if box_dir:
            cleanup_box(box_dir)

    try:
        await _post_webhook(
            f"{settings.CALLBACK_URL}/api/v1/internal/run-result",
            {
                "run_id": run_id,
                "verdict": verdict,
                "execution_time": time_ms,
                "memory_usage": mem_kb,
                "stdout": stdout,
                "stderr": stderr,
                "stdout_truncated": stdout_truncated,
                "stderr_truncated": stderr_truncated,
                "error_message": error_message,
            },
        )
        logger.info("custom_run.completed", run_id=run_id, verdict=verdict)
    except Exception as exc:
        logger.error("custom_run.result_webhook.failed", run_id=run_id, error=str(exc))


def main() -> None:
    subscriber = pubsub_v1.SubscriberClient()
    flow = pubsub_v1.types.FlowControl(max_messages=1)
    stop_event = threading.Event()

    def heartbeat_loop() -> None:
        while not stop_event.is_set():
            record_worker_heartbeat()
            stop_event.wait(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)

    heartbeat = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat.start()

    def on_judge(message: pubsub_v1.subscriber.message.Message) -> None:
        data = json.loads(message.data)
        decrement_queue_length()
        judge_submission(data)
        message.ack()

    def on_run(message: pubsub_v1.subscriber.message.Message) -> None:
        data = json.loads(message.data)
        handle_custom_run(data)
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
        stop_event.set()
        heartbeat.join(timeout=2)
        fut_run.cancel()


async def _run_judge(
    lang: str, code: str, problem: SimpleNamespace, test_cases: list
) -> tuple:
    # return verdict, score, max_time, max_mem, error_msg, passed_count, total_count, case_results
    box_id = random.randint(0, 999)
    box_dir = ""
    try:
        box_dir = init_box(box_id)

        success, comp_err = compile_code(box_id, lang, code, box_dir)
        if not success:
            return (
                "Compile Error",
                0,
                0,
                0,
                comp_err,
                0,
                len(test_cases),
                [
                    {
                        "index": index + 1,
                        "verdict": "Compile Error",
                        "execution_time": 0,
                        "memory_usage": 0,
                    }
                    for index in range(len(test_cases))
                ],
            )

        max_time = 0
        max_mem = 0
        passed = 0
        total_score = 0.0
        final_verdict = "Accepted"
        case_results = []

        if not test_cases:
            return "System Error", 0, 0, 0, "No test cases found for this problem.", 0, 0, []

        for index, tc in enumerate(test_cases, start=1):
            try:
                input_data = storage.get_object_text(tc.input_data_key)
                expected_output = storage.get_object_text(tc.expected_output_key)
            except Exception as e:
                logger.error(
                    "judge.testcase_load_failed",
                    problem_id=str(getattr(problem, "problem_id", "unknown")),
                    error=str(e),
                )
                return (
                    "System Error",
                    0,
                    0,
                    0,
                    SYSTEM_ERROR_MESSAGE,
                    0,
                    len(test_cases),
                    case_results,
                )

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
            case_results.append(
                {
                    "index": index,
                    "verdict": verdict,
                    "execution_time": t_used,
                    "memory_usage": m_used,
                }
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
            case_results,
        )

    finally:
        if box_dir:
            cleanup_box(box_dir)


if __name__ == "__main__":
    main()
