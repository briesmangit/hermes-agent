"""E2E tests for the kanban dashboard board-status / health surface.

Exercises the REAL path (a temp HERMES home + an on-disk kanban.db) rather
than mocks: ``_board_health`` derives attention signals from actual task
rows, and ``list_boards`` attaches the ``health`` dict to every board.

Coverage targets the four attention signals the colored dashboard strip
depends on:
  * blocked slices
  * crash-looping workers (consecutive_failures >= DEFAULT_FAILURE_LIMIT)
  * stale heartbeats (live task, heartbeat older than MAX_STALE)
  * expired claim locks (live task, claim_expires in the past)
  * stalled-ready slices (todo/ready idle > horizon, never started)
plus the "all-done => blue, no attention" and "empty board => safe" cases.
"""

from __future__ import annotations

import time

import pytest

from hermes_cli import kanban_db


def _seed(slug_dir, rows):
    """Create a board dir + kanban.db seeded with the given task rows.

    ``rows`` is a list of dicts with the subset of columns we touch:
    status, consecutive_failures, last_heartbeat_at, claim_expires,
    started_at, created_at.
    """
    from hermes_cli import kanban_db as kb

    kb_root = kb.boards_root()
    board_path = kb_root / slug_dir
    board_path.mkdir(parents=True, exist_ok=True)
    db_path = kb.kanban_db_path(board=slug_dir)
    conn = kb.connect(board=slug_dir)
    try:
        for i, r in enumerate(rows):
            tid = f"t_{slug_dir}_{i:04d}"
            conn.execute(
                """
                INSERT INTO tasks
                    (id, title, body, assignee, status, priority,
                     created_by, created_at, started_at, completed_at,
                     workspace_kind, consecutive_failures,
                     last_heartbeat_at, claim_expires)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tid,
                    f"slice {i}",
                    "",
                    "delta",
                    r.get("status", "todo"),
                    0,
                    "alpha",
                    r.get("created_at", int(time.time()) - 100),
                    r.get("started_at"),
                    None,
                    "scratch",
                    r.get("consecutive_failures", 0),
                    r.get("last_heartbeat_at"),
                    r.get("claim_expires"),
                ),
            )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture
def temp_kanban_home(tmp_path, monkeypatch):
    """Point kanban state at a temp dir so we don't touch real boards.

    ``HERMES_KANBAN_HOME`` is the explicit override used by tests and unusual
    deployments (see kanban_db.kanban_home resolution order). Setting it makes
    boards_root() resolve under tmp_path, so every seeded board lives on a
    throwaway on-disk kanban.db.
    """
    home = tmp_path / "kanban_home"
    home.mkdir()
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
    return home


def test_board_health_blocked_and_failing(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    now = int(time.time())
    _seed(
        "demo",
        [
            {"status": "blocked"},
            {"status": "blocked"},
            {"status": "running", "consecutive_failures": kanban_db.DEFAULT_FAILURE_LIMIT},
            {"status": "todo"},
        ],
    )
    h = plugin_api._board_health("demo")
    assert h["blocked_count"] == 2
    assert h["failing_workers"] == 1
    assert h["needs_attention"] is True
    assert any("blocked" in r for r in h["reasons"])
    assert any("crash-looping" in r for r in h["reasons"])
    # sanity: heartbeats/claims not yet exercised => zero
    assert h["stale_heartbeats"] == 0
    assert h["expired_claims"] == 0


def test_board_health_stale_heartbeat_and_expired_claim(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    now = int(time.time())
    max_stale = kanban_db.DEFAULT_CLAIM_HEARTBEAT_MAX_STALE_SECONDS
    _seed(
        "hz",
        [
            # zombie: live status, heartbeat way past the stale window
            {"status": "running", "last_heartbeat_at": now - max_stale - 600},
            # orphaned: live status, claim lock expired
            {"status": "active", "claim_expires": now - 60},
        ],
    )
    h = plugin_api._board_health("hz")
    assert h["stale_heartbeats"] == 1
    assert h["expired_claims"] == 1
    assert h["needs_attention"] is True


def test_board_health_stalled_ready(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    now = int(time.time())
    _seed(
        "stall",
        [
            # prepared slice, never started, idle > 6h horizon
            {"status": "todo", "started_at": None, "created_at": now - 7 * 3600},
            {"status": "done"},
        ],
    )
    h = plugin_api._board_health("stall")
    assert h["stalled_ready"] == 1
    assert h["needs_attention"] is True


def test_board_health_completed_is_not_attention(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    _seed("done-board", [{"status": "done"}, {"status": "done"}])
    h = plugin_api._board_health("done-board")
    assert h["needs_attention"] is False
    assert h["reasons"] == []
    assert h["blocked_count"] == 0


def test_board_health_empty_safe(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    # No board dir at all => safe empty shape, no exception.
    h = plugin_api._board_health("nonexistent-slug")
    assert h["needs_attention"] is False
    assert h["reasons"] == []


def test_list_boards_attaches_health(temp_kanban_home):
    from plugins.kanban.dashboard import plugin_api

    _seed("attached", [{"status": "blocked"}])
    resp = plugin_api.list_boards(include_archived=False)
    target = next((b for b in resp["boards"] if b["slug"] == "attached"), None)
    assert target is not None, "seeded board should appear in list_boards"
    assert isinstance(target["health"], dict)
    assert target["health"]["needs_attention"] is True
    assert target["health"]["blocked_count"] == 1
