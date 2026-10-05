"""Outis: the background memory reviewer may only keep study state, never facts about who the user is.

The prompt asks for this; this guard enforces it. Every operation the reviewer returns must stay
inside STUDY_ROOT, both where it writes and (for replace/move/remove) the memory it touches, so
memories the user saved by hand elsewhere are never changed by the reviewer.
No Open WebUI imports, so tests can load this file on its own.
"""

STUDY_ROOT = 'study'


def in_study(path: str | None) -> bool:
    parts = [part for part in (path or '').strip().split('/') if part]
    return bool(parts) and parts[0] == STUDY_ROOT


def keep_study_operations(operations: list, path_by_id: dict) -> list[dict]:
    kept = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        action = op.get('action')
        if action in {'replace', 'move', 'remove'} and not in_study(path_by_id.get(op.get('id'))):
            continue
        if action in {'add', 'replace', 'move'} and not in_study(op.get('path')):
            continue
        if action not in {'add', 'replace', 'move', 'remove'}:
            continue
        kept.append(op)
    return kept
