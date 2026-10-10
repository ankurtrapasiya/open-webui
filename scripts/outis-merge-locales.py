#!/usr/bin/env python3
"""Resolve conflicted i18n locale files during an upstream merge.

    python3 scripts/outis-merge-locales.py            # every conflicted translation.json
    python3 scripts/outis-merge-locales.py --test     # self-check

Result = upstream's file, plus every key the fork added, plus the fork's value for every key
the fork changed (the Outis rebrand lives in en-US values). A fork key upstream deleted stays
only if the fork added it. Fork-added keys go right after the key they followed in the fork.
"""
import json
import subprocess
import sys
import unicodedata


def merge(base, ours, theirs):
    out = dict(theirs)
    for k, v in ours.items():
        if k not in base or (k in theirs and base[k] != v):
            out[k] = v
    # place fork-added keys after their predecessor in the fork's order
    order = [k for k in theirs]
    keys = list(ours)
    for i, k in enumerate(keys):
        if k in theirs:
            continue
        if k not in out:
            continue
        prev = next((p for p in reversed(keys[:i]) if p in order), None)
        order.insert(order.index(prev) + 1 if prev else 0, k)
    return {k: out[k] for k in order}


def dump(d):
    # upstream writes invisible format characters (e.g. U+200C in fa-IR) as \\uXXXX escapes
    text = json.dumps(d, ensure_ascii=False, indent="\t") + "\n"
    return "".join(f"\\u{ord(c):04x}" if unicodedata.category(c) == "Cf" else c for c in text)


def stage(n, path):
    r = subprocess.run(["git", "show", f":{n}:{path}"], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else {}


def main():
    files = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=U"], capture_output=True, text=True, check=True
    ).stdout.split()
    files = [f for f in files if f.startswith("src/lib/i18n/locales/") and f.endswith(".json")]
    for f in files:
        base, ours, theirs = stage(1, f), stage(2, f), stage(3, f)
        merged = merge(base, ours, theirs)
        # upstream deleted (often: renamed) a key whose value the fork changed: rebrand may be lost
        for k in ours:
            if k in base and k not in theirs and ours[k] != base[k]:
                print(f"CHECK {f}: upstream dropped fork-changed key {k!r} = {ours[k]!r}")
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(dump(merged))
        subprocess.run(["git", "add", f], check=True)
    print(f"resolved {len(files)} locale files")


def test():
    base = {"a": "", "b": "Open WebUI", "c": ""}
    ours = {"a": "", "fork": "", "b": "Outis", "c": ""}
    theirs = {"a": "", "b": "Open WebUI", "new": "", "c": "x"}
    got = merge(base, ours, theirs)
    assert got == {"a": "", "fork": "", "b": "Outis", "new": "", "c": "x"}, got
    assert list(got) == ["a", "fork", "b", "new", "c"], list(got)
    assert dump({"k": "a\u200cb"}) == '{\n\t"k": "a\\u200cb"\n}\n', dump({"k": "a\u200cb"})
    print("ok")


if __name__ == "__main__":
    test() if "--test" in sys.argv else main()
