"""MEM-1: the background memory reviewer can only write and touch study/ memories.

Run: /usr/bin/python3 tests/outis/backend/test_study_memory.py  (no Open WebUI install needed)
scripts/outis-regression.sh also runs it inside the image under test.
"""
import importlib.util
import os
import pathlib

# STUDY_MEMORY_PY lets the regression script check the copy inside the image.
path = os.environ.get('STUDY_MEMORY_PY') or pathlib.Path(__file__).resolve().parents[3] / 'backend/open_webui/utils/study_memory.py'
spec = importlib.util.spec_from_file_location('study_memory', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

existing = {'s1': 'study/statistics/covariance', 'u1': 'education/course', 'n1': None}
ops = [
    {'action': 'add', 'path': 'study/finance/sharpe-ratio', 'content': 'shaky'},  # kept
    {'action': 'add', 'path': 'profile/name', 'content': 'x'},  # outside study/
    {'action': 'add', 'path': None, 'content': 'x'},  # no path
    {'action': 'add', 'path': 'studying/x', 'content': 'x'},  # prefix lookalike
    {'action': 'replace', 'id': 's1', 'path': 'study/statistics/covariance', 'content': 'ok'},  # kept
    {'action': 'replace', 'id': 'u1', 'path': 'study/x', 'content': 'x'},  # target outside study/
    {'action': 'move', 'id': 's1', 'path': 'people/x'},  # moves out of study/
    {'action': 'remove', 'id': 'u1'},  # hand-saved memory
    {'action': 'remove', 'id': 'n1'},  # pathless memory
    {'action': 'remove', 'id': 's1'},  # kept
    {'action': 'wipe'},
    'junk',
]
kept = m.keep_study_operations(ops, existing)
assert [(o['action'], o.get('id'), o.get('path')) for o in kept] == [
    ('add', None, 'study/finance/sharpe-ratio'),
    ('replace', 's1', 'study/statistics/covariance'),
    ('remove', 's1', None),
], kept
print('MEM-1 pass')
