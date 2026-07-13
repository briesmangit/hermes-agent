from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Iterable

from agent.capacity_mesh.types import ProviderScore

_log = logging.getLogger(__name__)

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

_EXPECTED_COL_COUNT = 8


def _db_path() -> Path:
    home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()
    return home / "capacity_plane" / "scores.db"


def _get_profile_db_path(profile: str) -> Path:
    """Get profile-specific scores.db path."""
    home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()
    # Profile-specific path: ~/.hermes/profiles/{profile}/capacity_plane/scores.db
    return home.parent / profile / "capacity_plane" / "scores.db"


class ScorePersistence:
    """SQLite-backed score store.

    Holds a single long-lived connection (WAL + busy_timeout) so the
    recompute loop never self-deadlocks and FDs do not leak on errors.
    """

    def __init__(self, path: Path | None = None):
        self._path = path or _db_path()
        self._conn: sqlite3.Connection | None = None

    @classmethod
    def for_profile(cls, profile: str) -> "ScorePersistence":
        """Create a ScorePersistence instance for a specific profile."""
        return cls(_get_profile_db_path(profile))

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is not None:
            return self._conn
        self._path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(self._path), check_same_thread=False, timeout=5.0)
        con.execute("PRAGMA journal_mode=WAL;")
        con.execute("PRAGMA busy_timeout=5000;")
        con.execute("PRAGMA synchronous=NORMAL;")
        self._conn = con
        return con

    def _ensure_schema(self) -> None:
        con = self._get_conn()
        cols = con.execute("PRAGMA table_info(scores);").fetchall()
        if cols and len(cols) != _EXPECTED_COL_COUNT:
            _log.warning(
                "capacity_plane: scores table has %d columns, expected %d — recreating",
                len(cols), _EXPECTED_COL_COUNT,
            )
            con.execute("DROP TABLE IF EXISTS scores;")
            cols = []
        if not cols:
            con.executescript(_SCORES_SCHEMA)
            con.commit()

    def ensure_schema(self) -> None:
        self._ensure_schema()

    def save(self, scores: Iterable[ProviderScore]) -> None:
        con = self._get_conn()
        self._ensure_schema()
        try:
            with con:  # transaction: commit on success, rollback on error
                con.execute("DELETE FROM scores;")
                con.executemany(
                    "INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (s.key_id, s.provider, s.overall, s.rate_limit,
                         s.reliability, s.latency, s.cost, s.computed_at)
                        for s in scores
                    ],
                )
        except sqlite3.Error as e:
            _log.warning("capacity_plane: persistence save failed: %s", e)
            raise

    def load(self) -> list[ProviderScore]:
        if not self._path.exists():
            return []
        try:
            con = self._get_conn()
            self._ensure_schema()
            rows = con.execute(
                "SELECT key_id, provider, overall, rate_limit, reliability, latency, cost, computed_at FROM scores"
            ).fetchall()
        except sqlite3.Error as e:
            _log.warning("capacity_plane: persistence load failed: %s", e)
            return []
        return [ProviderScore(
            provider=r[1], key_id=r[0], overall=r[2], rate_limit=r[3],
            reliability=r[4], latency=r[5], cost=r[6], computed_at=r[7],
        ) for r in rows]

    def close(self) -> None:
        con = self._conn
        self._conn = None
        if con is not None:
            try:
                con.close()
            except sqlite3.Error:
                pass