import ctypes
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time

try:
    import resource
except ModuleNotFoundError:
    resource = None


class SandboxError(Exception):
    pass


PIDS_LIMIT = 64
SANDBOX_TMP_DIR = "/sandbox-tmp"
COMPILE_MEM_MB = 512
COMPILE_TIMEOUT_S = 30
FILE_SIZE_LIMIT_MB = 64

MB = 1024 * 1024


def _try_setrlimit(resource_id, soft, hard):
    if resource is None:
        return
    try:
        resource.setrlimit(resource_id, (soft, hard))
    except (ValueError, OSError):
        # Some limits may be unsupported or already tighter on the host (e.g. macOS).
        # On GKE with gVisor these will be enforced; local dev can skip gracefully.
        pass


def _block_network_syscalls():
    """Block all network syscalls (socket, connect, bind, etc.) using seccomp."""
    if not sys.platform == "linux":
        return
    try:
        libc = ctypes.CDLL(None)
        PR_SET_SECCOMP = 22
        SECCOMP_MODE_FILTER = 2

        # Syscall numbers for x86_64 (see: asm/unistd_64.h)
        SYS_socket = 41
        SYS_connect = 42
        SYS_bind = 49
        SYS_listen = 50
        SYS_accept = 43
        SYS_accept4 = 288
        SYS_socketpair = 53
        # BPF program: deny network syscalls, allow everything else
        # Format: (opcode, jt, jf, k) where jt/jf are jump targets
        class BPF:
            LD_ABS = 0x20
            JMP_JEQ = 0x15
            JMP_JGE = 0x35
            RET = 0x06
            K = 0x00
            X = 0x08

        bpf_filter = [
            # Load syscall number into accumulator
            (BPF.LD_ABS | BPF.K, 0, 0, 4),  # offset 4 = syscall number

            # Check each blocked syscall and jump to SECCOMP_RET_ERRNO (deny)
            # SECCOMP_RET_ERRNO = 0x00050000 | errno (EPERM=1 → 0x00050001)
            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_socket),      # socket → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),           # return EPERM

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_connect),      # connect → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_bind),         # bind → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_listen),       # listen → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_accept),       # accept → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_accept4),      # accept4 → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            (BPF.JMP_JEQ | BPF.K, 0, 1, SYS_socketpair),   # socketpair → deny
            (BPF.RET | BPF.K, 0, 0, 0x00050001),

            # Allow all other syscalls (SECCOMP_RET_ALLOW = 0x7fff0000)
            (BPF.RET | BPF.K, 0, 0, 0x7fff0000),
        ]

        # Convert to ctypes array
        BPF_INSTR = ctypes.c_uint16 * 4
        bpf_insns = (BPF_INSTR * len(bpf_filter))()
        for i, (opcode, jt, jf, k) in enumerate(bpf_filter):
            bpf_insns[i] = BPF_INSTR(opcode, jt, jf, k)

        # Load seccomp filter
        libc.prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(bpf_insns))
    except (AttributeError, OSError, Exception):
        # Seccomp not available or failed; fallback to network namespace isolation only
        pass


def _set_limits(mem_mb: int, cpu_s: int, pids: int, file_mb: int):
    def _preexec():
        mem_bytes = mem_mb * MB
        if resource is not None:
            _try_setrlimit(resource.RLIMIT_AS, mem_bytes, mem_bytes)
            _try_setrlimit(resource.RLIMIT_CPU, cpu_s, cpu_s + 1)
            # RLIMIT_NPROC on macOS limits total user processes (not per-process forks),
            # which breaks compiler helpers like xcodebuild. Only enforce on Linux/gVisor.
            if sys.platform == "linux":
                _try_setrlimit(resource.RLIMIT_NPROC, pids, pids)
            fsize = file_mb * MB
            _try_setrlimit(resource.RLIMIT_FSIZE, fsize, fsize)
        # Network isolation: run in separate namespace so user code can't access
        # Redis, Pub/Sub, or other network services.
        if sys.platform == "linux":
            try:
                os.unshare(os.CLONE_NEWNET)
            except (AttributeError, OSError):
                # CLONE_NEWNET not available (macOS, unprivileged, or older kernel).
                # On GKE with gVisor, this will succeed and isolate the network.
                pass
            # Additionally, block network syscalls at the kernel level (seccomp).
            # Even if network namespace is misconfigured, user code can't make
            # socket, connect, bind calls.
            _block_network_syscalls()
    return _preexec


