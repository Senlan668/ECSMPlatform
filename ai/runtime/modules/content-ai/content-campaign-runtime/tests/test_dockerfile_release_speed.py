from pathlib import Path


def test_backend_dockerfile_avoids_slow_system_package_install_layer():
    dockerfile = Path("Dockerfile").read_text()
    instructions = "\n".join(
        line for line in dockerfile.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )

    assert "apt-get update" not in instructions
    assert "apt-get install" not in instructions
    assert "libpq-dev" not in instructions
    assert "gcc" not in instructions


def test_backend_dockerfile_uses_single_worker_for_in_memory_batch_tasks():
    dockerfile = Path("Dockerfile").read_text()
    instructions = "\n".join(
        line for line in dockerfile.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )

    assert "--workers 2" not in instructions
    assert "--workers 1" in instructions
