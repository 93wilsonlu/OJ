import io
import pytest
import docker
from unittest.mock import MagicMock, patch, call
from app.services import sandbox

def test_image():
    assert sandbox._image("python3") == "python:3.12-slim"
    assert sandbox._image("cpp17") == "gcc:latest"

def test_init_box():
    with patch("app.services.sandbox.docker.from_env") as mock_from_env:
        res = sandbox.init_box(123)
        mock_from_env.assert_called_once()
        assert res["client"] is mock_from_env.return_value
        assert res["box_id"] == "123"

def test_cleanup_box():
    mock_container = MagicMock()
    box_dir = {"container": mock_container}
    sandbox.cleanup_box(box_dir)
    mock_container.remove.assert_called_once_with(force=True, v=True)
    assert "container" not in box_dir

def test_read_peak_kb():
    mock_container = MagicMock()
    # first path fails, second path succeeds
    mock_container.exec_run.side_effect = [
        (1, b"error"),
        (0, b"2048000\n")
    ]
    res = sandbox._read_peak_kb(mock_container)
    assert res == 2000 # 2048000 // 1024

def test_read_file_limited():
    mock_container = MagicMock()
    # wc -c returns 100, head returns first 50 chars
    mock_container.exec_run.side_effect = [
        (0, b"100\n"),
        (0, b"hello world")
    ]
    text, truncated = sandbox._read_file_limited(mock_container, "/box/out.txt", 50)
    assert text == "hello world"
    assert truncated is True

def test_compile_code_success():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    
    # exec_runs: 
    # 1. build: cp & compile
    # 2. copy to overlay
    mock_container.exec_run.side_effect = [
        (0, b"build ok"),
        (0, b"copy ok")
    ]
    mock_container.get_archive.return_value = ([b"archive_chunk"], {})
    
    box_dir = {"client": mock_client}
    success, err = sandbox.compile_code(1, "python3", "print(1)", box_dir)
    
    assert success is True
    assert err == ""
    assert box_dir["box_archive"] == b"archive_chunk"
    mock_container.remove.assert_called_once()

def test_compile_code_build_failure():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    
    mock_container.exec_run.return_value = (1, b"g++ error: syntax error")
    
    box_dir = {"client": mock_client}
    success, err = sandbox.compile_code(1, "cpp17", "int main()", box_dir)
    
    assert success is False
    assert "syntax error" in err
    mock_container.remove.assert_called_once()

def test_compile_code_exception():
    mock_client = MagicMock()
    mock_client.containers.run.side_effect = Exception("docker socket down")
    
    box_dir = {"client": mock_client}
    success, err = sandbox.compile_code(1, "python3", "print(1)", box_dir)
    
    assert success is False
    assert "docker socket down" in err

def test_run_test_case_system_error():
    # client or box_archive is None
    box_dir = {}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "System Error"

def test_run_test_case_accepted():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    
    # exec_runs:
    # 1. stage cp
    # 2. run timeout cmd
    # 3. _read_peak_kb (cat cgroup path 1)
    # 4. read output.txt
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (0, b"run ok"),
        (0, b"4096000\n"), # peak mem bytes
        (0, b"3\n") # program output
    ]
    
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, time_used, mem_used = sandbox.run_test_case(
        1, "python3", 1000, 256, "1 2", "3", box_dir
    )
    
    assert verdict == "Accepted"
    assert mem_used == 4000
    mock_container.remove.assert_called_once()

def test_run_test_case_stage_error():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.return_value = (1, b"cp failed")
    
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "System Error"

def test_run_test_case_tle_mle_re_wa():
    mock_client = MagicMock()
    
    # TLE test
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (124, b"timeout"), # timeout exit code
        (0, b"1024000\n")  # peak mem
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "Time Limit Exceeded"
    
    # MLE test (exit code 137 or 9)
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (137, b"killed") # memory killed
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "Memory Limit Exceeded"

    # Runtime Error test (exit code other non-zero)
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (1, b"exception raised"),
        (0, b"1024\n")
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "Runtime Error"

    # Wrong Answer test
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (0, b"run ok"),
        (0, b"1024\n"),
        (0, b"wrong output\n")
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, _, _ = sandbox.run_test_case(1, "python3", 1000, 256, "1 2", "3", box_dir)
    assert verdict == "Wrong Answer"

def test_run_custom_input_system_error():
    box_dir = {}
    verdict, _, _, _, _, _, _ = sandbox.run_custom_input(1, "python3", 1000, 256, "1 2", box_dir)
    assert verdict == "System Error"

def test_run_custom_input_stage_error():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.return_value = (1, b"stage error info")
    
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    res = sandbox.run_custom_input(1, "python3", 1000, 256, "1 2", box_dir)
    assert res[0] == "System Error"
    assert res[4] == "stage error info"

def test_run_custom_input_success():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    
    # exec_runs:
    # 1. stage cp
    # 2. run timeout cmd
    # 3. _read_peak_kb (cat cgroup path 1)
    # 4. _read_file_limited output size wc -c
    # 5. _read_file_limited output content head
    # 6. _read_file_limited stderr size wc -c
    # 7. _read_file_limited stderr content head
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (0, b"run ok"),
        (0, b"2048000\n"),
        (0, b"10\n"), # stdout size
        (0, b"stdout content"), # stdout content
        (0, b"0\n"), # stderr size
        (0, b"") # stderr content
    ]
    
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    verdict, time_used, mem_used, stdout, stderr, stdout_trunc, stderr_trunc = sandbox.run_custom_input(
        1, "python3", 1000, 256, "1 2", box_dir
    )
    
    assert verdict == "OK"
    assert stdout == "stdout content"
    assert stderr == ""
    assert stdout_trunc is False
    assert stderr_trunc is False

def test_run_custom_input_tle():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (124, b"timeout"),
        (0, b"1024000\n"),
        (0, b"0\n"),
        (0, b""),
        (0, b"0\n"),
        (0, b"")
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    res = sandbox.run_custom_input(1, "python3", 1000, 256, "1 2", box_dir)
    assert res[0] == "Time Limit Exceeded"

def test_run_custom_input_mle():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (137, b"killed"),
        (0, b"0\n"),
        (0, b"0\n"),
        (0, b""),
        (0, b"0\n"),
        (0, b"")
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    res = sandbox.run_custom_input(1, "python3", 1000, 256, "1 2", box_dir)
    assert res[0] == "Memory Limit Exceeded"

def test_run_custom_input_re():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.containers.run.return_value = mock_container
    mock_container.exec_run.side_effect = [
        (0, b"stage ok"),
        (1, b"runtime error"),
        (0, b"1024000\n"),
        (0, b"0\n"),
        (0, b""),
        (0, b"0\n"),
        (0, b"")
    ]
    box_dir = {"client": mock_client, "box_archive": b"my_archive"}
    res = sandbox.run_custom_input(1, "python3", 1000, 256, "1 2", box_dir)
    assert res[0] == "Runtime Error"