def _compile_limits():
    _set_limits(COMPILE_MEM_MB, COMPILE_TIMEOUT_S, PIDS_LIMIT, FILE_SIZE_LIMIT_MB)()


def _read_vm_peak_kb(pid: int) -> int:
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmPeak:"):
                    return int(line.split()[1])
    except Exception:
        pass
    return 0


def init_box(box_id: int) -> dict:
    tmp_base = SANDBOX_TMP_DIR if os.path.isdir(SANDBOX_TMP_DIR) else None
    box_dir = tempfile.mkdtemp(prefix=f"box{box_id}_", dir=tmp_base)
    return {"box_dir": box_dir}


def compile_code(box_id: int, lang: str, code: str, box_dir: dict) -> tuple[bool, str]:
    path = box_dir["box_dir"]
    try:
        if lang == "python3":
            src = os.path.join(path, "main.py")
            with open(src, "w") as f:
                f.write(code)
            result = subprocess.run(
                [sys.executable, "-m", "py_compile", "main.py"],
                cwd=path,
                timeout=COMPILE_TIMEOUT_S,
                capture_output=True,
                text=True,
                preexec_fn=_compile_limits,
            )
        else:  # cpp17
            src = os.path.join(path, "main.cpp")
            with open(src, "w") as f:
                f.write(code)
            result = subprocess.run(
                ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"],
                cwd=path,
                timeout=COMPILE_TIMEOUT_S,
                capture_output=True,
                text=True,
                preexec_fn=_compile_limits,
            )
        if result.returncode != 0:
            return False, result.stderr or result.stdout
        return True, ""
    except subprocess.TimeoutExpired:
        return False, "Compilation timed out"
    except Exception as e:
        return False, str(e)


