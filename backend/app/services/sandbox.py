import os
import tarfile
import io
import time
import docker

class SandboxError(Exception):
    pass

def init_box(box_id: int) -> dict:
    client = docker.from_env()
    return {"client": client, "box_id": str(box_id)}

def cleanup_box(box_dir: dict):
    if box_dir and "container" in box_dir:
        try:
            box_dir["container"].remove(force=True)
        except Exception:
            pass

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
    image = "python:3.12-slim" if lang == "python3" else "gcc:latest"
    
    try:
        # Pull image if not exists (in a real system, you'd pre-pull these)
        try:
            client.images.get(image)
        except docker.errors.ImageNotFound:
            client.images.pull(image)
            
        container = client.containers.run(
            image,
            command=["sleep", "3600"],
            detach=True,
            network_mode="none",
            mem_limit="512m",
            working_dir="/box"
        )
        box_dir["container"] = container
        
        container.exec_run("mkdir -p /box")
        
        filename = "main.py" if lang == "python3" else "main.cpp"
        tar_data = _create_tar({filename: code})
        container.put_archive("/box", tar_data)
        
        if lang == "cpp17":
            exit_code, output = container.exec_run(
                ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"],
                workdir="/box"
            )
            if exit_code != 0:
                return False, output.decode("utf-8", errors="ignore")
                
        return True, ""
    except Exception as e:
        return False, str(e)

def run_test_case(
    box_id: int, 
    lang: str, 
    time_limit_ms: int, 
    memory_limit_mb: int, 
    input_data: str, 
    expected_output: str,
    box_dir: dict
) -> tuple[str, int, int]:
    container = box_dir.get("container")
    if not container:
        return "System Error", 0, 0
        
    tar_data = _create_tar({"input.txt": input_data})
    container.put_archive("/box", tar_data)
    
    time_limit_s = time_limit_ms / 1000.0
    
    if lang == "python3":
        cmd = f"timeout {time_limit_s}s python3 main.py < input.txt > output.txt"
    else:
        cmd = f"timeout {time_limit_s}s ./main < input.txt > output.txt"
    
    start_time = time.time()
    exit_code, output = container.exec_run(
        ["sh", "-c", cmd],
        workdir="/box"
    )
    time_used_ms = int((time.time() - start_time) * 1000)
    mem_used_kb = 0  # Docker exec_run doesn't expose peak mem usage easily
    
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
