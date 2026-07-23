from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


WORKSPACE = Path(__file__).resolve().parents[1]
CONFIG_PATH = WORKSPACE / "config" / "five-project-integration.json"
DEFAULT_SOURCE = Path("D:\\Code\\\u61c2\u738b\\\u4ee3\u7801")
DEFAULT_SNAPSHOT = WORKSPACE / "docs" / "five-project-source-manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def posix_relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def exclusion_reason(relative: str, project: dict, config: dict) -> str | None:
    parts = relative.split("/")
    excluded_directories = set(config["commonExcludedDirectories"])
    if any(part in excluded_directories for part in parts):
        return "generated-or-local-directory"

    suffix = Path(relative).suffix.lower()
    if suffix in set(config["commonExcludedExtensions"]):
        return "runtime-data-or-secret-extension"

    name = Path(relative).name
    if name == ".env" or name == "env.example" or name.startswith(".env."):
        return "source-secret-configuration"

    folded = relative.casefold()
    for prefix in project.get("excludedPrefixes", []):
        normalized = prefix.replace("\\", "/").strip("/").casefold()
        if folded == normalized or folded.startswith(normalized + "/"):
            return "project-runtime-data"
    for filename in project.get("excludedFiles", []):
        if folded == filename.replace("\\", "/").casefold():
            return "project-data-or-secret"
    return None


def discover_source(source_root: Path, marker: str) -> Path:
    matches = [child for child in source_root.iterdir() if child.is_dir() and (child / marker).is_file()]
    if len(matches) != 1:
        raise RuntimeError(f"marker {marker!r} matched {len(matches)} source projects")
    return matches[0]


def has_live_source_projects(source_root: Path, config: dict) -> bool:
    if not source_root.is_dir():
        return False
    children = [child for child in source_root.iterdir() if child.is_dir()]
    return any((child / project["marker"]).is_file() for child in children for project in config["projects"])


def scan_live_sources(source_root: Path, config: dict) -> tuple[list[dict], list[dict], list[dict]]:
    entries: list[dict] = []
    excluded_entries: list[dict] = []
    summaries: list[dict] = []
    for project in config["projects"]:
        source = discover_source(source_root, project["marker"])
        target = (WORKSPACE / project["target"]).resolve()
        counts = {"included": 0, "excluded": 0, "exact": 0, "modified": 0, "missing": 0}
        excluded_by_reason: dict[str, int] = {}
        for source_file in sorted(path for path in source.rglob("*") if path.is_file()):
            relative = posix_relative(source_file, source)
            reason = exclusion_reason(relative, project, config)
            if reason:
                counts["excluded"] += 1
                excluded_by_reason[reason] = excluded_by_reason.get(reason, 0) + 1
                if reason != "generated-or-local-directory":
                    excluded_entries.append({
                        "project": project["id"],
                        "path": relative,
                        "reason": reason,
                        "sourceSha256": sha256(source_file),
                        "sourceBytes": source_file.stat().st_size,
                    })
                continue

            counts["included"] += 1
            target_file = target / Path(relative)
            target_hash = sha256(target_file) if target_file.is_file() else None
            source_hash = sha256(source_file)
            state = "missing" if target_hash is None else "exact" if target_hash == source_hash else "modified"
            counts[state] += 1
            entries.append({
                "project": project["id"], "path": relative, "excluded": False, "state": state,
                "sourceSha256": source_hash, "targetSha256": target_hash,
                "sourceBytes": source_file.stat().st_size,
                "targetBytes": target_file.stat().st_size if target_file.is_file() else None,
            })
        summaries.append({
            "project": project["id"],
            "sourceDirectory": source.name,
            **counts,
            "excludedByReason": excluded_by_reason,
        })
    return entries, summaries, excluded_entries


def verify_snapshot(snapshot: dict, config: dict) -> list[str]:
    errors = []
    targets = {project["id"]: WORKSPACE / project["target"] for project in config["projects"]}
    for entry in snapshot.get("files", []):
        if entry.get("excluded"):
            continue
        target = targets[entry["project"]] / Path(entry["path"])
        if not target.is_file():
            errors.append(f"missing migrated file: {entry['project']}:{entry['path']}")
        elif entry.get("sourceBytes", 0) > 0 and target.stat().st_size == 0:
            errors.append(f"empty migrated file: {entry['project']}:{entry['path']}")
        elif entry.get("targetSha256") and sha256(target) != entry["targetSha256"]:
            errors.append(f"migrated file changed after snapshot: {entry['project']}:{entry['path']}")
    return errors


def verify_required_files(config: dict) -> list[str]:
    errors = []
    for project in config["projects"]:
        target = WORKSPACE / project["target"]
        for relative in project.get("requiredFiles", []):
            if not (target / relative).is_file():
                errors.append(f"missing required runtime entrypoint: {project['id']}:{relative}")
    for relative in config.get("platformRequiredFiles", []):
        if not (WORKSPACE / relative).is_file():
            errors.append(f"missing platform integration file: {relative}")
    return errors


def verify_no_external_runtime_reference() -> list[str]:
    needles = {
        str(DEFAULT_SOURCE).casefold(),
        DEFAULT_SOURCE.as_posix().casefold(),
    }
    errors = []
    roots = [WORKSPACE / "frontend", WORKSPACE / "backend", WORKSPACE / "ai", WORKSPACE / "config"]
    ignored_parts = {"node_modules", ".venv", "target", "dist", ".runtime", "__pycache__"}
    for root in roots:
        for path in root.rglob("*"):
            if not path.is_file() or any(part in ignored_parts for part in path.parts):
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            folded = content.casefold()
            if any(needle in folded for needle in needles):
                errors.append(f"external source path remains in runtime code: {path.relative_to(WORKSPACE)}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify five-project source and runtime integration")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--write-snapshot", action="store_true")
    parser.add_argument("--require-source", action="store_true")
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    errors = verify_required_files(config) + verify_no_external_runtime_reference()
    source_exists = args.source_root.is_dir()
    live_sources_present = has_live_source_projects(args.source_root, config)

    if live_sources_present:
        entries, summaries, excluded_entries = scan_live_sources(args.source_root, config)
        errors.extend(
            f"missing migrated file: {entry['project']}:{entry['path']}"
            for entry in entries if not entry.get("excluded") and entry.get("state") == "missing"
        )
        snapshot = {
            "schemaVersion": 1,
            "sourceRootName": args.source_root.name,
            "projects": summaries,
            "files": entries,
            "excludedFiles": excluded_entries,
        }
        if args.write_snapshot:
            args.snapshot.parent.mkdir(parents=True, exist_ok=True)
            args.snapshot.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for summary in summaries:
            print(
                f"{summary['project']}: included={summary['included']} exact={summary['exact']} "
                f"modified={summary['modified']} excluded={summary['excluded']} missing={summary['missing']}"
            )
    elif args.require_source:
        detail = "contains no recognized source projects" if source_exists else "does not exist"
        errors.append(f"source root {detail}: {args.source_root}")
    elif args.snapshot.is_file():
        snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
        errors.extend(verify_snapshot(snapshot, config))
        print(f"source deleted; verified {len(snapshot.get('files', []))} snapshot entries")
    else:
        errors.append("source root and integration snapshot are both unavailable")

    if errors:
        print("integration verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("five-project integration file gate: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
