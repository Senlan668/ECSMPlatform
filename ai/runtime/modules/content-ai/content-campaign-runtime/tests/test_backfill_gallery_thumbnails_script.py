import os
import subprocess
import sys
from pathlib import Path


def test_backfill_script_runs_without_pythonpath_environment():
    project_root = Path(__file__).resolve().parent.parent
    script = project_root / "scripts" / "backfill_gallery_thumbnails.py"
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=project_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Backfill gallery thumbnails" in result.stdout
