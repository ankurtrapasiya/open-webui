#!/usr/bin/env python3
"""After merging a new upstream release: list fork lines that did not survive.

    python3 scripts/outis-lost-lines.py <old-upstream-tag> <pre-merge-fork-ref> [merged-ref]

For every file the fork changed (old tag -> pre-merge fork), take each line the fork added and
look for it (whitespace-insensitive) in the merged tree (default: the working tree). A line that is
gone was dropped or rewritten by the merge; each one needs a look, not necessarily a fix (upstream
may have taken the change in another form). Locale files are left to outis-merge-locales.py.
"""
import subprocess
import sys


def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True).stdout


def main(old, fork, merged=None):
    files = git("diff", "--name-only", "--diff-filter=AM", old, fork).split()
    # files upstream moved since the old tag: old path -> new path
    status = git("diff", "-M", "--name-status", "--diff-filter=R", old, *([merged] if merged else []))
    renamed = {parts[1]: parts[2] for parts in (l.split("\t") for l in status.splitlines())}
    total = 0
    for f in files:
        if "/i18n/locales/" in f or f.endswith((".png", ".jpg", ".svg", ".woff2", ".lock")):
            continue
        path = renamed.get(f, f)
        if merged:
            text = git("show", f"{merged}:{path}")
        else:
            try:
                text = open(path, encoding="utf-8").read()
            except (FileNotFoundError, UnicodeDecodeError):
                text = ""
        have = {" ".join(line.split()) for line in text.splitlines()}
        diff = git("diff", "-U0", old, fork, "--", f).splitlines()
        added = [line[1:] for line in diff if line.startswith("+") and not line.startswith("+++")]
        lost = [a for a in added if " ".join(a.split()) and " ".join(a.split()) not in have]
        if lost:
            total += len(lost)
            print(f"== {f}: {len(lost)} of {len(added)} fork lines missing")
            for a in lost[:15]:
                print(f"   {a.strip()[:140]}")
    print(f"TOTAL missing fork lines: {total}")


if __name__ == "__main__":
    main(*sys.argv[1:])
