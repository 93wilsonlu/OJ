import os
import random
import subprocess
import shutil

class SandboxError(Exception):
    pass

def init_box(box_id: int) -> str:
    res = subprocess.run(["isolate", "--init", "--cg", "-b", str(box_id)], capture_output=True, text=True)
    if res.returncode != 0:
        raise SandboxError(f"Failed to init isolate: {res.stderr}")
    return res.stdout.strip()

def cleanup_box(box_id: int):
    subprocess.run(["isolate", "--cleanup", "--cg", "-b", str(box_id)], capture_output=True)

def compile_code(box_id: int, lang: str, code: str, box_dir: str) -> tuple[bool, str]:
    box_root = os.path.join(box_dir, "box")
    if lang == "python3":
        with open(os.path.join(box_root, "main.py"), "w") as f:
            f.write(code)
        return True, ""
    elif lang == "cpp17":
        with open(os.path.join(box_root, "main.cpp"), "w") as f:
            f.write(code)
        
        # Compile inside isolate
        cmd = [
            "isolate", "--cg", "-b", str(box_id),
            "-d", "/usr", "-d", "/lib", "-d", "/lib64", "-d", "/etc", "-d", "/tmp",
            "--env=PATH=/usr/bin:/bin",
            "--time=10.0", "--wall-time=20.0", "--mem=512000",
            "--run", "--", "/usr/bin/g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            return False, res.stderr
        return True, ""
    else:
        return False, "Unsupported language"

def parse_meta(meta_path: str) -> dict:
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, "r") as f:
            for line in f:
                if ":" in line:
                    k, v = line.strip().split(":", 1)
                    meta[k] = v
    return meta

def run_test_case(
    box_id: int, 
    lang: str, 
    time_limit_ms: int, 
    memory_limit_mb: int, 
    input_data: str, 
    expected_output: str,
    box_dir: str
) -> tuple[str, int, int]:
    """
    Returns (verdict, time_used_ms, memory_used_kb)
    """
    box_root = os.path.join(box_dir, "box")
    
    # Write input file
    with open(os.path.join(box_root, "input.txt"), "w") as f:
        f.write(input_data)
        
    meta_path = f"/tmp/meta_{box_id}.txt"
    out_path = "output.txt"
    err_path = "err.txt"
    
    time_limit_s = time_limit_ms / 1000.0
    wall_time = time_limit_s + 1.0
    mem_limit_kb = memory_limit_mb * 1024
    
    cmd = [
        "isolate", "--cg", "-b", str(box_id),
        "-d", "/usr", "-d", "/lib", "-d", "/lib64", "-d", "/etc", "-d", "/tmp",
        "--env=PATH=/usr/bin:/bin",
        f"--time={time_limit_s}", f"--wall-time={wall_time}", f"--mem={mem_limit_kb}",
        f"--meta={meta_path}",
        "--stdin=input.txt", f"--stdout={out_path}", f"--stderr={err_path}"
    ]
    
    if lang == "python3":
        cmd.extend(["--run", "--", "/usr/bin/python3", "main.py"])
    elif lang == "cpp17":
        cmd.extend(["--run", "--", "./main"])
        
    res = subprocess.run(cmd, capture_output=True, text=True)
    
    meta = parse_meta(meta_path)
    time_used = int(float(meta.get("time", "0")) * 1000)
    mem_used = int(meta.get("cg-mem", meta.get("max-rss", "0")))
    
    verdict = "Accepted"
    
    status = meta.get("status")
    if status == "TO":
        verdict = "Time Limit Exceeded"
    elif status == "SG":
        message = meta.get("message", "")
        if "11" in message: # SIGSEGV
            verdict = "Runtime Error"
        else:
            verdict = "Runtime Error"
    elif status == "RE":
        verdict = "Runtime Error"
    elif status == "XX":
        verdict = "System Error"
    elif status == "ME":
        verdict = "Memory Limit Exceeded"
    elif res.returncode != 0 and not status:
        verdict = "Runtime Error"
        
    if verdict == "Accepted":
        # Compare output
        actual_output_path = os.path.join(box_root, out_path)
        if os.path.exists(actual_output_path):
            with open(actual_output_path, "r") as f:
                actual_out = f.read().strip()
        else:
            actual_out = ""
            
        expected_out = expected_output.strip()
        
        # Simple whitespace insensitive comparison
        if actual_out.split() != expected_out.split():
            verdict = "Wrong Answer"
            
    if os.path.exists(meta_path):
        os.remove(meta_path)
        
    return verdict, time_used, mem_used
