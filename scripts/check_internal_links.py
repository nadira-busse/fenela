#!/usr/bin/env python3
"""
Check that internal Markdown links in this repository point to files that exist.

This script is generic and only checks local Markdown links.
It scans Markdown files under the repository root, extracts links of the form
[text](target), and verifies that relative file links resolve to a real path
on disk.

External links (http/https), mail links and in-page anchors (#section) are
skipped, since those cannot be checked locally.

Generated, dependency, private and local deployment folders are skipped.

Usage:
    python scripts/check_internal_links.py
    py scripts/check_internal_links.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LINK_PATTERN = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")

EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".venv",
    ".vercel",
    "__pycache__",
    "docs-learning-private",
    "node_modules",
    "venv",
}


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in path.parts)


def find_markdown_files(root: Path) -> list[Path]:
    return sorted(
        path
        for path in root.rglob("*.md")
        if not is_excluded(path.relative_to(root))
    )


def is_external_or_anchor(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "#"))


def resolve_link(markdown_file: Path, target: str) -> Path:
    path_part = target.split("#", 1)[0]
    base_dir = markdown_file.parent
    return (base_dir / path_part).resolve()


def check_file(markdown_file: Path) -> list[str]:
    problems: list[str] = []
    text = markdown_file.read_text(encoding="utf-8")

    for match in LINK_PATTERN.finditer(text):
        _, target = match.groups()

        if not target or is_external_or_anchor(target):
            continue

        resolved = resolve_link(markdown_file, target)

        if not resolved.exists():
            rel_source = markdown_file.relative_to(ROOT)
            problems.append(f"{rel_source}: broken link -> {target}")

    return problems


def main() -> int:
    markdown_files = find_markdown_files(ROOT)

    if not markdown_files:
        print("No Markdown files found.")
        return 0

    all_problems: list[str] = []

    for markdown_file in markdown_files:
        all_problems.extend(check_file(markdown_file))

    checked_count = len(markdown_files)

    if all_problems:
        print(f"Checked {checked_count} Markdown files.\n")
        print("\n".join(all_problems))
        print(f"\n{len(all_problems)} broken link(s) found.")
        return 1

    print(f"Checked {checked_count} Markdown files. All internal links resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())