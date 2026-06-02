import asyncio
import random
import sys
import threading
import time
import traceback
import uuid
from datetime import UTC, datetime, timedelta

import redis
import structlog
from rq import Queue, Worker
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.logging import configure_logging
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.test_case import TestCase
from app.observability import (
    record_judge_result,
    record_stuck_submissions,
    record_worker_heartbeat,
)
from app.services import storage
from app.services.sandbox import cleanup_box, compile_code, init_box, run_test_case

configure_logging()
logger = structlog.get_logger(__name__)
_worker_loop: asyncio.AbstractEventLoop | None = None

# Shown to users for any System Error. Real cause is logged server-side only,
# never surfaced to candidates (C2).
SYSTEM_ERROR_MESSAGE = (
    "An internal error occurred while judging this submission. "
    "Please contact the administrator."
)


def _get_worker_loop() -> asyncio.AbstractEventLoop:
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)
    return _worker_loop


def judge_submission(submission_id_str: str) -> None:
    loop = _get_worker_loop()
    loop.run_until_complete(mark_stuck_submissions())
    loop.run_until_complete(_judge_submission_async(uuid.UUID(submission_id_str)))


async def _judge_submission_async(submission_id: uuid.UUID) -> None:
    started_at = time.perf_counter()
    async with AsyncSessionLocal() as db:
        submission = await db.get(Submission, submission_id)
        if not submission or submission.status != "pending":
            return

        submission.status = "judging"
        await db.commit()
        logger.info("judge.started", submission_id=str(submission_id))

        try:
            problem = await db.get(Problem, submission.problem_id)
            result = await db.execute(
                select(TestCase).where(TestCase.problem_id == problem.problem_id)
            )
            test_cases = result.scalars().all()

            code = storage.get_object_text(submission.code_storage_key)

            verdict, score, exec_time, mem_usage, error_msg, passed, total = await _run_judge(
                submission.language, code, problem, test_cases
            )

            jr = JudgeResult(
                submission_id=submission_id,
                verdict=verdict,
                score=score,
                passed_count=passed,
                total_count=total,
                execution_time=exec_time,
                memory_usage=mem_usage,
                error_message=error_msg,
            )
            db.add(jr)
            submission.status = "completed"
            await db.commit()
            duration_seconds = time.perf_counter() - started_at
            record_judge_result(success=True, duration_seconds=duration_seconds)
            logger.info(
                "judge.completed",
                submission_id=str(submission_id),
                verdict=verdict,
                duration_seconds=round(duration_seconds, 3),
                passed=passed,
                total=total,
            )

        except Exception as e:
            logger.error(
                "judge.failed",
                submission_id=str(submission_id),
                error=str(e),
                traceback=traceback.format_exc(),
            )

            # Check if judge result already added
            result = await db.execute(
                select(JudgeResult).where(JudgeResult.submission_id == submission_id)
            )
            if not result.scalar_one_or_none():
                jr = JudgeResult(
                    submission_id=submission_id,
                    verdict="System Error",
                    score=0,
                    passed_count=0,
                    total_count=len(test_cases) if 'test_cases' in locals() else 0,
                    execution_time=0,
                    memory_usage=0,
                    error_message=SYSTEM_ERROR_MESSAGE,
                )
                db.add(jr)

            submission.status = "failed"
            await db.commit()
            record_judge_result(success=False, duration_seconds=time.perf_counter() - started_at)


async def mark_stuck_submissions() -> int:
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.STUCK_SUBMISSION_SECONDS)
    marked = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Submission).where(
                Submission.status == "judging",
                Submission.submitted_at < cutoff,
            )
        )
        submissions = result.scalars().all()
        for submission in submissions:
            existing = await db.execute(
                select(JudgeResult).where(
                    JudgeResult.submission_id == submission.submission_id
                )
            )
            if existing.scalar_one_or_none() is None:
                db.add(
                    JudgeResult(
                        submission_id=submission.submission_id,
                        verdict="System Error",
                        score=0,
                        passed_count=0,
                        total_count=0,
                        execution_time=0,
                        memory_usage=0,
                        error_message=SYSTEM_ERROR_MESSAGE,
                    )
                )
            submission.status = "failed"
            marked += 1

        if marked:
            await db.commit()
            record_stuck_submissions(marked)
            logger.warning("judge.stuck_submissions.marked", count=marked)
    return marked


def _heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        record_worker_heartbeat()
        stop_event.wait(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)


def main() -> None:
    stop_event = threading.Event()
    heartbeat = threading.Thread(target=_heartbeat_loop, args=(stop_event,), daemon=True)
    heartbeat.start()
    try:
        conn = redis.from_url(settings.REDIS_URL)
        queue = Queue("judge", connection=conn)
        worker = Worker([queue], connection=conn)
        logger.info("worker.started", queue="judge")
        worker.work(with_scheduler=True)
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


async def _run_judge(lang: str, code: str, problem: Problem, test_cases: list[TestCase]) -> tuple:
    # return verdict, score, max_time, max_mem, error_msg, passed_count, total_count
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
                    problem_id=str(problem.problem_id),
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
    else:
        main()
