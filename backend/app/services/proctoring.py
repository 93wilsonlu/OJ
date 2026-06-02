import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam_candidate_state import ExamCandidateState

LOCK_THRESHOLD_SECONDS = 10


async def get_candidate_state(
    db: AsyncSession,
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
) -> ExamCandidateState:
    result = await db.execute(
        select(ExamCandidateState).where(
            ExamCandidateState.exam_id == exam_id,
            ExamCandidateState.candidate_id == candidate_id,
        )
    )
    state = result.scalar_one_or_none()
    if state is not None:
        return state

    now = datetime.now(UTC)
    state = ExamCandidateState(
        exam_id=exam_id,
        candidate_id=candidate_id,
        status="active",
        last_seen_at=now,
    )
    db.add(state)
    await db.commit()
    await db.refresh(state)
    return state


async def ensure_candidate_not_locked(
    db: AsyncSession,
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(ExamCandidateState.status).where(
            ExamCandidateState.exam_id == exam_id,
            ExamCandidateState.candidate_id == candidate_id,
        )
    )
    if result.scalar_one_or_none() == "locked":
        raise HTTPException(
            status_code=403,
            detail="Exam access locked due to proctoring violation",
        )


async def register_event(
    db: AsyncSession,
    exam_id: uuid.UUID,
    candidate_id: uuid.UUID,
    event_type: str,
    violating: bool,
) -> ExamCandidateState:
    state = await get_candidate_state(db, exam_id, candidate_id)
    now = datetime.now(UTC)

    if state.status != "locked":
        if violating:
            if state.warning_started_at is None:
                state.warning_started_at = now
            elif (now - state.warning_started_at).total_seconds() >= LOCK_THRESHOLD_SECONDS:
                state.status = "locked"
                state.locked_at = now
                state.lock_reason = event_type
        else:
            state.warning_started_at = None

    state.last_event_type = event_type
    state.last_seen_at = now
    db.add(state)
    await db.commit()
    await db.refresh(state)
    return state
