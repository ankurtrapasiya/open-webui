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

SIBS = ['Chain rule', 'Product rule', 'Quotient rule']
Q1 = 'ML Maths → Calculus → {?, Product rule, Quotient rule}'
r1 = m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Chain rule', 'missed', siblings=SIBS)
assert r1['stored'] and r1['card_id'] == m.card_id('My gaps', Q1) and r1['due'], r1
row = sqlite3.connect(db).execute('select deck, chapter, question, answer, fsrs from card').fetchone()
assert row[:4] == ('My gaps', 'ML Maths', Q1, 'Chain rule') and row[4], row
# Review C3: siblings must not share one card; Knew it on one must not touch another's miss.
r1b = m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Product rule', 'missed', siblings=SIBS)
assert r1b['card_id'] != r1['card_id']
assert m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Quotient rule', 'knew', siblings=SIBS)['stored'] is False
assert sqlite3.connect(db).execute('select count(*) from card').fetchone()[0] == 2
assert sqlite3.connect(db).execute("select answer from card where id=?", (r1['card_id'],)).fetchone()[0] == 'Chain rule'
assert m.question_for(['A', 'B'], ['x'], 'x') == 'A → B → ?'
assert m.question_for(['A'], ['x', 'y'], 'y') == 'A → {x, ?}'
assert sqlite3.connect(db).execute("select active from deck where name='My gaps'").fetchone()[0] == 1
assert sqlite3.connect(db).execute('select rating from log').fetchall() == [('again',), ('again',)]
r2 = m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Chain rule', 'knew', siblings=SIBS)
assert r2['stored'] and r2['due'] > r1['due'], (r1, r2)
assert m.record(db, 'ML Maths', ['ML Maths', 'Stats'], 'Bayes', 'knew', siblings=['Bayes']) == {'stored': False, 'card_id': None, 'due': None}
assert sqlite3.connect(db).execute('select count(*) from card').fetchone()[0] == 2
try:
    m.record('/nonexistent/dir/x.db', 'r', ['r'], 'l', 'missed')
    raise SystemExit('expected OperationalError')
except sqlite3.OperationalError:
    pass
assert m.card_id('My gaps', 'q') == hashlib.sha1('My gaps\nq'.encode()).hexdigest()[:16]
# A paused "My gaps" deck stays paused after a miss; a miss does not use a new-card-per-day slot.
sqlite3.connect(db).execute("update deck set active=0 where name='My gaps'").connection.commit()
m.record(db, 'ML Maths', ['ML Maths', 'Calculus'], 'Taylor', 'missed', siblings=['Taylor'])
assert sqlite3.connect(db).execute("select active from deck where name='My gaps'").fetchone()[0] == 0, 'paused deck re-activated'
assert sqlite3.connect(db).execute("select introduced from card where answer='Taylor'").fetchone()[0] is None, 'miss consumed a new-card slot'
assert sqlite3.connect(db).execute("select due from card where answer='Taylor'").fetchone()[0] is not None
print('PASS test_recall')
