import subprocess
from unittest.mock import MagicMock, mock_open, patch

from lib.services import sandbox


def test_init_box_uses_configured_sandbox_dir_when_available():
    with (
        patch("lib.services.sandbox.os.path.isdir", return_value=True),
        patch("lib.services.sandbox.tempfile.mkdtemp", return_value="/sandbox-tmp/box1") as mkdtemp,
    ):
        box = sandbox.init_box(1)

    assert box == {"box_dir": "/sandbox-tmp/box1"}
    mkdtemp.assert_called_once_with(prefix="box1_", dir=sandbox.SANDBOX_TMP_DIR)


def test_init_box_falls_back_to_default_temp_dir():
    with (
        patch("lib.services.sandbox.os.path.isdir", return_value=False),
        patch("lib.services.sandbox.tempfile.mkdtemp", return_value="/tmp/box1") as mkdtemp,
    ):
        box = sandbox.init_box(1)

    assert box == {"box_dir": "/tmp/box1"}
    mkdtemp.assert_called_once_with(prefix="box1_", dir=None)


def test_cleanup_box_removes_temp_directory():
    with patch("lib.services.sandbox.shutil.rmtree") as rmtree:
        sandbox.cleanup_box({"box_dir": "/tmp/box1"})

    rmtree.assert_called_once_with("/tmp/box1", ignore_errors=True)


def test_compile_code_success():
    result = MagicMock(returncode=0, stderr="", stdout="")
    box = {"box_dir": "/tmp/box1"}

    with (
        patch("builtins.open", mock_open()),
        patch("lib.services.sandbox.subprocess.run", return_value=result) as run,
    ):
        success, error = sandbox.compile_code(1, "python3", "print(1)", box)

    assert success is True
    assert error == ""
    run.assert_called_once()
    assert run.call_args.kwargs["cwd"] == "/tmp/box1"


def test_compile_code_failure_returns_compiler_output():
    result = MagicMock(returncode=1, stderr="syntax error", stdout="")
    box = {"box_dir": "/tmp/box1"}

    with (
        patch("builtins.open", mock_open()),
        patch("lib.services.sandbox.subprocess.run", return_value=result),
    ):
        success, error = sandbox.compile_code(1, "python3", "bad code", box)

    assert success is False
    assert error == "syntax error"


def test_compile_code_timeout():
    box = {"box_dir": "/tmp/box1"}

    with (
        patch("builtins.open", mock_open()),
        patch(
            "lib.services.sandbox.subprocess.run",
            side_effect=subprocess.TimeoutExpired(["python"], timeout=30),
        ),
    ):
        success, error = sandbox.compile_code(1, "python3", "print(1)", box)

    assert success is False
    assert error == "Compilation timed out"


def test_run_test_case_reports_wrong_answer():
    proc = MagicMock(pid=123, returncode=0)
    opened = mock_open(read_data="wrong\n")

    with (
        patch("builtins.open", opened),
        patch("lib.services.sandbox.subprocess.Popen", return_value=proc),
        patch("lib.services.sandbox._read_vm_peak_kb", return_value=256),
    ):
        verdict, _time_used, memory = sandbox.run_test_case(
            1,
            "python3",
            1000,
            128,
            "1 2\n",
            "3\n",
            {"box_dir": "/tmp/box1"},
        )

    assert verdict == "Wrong Answer"
    assert memory == 256


def test_run_test_case_reports_time_limit_exceeded():
    proc = MagicMock(pid=123)
    proc.wait.side_effect = [subprocess.TimeoutExpired(["python"], timeout=1.5), None]

    with (
        patch("builtins.open", mock_open()),
        patch("lib.services.sandbox.subprocess.Popen", return_value=proc),
    ):
        verdict, time_used, memory = sandbox.run_test_case(
            1,
            "python3",
            1000,
            128,
            "",
            "",
            {"box_dir": "/tmp/box1"},
        )

    assert verdict == "Time Limit Exceeded"
    assert time_used == 1000
    assert memory == 0
    proc.kill.assert_called_once()
