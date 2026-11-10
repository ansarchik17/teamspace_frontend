#!/usr/bin/env python3
"""Resolve a weekly, content-addressed infrastructure image without compiling it."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def image_tag(image, context, week=None):
    if not re.fullmatch(r"ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+", image):
        raise ValueError("Expected a GHCR image name without a tag")
    context = Path(context)
    if not (context / "Dockerfile").is_file():
        raise ValueError("Infrastructure context must contain Dockerfile")
    week = week or datetime.datetime.now(datetime.timezone.utc).strftime("%G-W%V")
    digest = hashlib.sha256(b"ci-infrastructure-v1\0linux/amd64\0")
    digest.update(week.encode() + b"\0")
    # Only skip generated roots explicitly excluded from the Docker context.
    # Hash everything else, even if Docker ignores more, to prefer a safe miss.
    ignore_file = context / ".dockerignore"
    rules = ignore_file.read_text().splitlines() if ignore_file.is_file() else []
    ignored_roots = {name for name in ("node_modules", "dist", ".git") if name in rules}
    # Negation could re-include an input; conservatively hash the whole context.
    if any(line.lstrip().startswith("!") for line in rules):
        ignored_roots.clear()
    paths = []
    for root, directories, files in os.walk(context, followlinks=False):
        if Path(root) == context:
            directories[:] = [name for name in directories if name not in ignored_roots]
            files = [name for name in files if name not in ignored_roots]
        paths.extend(Path(root) / name for name in directories + files)
    for path in sorted(paths):
        if path.is_symlink():
            raise ValueError("Infrastructure contexts cannot contain symlinks")
        if path.is_file():
            digest.update(path.relative_to(context).as_posix().encode() + b"\0")
            data = path.read_bytes()
            digest.update(str(len(data)).encode() + b"\0" + data)
            digest.update(str(path.stat().st_mode & 0o111).encode() + b"\0")
    return f"{image}:infra-{digest.hexdigest()}"


def lookup(tag):
    result = subprocess.run(
        ["docker", "buildx", "imagetools", "inspect", tag,
         "--format", "{{json .Manifest}}"],
        capture_output=True, text=True, timeout=90, check=False,
    )
    if result.returncode:
        # Authentication, connectivity and registry outages are not cache misses.
        if re.search(r"\b(manifest unknown|name unknown|not found)\b", result.stderr, re.I):
            return ""
        raise RuntimeError("Infrastructure registry lookup failed; retry the job after checking registry access")
    digest = json.loads(result.stdout).get("digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("Registry did not return a valid immutable manifest digest")
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()
    tag = image_tag(args.image, args.context)
    digest = lookup(tag)
    output = f"tag={tag}\nhit={'true' if digest else 'false'}\ndigest={digest}\n"
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        stream.write(output)
    print("Reusing infrastructure image by immutable digest" if digest else
          "Infrastructure inputs changed or weekly refresh is due; building once")


if __name__ == "__main__":
    main()
