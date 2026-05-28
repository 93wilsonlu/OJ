import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_assignment import ExamAssignment
from app.models.problem import Problem
from app.schemas.exam import ExamAssignmentCreate, ExamCreate, ExamUpdate


@dataclass
class ExamProblemRow:
    assignment_id: uuid.UUID
    problem_id: uuid.UUID
    title: str
    description: str
    input_format: str | None
    output_format: str | None
    sample_input: str | None
    sample_output: str | None
    difficulty: str
    time_limit: int
    memory_limit: int
    allowed_langs: list[str]


async def list_exams(db: AsyncSession, user_id: uuid.UUID, role: str) -> list[Exam]:
    if role == "candidate":
        stmt = (
            select(Exam)
            .join(ExamAssignment, ExamAssignment.exam_id == Exam.exam_id)
            .where(ExamAssignment.candidate_id == user_id)
            .distinct()
            .order_by(Exam.start_time.desc())
        )
    else:
        stmt = select(Exam).order_by(Exam.start_time.desc())
    result = await db.execute(stmt)
    return list(result.scalars())


async def get_exam(db: AsyncSession, exam_id: uuid.UUID) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


async def create_exam(db: AsyncSession, data: ExamCreate, creator_id: uuid.UUID) -> Exam:
    exam = Exam(
        title=data.title,
        description=data.description,
        start_time=data.start_time,
        end_time=data.end_time,
        show_score=data.show_score,
        created_by=creator_id,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


async def update_exam(db: AsyncSession, exam: Exam, data: ExamUpdate) -> Exam:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam: Exam) -> None:
    await db.delete(exam)
    await db.commit()


async def list_exam_problems_for_user(
    db: AsyncSession, exam_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> list[ExamProblemRow]:
    stmt = (
        select(ExamAssignment, Problem)
        .join(Problem, ExamAssignment.problem_id == Problem.problem_id)
        .where(ExamAssignment.exam_id == exam_id)
        .order_by(ExamAssignment.created_at)
    )
    if role == "candidate":
        stmt = stmt.where(ExamAssignment.candidate_id == user_id)
    result = await db.execute(stmt)
    rows = []
    for assignment, problem in result.all():
        rows.append(ExamProblemRow(
            assignment_id=assignment.assignment_id,
            problem_id=problem.problem_id,
            title=problem.title,
            description=problem.description,
            input_format=problem.input_format,
            output_format=problem.output_format,
            sample_input=problem.sample_input,
            sample_output=problem.sample_output,
            difficulty=problem.difficulty,
            time_limit=problem.time_limit,
            memory_limit=problem.memory_limit,
            allowed_langs=problem.allowed_langs,
        ))
    return rows


async def list_assignments(db: AsyncSession, exam_id: uuid.UUID) -> list[ExamAssignment]:
    result = await db.execute(
        select(ExamAssignment)
        .where(ExamAssignment.exam_id == exam_id)
        .order_by(ExamAssignment.created_at)
    )
    return list(result.scalars())


async def create_assignment(
    db: AsyncSession, exam_id: uuid.UUID, data: ExamAssignmentCreate
) -> ExamAssignment:
    assignment = ExamAssignment(
        exam_id=exam_id,
        candidate_id=data.candidate_id,
        problem_id=data.problem_id,
        assigned_difficulty=data.assigned_difficulty,
    )
    db.add(assignment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Assignment already exists")
    await db.refresh(assignment)
    return assignment


async def delete_assignment(db: AsyncSession, assignment_id: uuid.UUID) -> None:
    assignment = await db.get(ExamAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
