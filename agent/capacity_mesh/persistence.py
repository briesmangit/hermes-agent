from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable

from agent.capacity_mesh.types import ProviderScore


_SCORES_SCHEMA = """
CREATE TABLE IF NOT EXISTS scores (
    key_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    overall REAL NOT NULL,
    rate_limit REAL NOT NULL,
    reliability REAL NOT NULL,
    latency REAL NOT NULL,
    cost REAL NOT NULL,
    computed_at REAL NOT NULL
);
"""


def _db_path() -> Path:
    home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()
    return home / "capacity_plane" / "scores.db"


class ScorePersistence:
    def __init__(self, path: Path | None = None):
        self._path = path or _db_path()

    def ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(self._path), check_same_thread=False)
        con.executescript(_SCORES_SCHEMA)
        con.commit()
        con.close()

    def save(self, scores: Iterable[ProviderScore]) -> None:
        self.ensure_schema()
        con = sqlite3.connect(str(self._path), check_same_thread=False)
        con.execute("DELETE FROM scores")
        con.executemany(
            "INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (s.key_id, s.provider, s.overall, s.rate_limit,
                 s.reliability, s.latency, s.cost, s.computed_at)
                for s in scores
            ],
        )
        con.commit()
        con.close()

    def load(self) -> list[ProviderScore]:
        if not self._path.exists():
            return []
        try:
            con = sqlite3.connect(str(self._path), check_same_thread=False)
            rows = con.execute(
                "SELECT key_id, provider, overall, rate_limit, reliability, latency, cost, computed_at FROM scores"
            ).fetchall()
            con.close()
        except sqlite3.Error:
            return []
        return [ProviderScore(
            provider=r[1], key_id=r[0], overall=r[2], rate_limit=r[3],
            reliability=r[4], latency=r[5], cost=r[6], computed_at=r[7],
        ) for r in rows]
