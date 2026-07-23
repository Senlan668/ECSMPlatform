from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
MCP_ROOT = (
    WORKSPACE_ROOT
    / "ai"
    / "runtime"
    / "modules"
    / "model-gateway"
    / "shared-ai-services"
    / "mcp-demo"
)
PORTS = (9001, 9002, 9003, 9004, 8105)


def port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.2)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def wait_for_gateway(processes: list[subprocess.Popen[bytes]]) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        exited = [process.pid for process in processes if process.poll() is not None]
        if exited:
            raise RuntimeError(f"MCP child process exited before readiness: {exited}")
        try:
            with urllib.request.urlopen(
                "http://127.0.0.1:8105/api/health",
                timeout=3,
            ) as response:
                payload = json.load(response)
            if payload.get("status") == "ok":
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise TimeoutError("MCP gateway did not report all services healthy within 60 seconds")


def main() -> int:
    occupied = [port for port in PORTS if port_is_open(port)]
    if occupied:
        raise RuntimeError(f"MCP verification ports are already in use: {occupied}")

    environment = os.environ.copy()
    environment.update(
        {
            "MCP_CUSTOMER_SERVICE_API_KEY": f"verify-customer-{uuid.uuid4().hex}",
            "MCP_WRITING_ASSISTANT_API_KEY": f"verify-writer-{uuid.uuid4().hex}",
            "MCP_GATEWAY_URL": "http://127.0.0.1:8105",
            "MCP_RAG_STORAGE_MODE": "memory",
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }
    )
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    commands = [
        [sys.executable, "shared/llm_gateway/server.py"],
        [sys.executable, "shared/rag_service/server.py"],
        [sys.executable, "shared/memory_service/server.py"],
        [sys.executable, "shared/prompt_hub/server.py"],
        [
            sys.executable,
            "-m",
            "uvicorn",
            "gateway.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8105",
        ],
    ]
    processes: list[subprocess.Popen[bytes]] = []
    try:
        for command in commands:
            processes.append(
                subprocess.Popen(
                    command,
                    cwd=MCP_ROOT,
                    env=environment,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags,
                )
            )

        wait_for_gateway(processes)
        result = subprocess.run(
            [sys.executable, "scripts/test_gateway.py"],
            cwd=MCP_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
            check=False,
        )
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        if result.returncode != 0:
            raise RuntimeError(f"MCP gateway verification failed with code {result.returncode}")
        return 0
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in reversed(processes):
            if process.poll() is not None:
                continue
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
