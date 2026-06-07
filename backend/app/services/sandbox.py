import io
import tarfile
import time

import docker


class SandboxError(Exception):
    pass

# Resource caps applied to every sandbox container (C1).
PIDS_LIMIT = 64                     # blocks fork bombs from exhausting host PIDs
CPU_NANO = 1_000_000_000            # 1 CPU
SANDBOX_USER = "65534:65534"        # nobody:nogroup, numeric so no /etc/passwd lookup
COMPILE_MEM = "512m"                # generous fixed budget for the compiler
# tmpfs gives the sandbox user writable space on top of a read-only rootfs; sizes
# also cap disk-fill abuse. Directories are private to the sandbox user instead
# of world-writable.
TMPFS_OWNER = "uid=65534,gid=65534,mode=0700"
SANDBOX_TMPDIR = "/box/.tmp"
RUN_TMPFS = {
    "/box": f"rw,exec,size=64m,{TMPFS_OWNER},nosuid,nodev",
}
COMPILE_TMPFS = {
    "/box": f"rw,size=256m,{TMPFS_OWNER},noexec,nosuid,nodev",
}

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
        tmpfs=tmpfs,
        environment={
            "TMPDIR": SANDBOX_TMPDIR,
            "TEMP": SANDBOX_TMPDIR,
            "TMP": SANDBOX_TMPDIR,
        },
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


def _read_file_limited(container, path: str, limit: int) -> tuple[str, bool]:
    size_code, size_out = container.exec_run(
        ["sh", "-c", f"test -f {path} && wc -c < {path} || echo 0"]
    )
    size_text = size_out.decode("utf-8", errors="ignore").strip() or "0"
    size = int(size_text) if size_code == 0 else 0
    read_code, read_out = container.exec_run(
        ["sh", "-c", f"test -f {path} && head -c {limit} {path} || true"]
    )
    text = read_out.decode("utf-8", errors="ignore") if read_code == 0 else ""
    return text, size > limit

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
        # put_archive/get_archive act on the image layer *beneath* the tmpfs at
        # /box, so files copied straight to /box are invisible to in-container
        # tools (and snapshotting /box reads back empty). Stage the source on the
        # overlay (/opt), then copy it into the tmpfs from inside the container.
        container.put_archive("/opt", _create_tar({filename: code}))

        build = f"mkdir -p {SANDBOX_TMPDIR} && cp /opt/{filename} /box/"
        if lang == "cpp17":
            build += " && g++ -O2 -std=c++17 main.cpp -o main"
        exit_code, output = container.exec_run(["sh", "-c", build], workdir="/box")
        if exit_code != 0:
            return False, output.decode("utf-8", errors="ignore")

        # Copy the built /box (source + binary) back onto the overlay as root so
        # get_archive can capture it. Root ownership (cp without -p) also prevents
        # untrusted run-time code from overwriting these files on the uncapped
        # overlay. Each test then runs in its own fresh, resource-limited container.
        exit_code, output = container.exec_run(
            [
                "sh",
                "-c",
                f"rm -rf {SANDBOX_TMPDIR} && mkdir -p /opt/box && cp -r /box/. /opt/box/",
            ],
            user="0",
        )
        if exit_code != 0:
            return False, output.decode("utf-8", errors="ignore")
        bits, _ = container.get_archive("/opt/box")
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

        # Restore the compiled box and test input onto the overlay (/opt), then
        # copy them into the tmpfs /box from inside the container — put_archive
        # cannot deliver files into a tmpfs mount the process can see.
        container.put_archive("/opt", box_archive)                    # -> /opt/box/...
        container.put_archive("/opt", _create_tar({"input.txt": input_data}))

        stage = (
            f"mkdir -p {SANDBOX_TMPDIR} && cp -r /opt/box/. /box/ && cp /opt/input.txt /box/"
        )
        exit_code, _ = container.exec_run(["sh", "-c", stage], workdir="/box")
        if exit_code != 0:
            return "System Error", 0, 0

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

        # Read program output from inside the container; get_archive would read the
        # empty overlay beneath the tmpfs, not what the process actually wrote.
        rc, out = container.exec_run(["cat", "/box/output.txt"], workdir="/box")
        actual_out = out.decode("utf-8", errors="ignore") if rc == 0 else ""

        if actual_out.strip().split() != expected_output.strip().split():
            return "Wrong Answer", time_used_ms, mem_used_kb

        return "Accepted", time_used_ms, mem_used_kb
    finally:
        _remove_container(box_dir)


def run_custom_input(
    box_id: int,
    lang: str,
    time_limit_ms: int,
    memory_limit_mb: int,
    input_data: str,
    box_dir: dict,
    output_limit: int = 32 * 1024,
) -> tuple[str, int, int, str, str, bool, bool]:
    client = box_dir.get("client")
    box_archive = box_dir.get("box_archive")
    if not client or box_archive is None:
        return "System Error", 0, 0, "", "", False, False

    time_limit_s = time_limit_ms / 1000.0
    mem_limit = f"{memory_limit_mb}m"

    try:
        container = _create_container(
            client,
            _image(lang),
            mem_limit,
            ["sleep", str(int(time_limit_s) + 10)],
            RUN_TMPFS,
        )
        box_dir["container"] = container

        container.put_archive("/opt", box_archive)
        container.put_archive("/opt", _create_tar({"input.txt": input_data}))

        stage = (
            f"mkdir -p {SANDBOX_TMPDIR} && cp -r /opt/box/. /box/ && cp /opt/input.txt /box/"
        )
        exit_code, stage_output = container.exec_run(["sh", "-c", stage], workdir="/box")
        if exit_code != 0:
            return (
                "System Error",
                0,
                0,
                "",
                stage_output.decode("utf-8", errors="ignore"),
                False,
                False,
            )

        if lang == "python3":
            cmd = f"timeout {time_limit_s}s python3 main.py < input.txt > output.txt 2> stderr.txt"
        else:
            cmd = f"timeout {time_limit_s}s ./main < input.txt > output.txt 2> stderr.txt"

        start_time = time.time()
        exit_code, _ = container.exec_run(["sh", "-c", cmd], workdir="/box")
        time_used_ms = int((time.time() - start_time) * 1000)
        mem_used_kb = _read_peak_kb(container)
        stdout, stdout_truncated = _read_file_limited(container, "/box/output.txt", output_limit)
        stderr, stderr_truncated = _read_file_limited(container, "/box/stderr.txt", output_limit)

        if exit_code == 124:
            verdict = "Time Limit Exceeded"
            time_used_ms = time_limit_ms
        elif exit_code == 137 or exit_code == 9:
            verdict = "Memory Limit Exceeded"
            mem_used_kb = memory_limit_mb * 1024
        elif exit_code != 0:
            verdict = "Runtime Error"
        else:
            verdict = "OK"

        return (
            verdict,
            time_used_ms,
            mem_used_kb,
            stdout,
            stderr,
            stdout_truncated,
            stderr_truncated,
        )
    finally:
        _remove_container(box_dir)
