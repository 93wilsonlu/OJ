import os
import tarfile
import io
import time
import docker

class SandboxError(Exception):
    pass

# Resource caps applied to every sandbox container (C1).
PIDS_LIMIT = 64                     # blocks fork bombs from exhausting host PIDs
CPU_NANO = 1_000_000_000            # 1 CPU
SANDBOX_USER = "65534:65534"        # nobody:nogroup, numeric so no /etc/passwd lookup
COMPILE_MEM = "512m"                # generous fixed budget for the compiler
# tmpfs gives a writable /box and /tmp on top of a read-only rootfs; sizes also
# cap disk-fill abuse. tmpfs usage counts against the memory cgroup.
RUN_TMPFS = {"/box": "rw,size=64m,mode=1777", "/tmp": "rw,size=64m,mode=1777"}
COMPILE_TMPFS = {"/box": "rw,size=256m,mode=1777", "/tmp": "rw,size=256m,mode=1777"}

def _image(lang: str) -> str:
    return "python:3.12-slim" if lang == "python3" else "gcc:latest"

def init_box(box_id: int) -> dict:
    client = docker.from_env()
    return {"client": client, "box_id": str(box_id)}

def _create_container(client, image: str, mem_limit: str, command: list, tmpfs: dict):
    return client.containers.run(
        image,
        command=command,
        detach=True,
        network_mode="none",
        mem_limit=mem_limit,
        memswap_limit=mem_limit,        # == mem_limit disables swap -> strict enforcement
        pids_limit=PIDS_LIMIT,
        nano_cpus=CPU_NANO,
        cap_drop=["ALL"],
        security_opt=["no-new-privileges"],
        read_only=True,
        tmpfs=tmpfs,
        user=SANDBOX_USER,
        working_dir="/box",
    )

def _remove_container(box_dir: dict):
    container = box_dir.pop("container", None) if isinstance(box_dir, dict) else None
    if container is not None:
        try:
            container.remove(force=True, v=True)
        except Exception:
            pass

def cleanup_box(box_dir: dict):
    # Reaps any container left behind if compile/run aborted before its own cleanup.
    _remove_container(box_dir)

def _read_peak_kb(container) -> int:
    # Best-effort peak memory from the container's own cgroup (v2, then v1).
    for path in (
        "/sys/fs/cgroup/memory.peak",
        "/sys/fs/cgroup/memory/memory.max_usage_in_bytes",
    ):
        try:
            code, out = container.exec_run(["cat", path])
            if code == 0:
                return int(out.decode("utf-8", errors="ignore").strip()) // 1024
        except Exception:
            pass
    return 0

def _create_tar(files: dict) -> bytes:
    file_io = io.BytesIO()
    with tarfile.open(fileobj=file_io, mode="w") as tar:
        for name, content in files.items():
            content_bytes = content.encode("utf-8")
            tarinfo = tarfile.TarInfo(name=name)
            tarinfo.size = len(content_bytes)
            tarinfo.mtime = int(time.time())
            tar.addfile(tarinfo, io.BytesIO(content_bytes))
    return file_io.getvalue()

def compile_code(box_id: int, lang: str, code: str, box_dir: dict) -> tuple[bool, str]:
    client = box_dir["client"]
    image = _image(lang)

    try:
        # Pull image if not exists (in a real system, you'd pre-pull these)
        try:
            client.images.get(image)
        except docker.errors.ImageNotFound:
            client.images.pull(image)

        container = _create_container(client, image, COMPILE_MEM, ["sleep", "300"], COMPILE_TMPFS)
        box_dir["container"] = container

        filename = "main.py" if lang == "python3" else "main.cpp"
        container.put_archive("/box", _create_tar({filename: code}))

        if lang == "cpp17":
            exit_code, output = container.exec_run(
                ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"],
                workdir="/box"
            )
            if exit_code != 0:
                return False, output.decode("utf-8", errors="ignore")

        # Snapshot /box (source + compiled binary) so each test runs in its own
        # fresh, per-test resource-limited container.
        bits, _ = container.get_archive("/box")
        box_dir["box_archive"] = b"".join(bits)
        return True, ""
    except Exception as e:
        return False, str(e)
    finally:
        _remove_container(box_dir)

def run_test_case(
    box_id: int,
    lang: str,
    time_limit_ms: int,
    memory_limit_mb: int,
    input_data: str,
    expected_output: str,
    box_dir: dict
) -> tuple[str, int, int]:
    client = box_dir.get("client")
    box_archive = box_dir.get("box_archive")
    if not client or box_archive is None:
        return "System Error", 0, 0

    time_limit_s = time_limit_ms / 1000.0
    mem_limit = f"{memory_limit_mb}m"

    try:
        container = _create_container(
            client, _image(lang), mem_limit,
            ["sleep", str(int(time_limit_s) + 10)], RUN_TMPFS,
        )
        box_dir["container"] = container

        container.put_archive("/", box_archive)                       # restore compiled /box
        container.put_archive("/box", _create_tar({"input.txt": input_data}))

        if lang == "python3":
            cmd = f"timeout {time_limit_s}s python3 main.py < input.txt > output.txt"
        else:
            cmd = f"timeout {time_limit_s}s ./main < input.txt > output.txt"

        start_time = time.time()
        exit_code, _ = container.exec_run(["sh", "-c", cmd], workdir="/box")
        time_used_ms = int((time.time() - start_time) * 1000)
        mem_used_kb = _read_peak_kb(container)

        if exit_code == 124:
            return "Time Limit Exceeded", time_limit_ms, mem_used_kb
        elif exit_code == 137 or exit_code == 9:
            return "Memory Limit Exceeded", time_used_ms, memory_limit_mb * 1024
        elif exit_code != 0:
            return "Runtime Error", time_used_ms, mem_used_kb

        try:
            bits, stat = container.get_archive("/box/output.txt")
            tar_stream = io.BytesIO(b"".join(bits))
            with tarfile.open(fileobj=tar_stream) as tar:
                member = tar.next()
                f = tar.extractfile(member)
                actual_out = f.read().decode("utf-8", errors="ignore")
        except Exception:
            actual_out = ""

        if actual_out.strip().split() != expected_output.strip().split():
            return "Wrong Answer", time_used_ms, mem_used_kb

        return "Accepted", time_used_ms, mem_used_kb
    finally:
        _remove_container(box_dir)
