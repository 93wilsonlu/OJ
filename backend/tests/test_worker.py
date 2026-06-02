"""
Judge worker tests.

C2: internal exceptions must not leak to candidates. System Error verdicts
store a generic message; the real detail is logged server-side only.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import worker


@pytest.mark.asyncio
@patch("worker.cleanup_box")
@patch("worker.run_test_case")
@patch("worker.compile_code")
@patch("worker.init_box")
@patch("worker.storage.get_object_text")
async def test_run_judge_testcase_load_failure_returns_generic_message(
    mock_get_text, mock_init, mock_compile, mock_run_tc, mock_cleanup
):
    mock_init.return_value = "/box/0"
    mock_compile.return_value = (True, "")
    mock_get_text.side_effect = RuntimeError("minio key submissions/secret leaked")

    problem = MagicMock(time_limit=1, memory_limit=256)
    problem.problem_id = uuid.uuid4()
    tc = MagicMock(
        input_data_key="in",
        expected_output_key="out",
        time_limit_override=None,
        memory_limit_override=None,
    )

    verdict, score, _t, _m, error_msg, passed, total = await worker._run_judge(
        "python3", "code", problem, [tc]
    )

    assert verdict == "System Error"
    assert error_msg == worker.SYSTEM_ERROR_MESSAGE
    assert "minio" not in error_msg
    assert "secret" not in error_msg


@pytest.mark.asyncio
@patch("worker.cleanup_box")
@patch("worker.run_test_case")
@patch("worker.compile_code")
@patch("worker.init_box")
@patch("worker.storage.get_object_text")
async def test_run_judge_success_passes_box_dir_and_cleans_up(
    mock_get_text, mock_init, mock_compile, mock_run_tc, mock_cleanup
):
    box_dir = "/box/42"
    mock_init.return_value = box_dir
    mock_compile.return_value = (True, "")
    mock_get_text.side_effect = ["1 2\n", "3\n"]
    mock_run_tc.return_value = ("Accepted", 0.012, 2048)

    problem = MagicMock(time_limit=1, memory_limit=256)
    problem.problem_id = uuid.uuid4()
    tc = MagicMock(
        input_data_key="in",
        expected_output_key="out",
        time_limit_override=None,
        memory_limit_override=None,
        score_weight=100,
    )

    result = await worker._run_judge("python3", "code", problem, [tc])

    assert result == ("Accepted", 100.0, 0.012, 2, None, 1, 1)
    mock_run_tc.assert_called_once()
    assert mock_run_tc.call_args.args[-1] == box_dir
    mock_cleanup.assert_called_once_with(box_dir)


@pytest.mark.asyncio
@patch("worker._run_judge", new_callable=AsyncMock)
@patch("worker.storage.get_object_text")
@patch("worker.AsyncSessionLocal")
async def test_system_error_does_not_leak_exception_detail(mock_sess, mock_get_text, mock_run):
    submission = MagicMock()
    submission.status = "pending"
    submission.problem_id = uuid.uuid4()
    submission.language = "python3"
    submission.code_storage_key = "k"
    problem = MagicMock(problem_id=uuid.uuid4())

    db = MagicMock()
    db.get = AsyncMock(side_effect=[submission, problem])
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = []
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)
    db.add = MagicMock()
    db.commit = AsyncMock()

    mock_sess.return_value.__aenter__ = AsyncMock(return_value=db)
    mock_sess.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_get_text.return_value = "code"
    mock_run.side_effect = RuntimeError("DB password=hunter2 internal trace")

    await worker._judge_submission_async(uuid.uuid4())

    added = [c.args[0] for c in db.add.call_args_list]
    assert added, "expected a JudgeResult to be persisted"
    jr = added[-1]
    assert jr.verdict == "System Error"
    assert jr.error_message == worker.SYSTEM_ERROR_MESSAGE
    assert "hunter2" not in (jr.error_message or "")