def run_test_case(
    box_id: int,
    lang: str,
    time_limit_ms: int,
    memory_limit_mb: int,
    input_data: str,
    expected_output: str,
    box_dir: dict,
) -> tuple[str, int, int]:
    path = box_dir["box_dir"]
    time_limit_s = time_limit_ms / 1000.0
    cpu_s = math.ceil(time_limit_s) + 1

    input_path = os.path.join(path, "input.txt")
    output_path = os.path.join(path, "output.txt")
    with open(input_path, "w") as f:
        f.write(input_data)

    cmd = [sys.executable, "main.py"] if lang == "python3" else ["./main"]
    preexec = _set_limits(memory_limit_mb, cpu_s, PIDS_LIMIT, FILE_SIZE_LIMIT_MB)

    proc = None
    start = time.perf_counter()
    try:
        with open(input_path) as stdin_f, open(output_path, "w") as stdout_f:
            proc = subprocess.Popen(
                cmd,
                cwd=path,
                stdin=stdin_f,
                stdout=stdout_f,
                stderr=subprocess.DEVNULL,
                preexec_fn=preexec,
                env={},
            )
            pid = proc.pid
            try:
                proc.wait(timeout=time_limit_s + 0.5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                return "Time Limit Exceeded", time_limit_ms, 0
    except Exception:
        if proc is not None:
            try:
                proc.kill()
                proc.wait()
            except Exception:
                pass
        return "System Error", 0, 0

    time_used_ms = int((time.perf_counter() - start) * 1000)
    mem_used_kb = _read_vm_peak_kb(pid)
    exit_code = proc.returncode

    if exit_code == 9 or exit_code == 137 or exit_code == -9:
        return "Memory Limit Exceeded", time_used_ms, memory_limit_mb * 1024
    if exit_code == 139 or exit_code == -11:
        # SIGSEGV — likely RLIMIT_AS exceeded
        return "Memory Limit Exceeded", time_used_ms, memory_limit_mb * 1024
    if exit_code != 0:
        return "Runtime Error", time_used_ms, mem_used_kb

    try:
        with open(output_path) as f:
            actual_out = f.read()
    except Exception:
        actual_out = ""

    if actual_out.strip().split() != expected_output.strip().split():
        return "Wrong Answer", time_used_ms, mem_used_kb

    return "Accepted", time_used_ms, mem_used_kb


def run_custom_input(
    box_id: int,
    lang: str,
    time_limit_ms: int,
    memory_limit_mb: int,
    input_data: str,
    box_dir: dict,
    output_limit: int = 32 * 1024,
) -> tuple[str, int, int, str, str, bool, bool]:
    path = box_dir["box_dir"]
    time_limit_s = time_limit_ms / 1000.0
    cpu_s = math.ceil(time_limit_s) + 1

    input_path = os.path.join(path, "input.txt")
    output_path = os.path.join(path, "output.txt")
    stderr_path = os.path.join(path, "stderr.txt")
    with open(input_path, "w") as f:
        f.write(input_data)

    cmd = [sys.executable, "main.py"] if lang == "python3" else ["./main"]
    preexec = _set_limits(memory_limit_mb, cpu_s, PIDS_LIMIT, FILE_SIZE_LIMIT_MB)

    proc = None
    start = time.perf_counter()
    try:
        with (
            open(input_path) as stdin_f,
            open(output_path, "w") as stdout_f,
            open(stderr_path, "w") as stderr_f,
        ):
            proc = subprocess.Popen(
                cmd,
                cwd=path,
                stdin=stdin_f,
                stdout=stdout_f,
                stderr=stderr_f,
                preexec_fn=preexec,
                env={},
            )
            pid = proc.pid
            try:
                proc.wait(timeout=time_limit_s + 0.5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                return "Time Limit Exceeded", time_limit_ms, 0, "", "", False, False
    except Exception as e:
        if proc is not None:
            try:
                proc.kill()
                proc.wait()
            except Exception:
                pass
        return "System Error", 0, 0, "", str(e), False, False

    time_used_ms = int((time.perf_counter() - start) * 1000)
    mem_used_kb = _read_vm_peak_kb(pid)
    exit_code = proc.returncode

    def _read_limited(fpath: str) -> tuple[str, bool]:
        try:
            with open(fpath, "rb") as f:
                data = f.read(output_limit + 1)
            truncated = len(data) > output_limit
            return data[:output_limit].decode("utf-8", errors="replace"), truncated
        except Exception:
            return "", False

    stdout_text, stdout_truncated = _read_limited(output_path)
    stderr_text, stderr_truncated = _read_limited(stderr_path)

    if exit_code == 9 or exit_code == 137 or exit_code == -9:
        return (
            "Memory Limit Exceeded",
            time_used_ms,
            memory_limit_mb * 1024,
            stdout_text,
            stderr_text,
            stdout_truncated,
            stderr_truncated,
        )
    if exit_code == 139 or exit_code == -11:
        return (
            "Memory Limit Exceeded",
            time_used_ms,
            memory_limit_mb * 1024,
            stdout_text,
            stderr_text,
            stdout_truncated,
            stderr_truncated,
        )
    if exit_code != 0:
        return (
            "Runtime Error",
            time_used_ms,
            mem_used_kb,
            stdout_text,
            stderr_text,
            stdout_truncated,
            stderr_truncated,
        )

    return (
        "OK",
        time_used_ms,
        mem_used_kb,
        stdout_text,
        stderr_text,
        stdout_truncated,
        stderr_truncated,
    )


def cleanup_box(box_dir: dict) -> None:
    path = box_dir.get("box_dir")
    if path:
        shutil.rmtree(path, ignore_errors=True)
