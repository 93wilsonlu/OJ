import asyncio
import logging
import uuid

import anyio
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.problem import Problem
from app.models.test_case import TestCase
from app.services import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_testcases():
    logger.info("Starting test cases seed...", extra={"bucket": settings.GCS_BUCKET})

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Problem))
        problems = result.scalars().all()

        for problem in problems:
            existing = await db.execute(
                select(TestCase).where(TestCase.problem_id == problem.problem_id)
            )
            if existing.scalars().first():
                logger.info(f"Test cases already exist for problem '{problem.title}', skipping.")
                continue

            logger.info(f"Seeding test cases for problem: {problem.title}")

            tc1_id = uuid.uuid4()
            tc1_in_key = f"testcases/{problem.problem_id}/{tc1_id}/input.txt"
            tc1_out_key = f"testcases/{problem.problem_id}/{tc1_id}/output.txt"

            await anyio.to_thread.run_sync(
                storage.put_object, tc1_in_key, (problem.sample_input or "").encode(), "text/plain"
            )
            await anyio.to_thread.run_sync(
                storage.put_object, tc1_out_key, (problem.sample_output or "").encode(), "text/plain"
            )
            logger.info(f"  Uploaded sample test case to gs://{settings.GCS_BUCKET}/{tc1_in_key}")

            db.add(TestCase(
                testcase_id=tc1_id,
                problem_id=problem.problem_id,
                input_data_key=tc1_in_key,
                expected_output_key=tc1_out_key,
                is_hidden=False,
                score_weight=50.0,
                name="Sample Test Case",
            ))

            tc2_id = uuid.uuid4()
            tc2_in_key = f"testcases/{problem.problem_id}/{tc2_id}/input.txt"
            tc2_out_key = f"testcases/{problem.problem_id}/{tc2_id}/output.txt"

            await anyio.to_thread.run_sync(
                storage.put_object, tc2_in_key, (problem.sample_input or "").encode(), "text/plain"
            )
            await anyio.to_thread.run_sync(
                storage.put_object, tc2_out_key, (problem.sample_output or "").encode(), "text/plain"
            )
            logger.info(f"  Uploaded hidden test case to gs://{settings.GCS_BUCKET}/{tc2_in_key}")

            db.add(TestCase(
                testcase_id=tc2_id,
                problem_id=problem.problem_id,
                input_data_key=tc2_in_key,
                expected_output_key=tc2_out_key,
                is_hidden=True,
                score_weight=50.0,
                name="Hidden Test Case",
            ))

        await db.commit()
        logger.info("Test cases seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_testcases())
