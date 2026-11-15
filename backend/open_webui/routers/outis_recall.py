"""Fork (recall mind map, 2026-11-15): Missed / Knew it clicks from a mind map into the Review
tool's spaced-repetition deck.

The Review tool (outis-owui plugins/review/review_tool.py) owns review.db; this route writes the
same tables with the same id rule, and grades with the same py-fsrs call, so a card made here is
indistinguishable from one the tool made. Keep `card_id`, the schema and `grade` in step with it.
"""

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Literal

try:  # the helpers above the router are tested stand-alone (tests/outis/backend/test_recall.py)
    from fastapi import APIRouter, Depends, HTTPException
    from pydantic import BaseModel

    from open_webui.utils.auth import get_verified_user
except ImportError:  # pragma: no cover - bare test venv
    APIRouter = Depends = HTTPException = BaseModel = get_verified_user = None  # type: ignore

DECK = 'My gaps'
RATINGS = {'again': 1, 'hard': 2, 'good': 3, 'easy': 4}


def db_path() -> str:
    return os.environ.get('REVIEW_DB', '/app/backend/data/review.db')


def card_id(deck: str, question: str) -> str:
    return hashlib.sha1(f'{deck}\n{question}'.encode()).hexdigest()[:16]


def question_for(path: list[str]) -> str:
    return ' → '.join(path) + ' → ?'


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS card (id TEXT PRIMARY KEY, deck TEXT, chapter TEXT, question TEXT,
            answer TEXT, fsrs TEXT, due TEXT, introduced TEXT);
        CREATE TABLE IF NOT EXISTS deck (name TEXT PRIMARY KEY, active INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS log (card_id TEXT, rating TEXT, at TEXT);
        CREATE INDEX IF NOT EXISTS card_due ON card (deck, due);
        """
    )
    return db


def grade(db: sqlite3.Connection, cid: str, rating: str, at: datetime) -> datetime:
    """Copy of review_tool.grade(): FSRS decides the next due date; we only map the click."""
    from fsrs import Card, Rating, Scheduler

    row = db.execute('SELECT * FROM card WHERE id=?', (cid,)).fetchone()
    if not row:
        raise KeyError(cid)
    card = Card.from_dict(json.loads(row['fsrs'])) if row['fsrs'] else Card(due=at)
    card, _ = Scheduler().review_card(card, Rating(RATINGS[rating]), review_datetime=at)
    db.execute(
        'UPDATE card SET fsrs=?, due=?, introduced=COALESCE(introduced, ?) WHERE id=?',
        (json.dumps(card.to_dict()), card.due.isoformat(), at.isoformat(), cid),
    )
    db.execute('INSERT INTO log VALUES (?,?,?)', (cid, rating, at.isoformat()))
    db.commit()
    return card.due


def record(path: str, root: str, trail: list[str], label: str, result: str, at: datetime | None = None) -> dict:
    """Missed: upsert the card and grade it `again` (a new card starts its schedule now, so it is
    due within minutes). Knew it: grade `good` only if the card already has a schedule; a node the
    learner knows and never missed is not worth a card."""
    at = at or datetime.now(timezone.utc)
    question = question_for(trail)
    cid = card_id(DECK, question)
    db = connect(path)
    try:
        if result == 'missed':
            db.execute("INSERT INTO deck (name, active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET active=1", (DECK,))
            db.execute(
                'INSERT INTO card (id, deck, chapter, question, answer) VALUES (?,?,?,?,?) '
                'ON CONFLICT(id) DO UPDATE SET chapter=excluded.chapter, answer=excluded.answer',
                (cid, DECK, root, question, label),
            )
            due = grade(db, cid, 'again', at)
            return {'stored': True, 'card_id': cid, 'due': due.isoformat()}
        row = db.execute('SELECT fsrs FROM card WHERE id=?', (cid,)).fetchone()
        if not row or not row['fsrs']:
            return {'stored': False, 'card_id': None, 'due': None}
        due = grade(db, cid, 'good', at)
        return {'stored': True, 'card_id': cid, 'due': due.isoformat()}
    finally:
        db.close()


if APIRouter is not None:
    router = APIRouter()

    class RecallForm(BaseModel):
        root: str
        path: list[str]
        label: str
        result: Literal['missed', 'knew']

    @router.post('/recall')
    async def recall(form_data: RecallForm, user=Depends(get_verified_user)):
        if not form_data.path or not form_data.label.strip():
            raise HTTPException(status_code=422, detail='path and label are required')
        try:
            return record(db_path(), form_data.root, form_data.path, form_data.label.strip(), form_data.result)
        except sqlite3.OperationalError as e:
            raise HTTPException(status_code=500, detail=f'review.db is not writable: {e}')
