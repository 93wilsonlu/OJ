import asyncio
import uuid
import logging
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.problem import Problem
from app.models.test_case import TestCase
from app.services import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_testcases():
    logger.info("Starting test cases seed...")
    storage.ensure_bucket()
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Problem))
        problems = result.scalars().all()
        
        for problem in problems:
            # Check if test cases already exist
            existing = await db.execute(select(TestCase).where(TestCase.problem_id == problem.problem_id))
            if existing.scalars().first():
                logger.info(f"Test cases already exist for problem {problem.title}, skipping.")
                continue
                
            logger.info(f"Adding test cases for problem: {problem.title}")
            
            # Use sample_input and sample_output as the first test case
            tc1_id = uuid.uuid4()
            tc1_in_key = f"testcases/{problem.problem_id}/{tc1_id}/input.txt"
            tc1_out_key = f"testcases/{problem.problem_id}/{tc1_id}/output.txt"
            
            storage.put_object(tc1_in_key, (problem.sample_input or "").encode("utf-8"), "text/plain")
            storage.put_object(tc1_out_key, (problem.sample_output or "").encode("utf-8"), "text/plain")
            
            tc1 = TestCase(
                testcase_id=tc1_id,
                problem_id=problem.problem_id,
                input_data_key=tc1_in_key,
                expected_output_key=tc1_out_key,
                is_hidden=False,
                score_weight=50.0,
                name="Sample Test Case"
            )
            db.add(tc1)
            
            # Add a second hidden test case (dummy, repeating the sample but hidden)
            # For real usage, this should be a different test case
            tc2_id = uuid.uuid4()
            tc2_in_key = f"testcases/{problem.problem_id}/{tc2_id}/input.txt"
            tc2_out_key = f"testcases/{problem.problem_id}/{tc2_id}/output.txt"
            
            storage.put_object(tc2_in_key, (problem.sample_input or "").encode("utf-8"), "text/plain")
            storage.put_object(tc2_out_key, (problem.sample_output or "").encode("utf-8"), "text/plain")
            
            tc2 = TestCase(
                testcase_id=tc2_id,
                problem_id=problem.problem_id,
                input_data_key=tc2_in_key,
                expected_output_key=tc2_out_key,
                is_hidden=True,
                score_weight=50.0,
                name="Hidden Test Case"
            )
            db.add(tc2)
            
        await db.commit()
        logger.info("Test cases seed completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_testcases())
