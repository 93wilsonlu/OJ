import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.exam import Exam
from app.models.user import User
from app.schemas.submission import (
    JudgeResultOut,
    SubmissionCreate,
    SubmissionDetailOut,
    SubmissionListItemOut,
    SubmissionOut,
)
from app.services import submission as submission_service
from app.services.auth import require_role

router = APIRouter(prefix="/submissions", tags=["submissions"])


def _judge_result_out(
    judge_result,
    *,
    hide_score: bool,
) -> JudgeResultOut | None:
    if judge_result is None:
        return None
    return JudgeResultOut(
        result_id=judge_result.result_id,
        submission_id=judge_result.submission_id,
        verdict=judge_result.verdict,
        score=float(judge_result.score) if not hide_score else None,
        passed_count=judge_result.passed_count if not hide_score else None,
        total_count=judge_result.total_count,
        execution_time=judge_result.execution_time,
        memory_usage=judge_result.memory_usage,
        error_message=judge_result.error_message,
        judged_at=judge_result.judged_at,
    )


@router.post("", response_model=SubmissionOut, status_code=202)
async def create_submission(
    body: SubmissionCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_role(current_user, "candidate")
    ip = request.client.host if request.client else "127.0.0.1"
    submission = await submission_service.create_submission(db, body, current_user.user_id, ip)
    return SubmissionOut.model_validate(submission)


@router.get("", response_model=list[SubmissionListItemOut])
async def list_submissions(
    exam_id: uuid.UUID | None = None,
    candidate_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    submissions = await submission_service.list_submissions(
        db, current_user.user_id, current_user.role, exam_id, candidate_id
    )
    items: list[SubmissionListItemOut] = []
    for row in submissions:
        hide_score = not row.exam_show_score and current_user.role == "candidate"
        items.append(
            SubmissionListItemOut(
                **SubmissionOut.model_validate(row.submission).model_dump(),
                problem_title=row.problem_title,
                candidate_name=row.candidate_name,
                candidate_email=row.candidate_email,
                judge_result=_judge_result_out(row.judge_result, hide_score=hide_score),
            )
        )
    return items


@router.get("/{submission_id}", response_model=SubmissionDetailOut)
async def get_submission(
    submission_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    submission, judge_result = await submission_service.get_submission(
        db, submission_id, current_user.user_id, current_user.role
    )

    exam = await db.get(Exam, submission.exam_id)
    show_score = exam.show_score if exam else True
    hide_score = not show_score and current_user.role == "candidate"
    jr_out = _judge_result_out(judge_result, hide_score=hide_score)

    return SubmissionDetailOut(
        **SubmissionOut.model_validate(submission).model_dump(),
        judge_result=jr_out,
        source_code=await submission_service.get_submission_source_code(submission),
    )
