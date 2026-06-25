#!/usr/bin/env python3
"""Audit Flutter i18n coverage.

Scans mobile/lib for user-facing English string literals (Text, hint/label/title/
tooltip, AppSnackbar messages) and reports which ones are NOT yet in the
Indonesian map (lib/core/i18n/strings_id.g.dart). Use the printed "MISSING" list
to extend the map toward 100% coverage.

Usage:  python scripts/i18n_audit.py [--missing-only]
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "mobile", "lib")
MAP = os.path.join(ROOT, "core", "i18n", "strings_id.g.dart")

# User-facing string patterns. We only consider strings that start with a letter
# and contain at least one space OR are clearly a label (>=3 chars), to skip ids,
# routes, keys, asset paths, etc.
PATTERNS = [
    re.compile(r"Text\(\s*'([^'\\]{2,})'"),
    re.compile(r"(?:hintText|labelText|tooltip|title|label|message|helperText)\s*:\s*'([^'\\]{2,})'"),
    re.compile(r"Text\(\s*\"([^\"\\]{2,})\""),
    re.compile(r"AppSnackbar\.show\(\s*[^,]+,\s*'([^'\\]{3,})'"),
]
# Skip strings that are obviously not UI copy.
SKIP = re.compile(r"^[a-z_]+$|^/|^@|\.(png|jpg|svg|json)$|^\$|^[0-9]")


def translated_keys() -> set:
    if not os.path.exists(MAP):
        return set()
    text = open(MAP, encoding="utf-8").read()
    return set(re.findall(r"'((?:[^'\\]|\\')*)'\s*:", text))


def scan() -> dict:
    found = {}  # string -> list of "file:line"
    for dirpath, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith(".dart") or f.endswith(".g.dart"):
                continue
            path = os.path.join(dirpath, f)
            for i, line in enumerate(open(path, encoding="utf-8", errors="ignore"), 1):
                for pat in PATTERNS:
                    for m in pat.findall(line):
                        s = m.strip()
                        if not s or SKIP.search(s):
                            continue
                        if " " not in s and len(s) < 3:
                            continue
                        found.setdefault(s, []).append(
                            f"{os.path.relpath(path, ROOT)}:{i}")
    return found


def main() -> int:
    missing_only = "--missing-only" in sys.argv
    have = translated_keys()
    found = scan()
    missing = sorted(s for s in found if s not in have)
    covered = len(found) - len(missing)
    print(f"i18n coverage: {covered}/{len(found)} strings translated "
          f"({100 * covered // max(1, len(found))}%)")
    print(f"translated map keys: {len(have)}\n")
    if missing:
        print(f"MISSING ({len(missing)}) — add these to strings_id.g.dart:")
        for s in missing:
            print(f"  '{s}': '',")
    elif not missing_only:
        print("All scanned strings are translated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
