import asyncio
import uuid
import logging
import random
import traceback
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.submission import Submission
from app.models.judge_result import JudgeResult
from app.models.problem import Problem
from app.models.test_case import TestCase
from app.services import storage
from app.services.sandbox import init_box, cleanup_box, compile_code, run_test_case

logger = logging.getLogger(__name__)

def judge_submission(submission_id_str: str) -> None:
    asyncio.run(_judge_submission_async(uuid.UUID(submission_id_str)))

async def _judge_submission_async(submission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        submission = await db.get(Submission, submission_id)
        if not submission or submission.status != "pending":
            return
        
        submission.status = "judging"
        await db.commit()
        
        try:
            problem = await db.get(Problem, submission.problem_id)
            result = await db.execute(select(TestCase).where(TestCase.problem_id == problem.problem_id))
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
                error_message=error_msg
            )
            db.add(jr)
            submission.status = "completed"
            await db.commit()
            
        except Exception as e:
            logger.error(f"Error judging submission {submission_id}: {e}")
            logger.error(traceback.format_exc())
            
            # Check if judge result already added
            result = await db.execute(select(JudgeResult).where(JudgeResult.submission_id == submission_id))
            if not result.scalar_one_or_none():
                jr = JudgeResult(
                    submission_id=submission_id,
                    verdict="System Error",
                    score=0,
                    passed_count=0,
                    total_count=len(test_cases) if 'test_cases' in locals() else 0,
                    execution_time=0,
                    memory_usage=0,
                    error_message=str(e)
                )
                db.add(jr)
                
            submission.status = "failed"
            await db.commit()

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
        
        for tc in test_cases:
            try:
                input_data = storage.get_object_text(tc.input_data_key)
                expected_output = storage.get_object_text(tc.expected_output_key)
            except Exception as e:
                return "System Error", 0, 0, 0, f"Failed to load testcase: {e}", 0, len(test_cases)
                
            time_limit = tc.time_limit_override if tc.time_limit_override is not None else problem.time_limit
            mem_limit = tc.memory_limit_override if tc.memory_limit_override is not None else problem.memory_limit
            
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
                    
        return final_verdict, min(100.0, total_score), max_time, max_mem // 1024, None, passed, len(test_cases)
        
    finally:
        if box_dir:
            cleanup_box(box_id)
