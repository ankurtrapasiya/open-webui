"""Recall route helpers: Missed/Knew it into Review's "My gaps" deck with the Review tool's rules.

Run: a venv with `fsrs` outside conda, then  python tests/outis/backend/test_recall.py
scripts/outis-regression.sh also runs it inside the image under test (RECALL_PY, REVIEW_DB).
"""
import hashlib
import importlib.util
import os
import pathlib
import sqlite3
import tempfile

path = os.environ.get('RECALL_PY') or pathlib.Path(__file__).resolve().parents[3] / 'backend/open_webui/routers/outis_recall.py'
spec = importlib.util.spec_from_file_location('outis_recall', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

db = os.environ.get('REVIEW_DB') or os.path.join(tempfile.mkdtemp(), 'review.db')
if os.path.exists(db):
    os.remove(db)

r1 = m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Chain rule', 'missed')
assert r1['stored'] and r1['card_id'] == m.card_id('My gaps', 'ML Maths → Calculus → ?') and r1['due'], r1
row = sqlite3.connect(db).execute('select deck, chapter, question, answer, fsrs from card').fetchone()
assert row[:4] == ('My gaps', 'ML Maths', 'ML Maths → Calculus → ?', 'Chain rule') and row[4], row
assert sqlite3.connect(db).execute("select active from deck where name='My gaps'").fetchone()[0] == 1
assert sqlite3.connect(db).execute('select rating from log').fetchall() == [('again',)]
r2 = m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Chain rule', 'knew')
assert r2['stored'] and r2['due'] > r1['due'], (r1, r2)
assert m.record(db, 'ML Maths', ['ML Maths', 'Stats'], 'Bayes', 'knew') == {'stored': False, 'card_id': None, 'due': None}
assert sqlite3.connect(db).execute('select count(*) from card').fetchone()[0] == 1
try:
    m.record('/nonexistent/dir/x.db', 'r', ['r'], 'l', 'missed')
    raise SystemExit('expected OperationalError')
except sqlite3.OperationalError:
    pass
assert m.card_id('My gaps', 'q') == hashlib.sha1('My gaps\nq'.encode()).hexdigest()[:16]
assert m.question_for(['A', 'B']) == 'A → B → ?'
print('PASS test_recall')
