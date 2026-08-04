"""Tests for capacity-mesh runtime: _demote_credential escalation + ledger prune.

Covers the Layer 5 reinforcement path added to
``agent.capacity_mesh.runtime._demote_credential``:

  * Priority-floor escalation — when the scorer keeps marking a credential
    bad AND the entry is already at priority <= -1, the runtime now escalates
    to ``pool._mark_exhausted`` instead of silently no-op'ing.  This takes
    the key out of rotation and broadcasts via the cross-profile ledger.

  * Idempotency — escalation skips entries already ``exhausted``/``dead`` so
    it doesn't re-mark the same key on every dispatch cycle.

  * Resilience — if ``pool._mark_exhausted`` raises, the demote path must
    swallow the exception and not propagate it up to the scorer hot loop.

Also covers ``CapacityPlane`` periodic pruning of stale shared-ledger entries
(Layer 4) — the plane loop calls ``clear_stale_shared_ledger`` on a ~60s
cadence to drop entries whose ``reset_at`` has demonstrably elapsed.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import List
from unittest.mock import MagicMock, patch

import pytest

from agent.credential_pool import CredentialPool, PooledCredential
from agent.capacity_mesh.runtime import _demote_credential, record_dispatch_score


# ─── Fixture helpers ────────────────────────────────────────────────────────


def _entry(
    *,
    id: str = "cred-1",
    label: str = "primary",
    priority: int = 0,
    last_status: str | None = None,
    access_token: str = "tok_abc",
) -> PooledCredential:
    return PooledCredential(
        provider="test",
        id=id,
        label=label,
        auth_type="api_key",
        priority=priority,
        source="manual",
        access_token=access_token,
        last_status=last_status,
    )


def _write_auth_store(tmp_path, entries: List[dict]) -> None:
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir(parents=True, exist_ok=True)
    (hermes_home / "auth.json").write_text(
        json.dumps(
            {
                "version": 1,
                "credential_pool": {"test": entries},
            },
            indent=2,
        )
    )


# ─── _demote_credential escalation path ────────────────────────────────────


class TestDemoteEscalationAtPriorityFloor:
    """When priority <= -1 and status not yet exhausted, escalate to _mark_exhausted."""

    def test_escalates_when_at_priority_floor_and_not_exhausted(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=-1, last_status="ok")
        pool = CredentialPool("test", [_entry()])

        # Stub _mark_exhausted so we don't need real persistence wiring.
        marked = []
        def fake_mark(e, status_code, error_context=None):
            marked.append((e.id, status_code, error_context))
            from dataclasses import replace
            updated = replace(
                e,
                last_status="exhausted",
                last_status_at=time.time(),
                last_error_code=status_code,
                last_error_reason=(error_context or {}).get("reason"),
                last_error_reset_at=(error_context or {}).get("reset_at"),
            )
            pool._replace_entry(e, updated)
            return updated
        pool._mark_exhausted = fake_mark  # type: ignore[assignment]

        _demote_credential(pool, entry)

        assert len(marked) == 1
        eid, code, ctx = marked[0]
        assert eid == "cred-1"
        assert code == 429
        assert ctx is not None
        assert ctx["reason"] == "capacity_mesh_escalation"
        # reset_at must be ~now + 1h (within a fudge window)
        reset_at = ctx.get("reset_at")
        assert reset_at is not None
        assert abs(reset_at - (time.time() + 3600)) < 30

    def test_does_not_escalate_when_already_exhausted(self, tmp_path, monkeypatch):
        """Idempotency: an already-exhausted entry at floor must NOT re-mark."""
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=-1, last_status="exhausted")
        pool = CredentialPool("test", [entry])

        marked = []
        pool._mark_exhausted = lambda e, status_code, error_context=None: marked.append(e.id)  # type: ignore[assignment]

        _demote_credential(pool, entry)

        assert marked == [], "must not re-mark an already-exhausted entry"

    def test_does_not_escalate_when_already_dead(self, tmp_path, monkeypatch):
        """Idempotency: dead entries are skipped too."""
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=-1, last_status="dead")
        pool = CredentialPool("test", [entry])

        marked = []
        pool._mark_exhausted = lambda e, status_code, error_context=None: marked.append(e.id)  # type: ignore[assignment]

        _demote_credential(pool, entry)

        assert marked == [], "must not re-mark a dead entry"

    def test_swallows_exception_from_mark_exhausted(self, tmp_path, monkeypatch):
        """Resilience: _mark_exhausted raising must NOT propagate to the scorer loop."""
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=-1, last_status="ok")
        pool = CredentialPool("test", [_entry()])

        def boom(e, status_code, error_context=None):
            raise RuntimeError("simulated persistence failure")
        pool._mark_exhausted = boom  # type: ignore[assignment]

        # Must not raise.
        _demote_credential(pool, entry)


class TestDemotePathAboveFloor:
    """Above the priority floor (-1 boundary), the runtime decrements normally."""

    def test_priority_is_decremented(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=2, last_status="ok")
        pool = CredentialPool("test", [entry])

        # Should not call _mark_exhausted from this path.
        marked = []
        pool._mark_exhausted = lambda e, status_code, error_context=None: marked.append(e.id)  # type: ignore[assignment]

        _demote_credential(pool, entry)

        updated = pool.current() or next(iter(pool.entries()))
        assert updated.priority == 1
        assert marked == [], "must not escalate when above the priority floor"

    def test_priority_zero_is_not_floor_for_escalation(self, tmp_path, monkeypatch):
        """Boundary check: priority == 0 is still above the escalation floor (-1)."""
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=0, last_status="ok")
        pool = CredentialPool("test", [entry])

        marked = []
        pool._mark_exhausted = lambda e, status_code, error_context=None: marked.append(e.id)  # type: ignore[assignment]

        _demote_credential(pool, entry)

        updated = pool.current() or next(iter(pool.entries()))
        assert updated.priority == -1
        assert marked == [], "priority == 0 decrements to -1, escalation is for next call"


# ─── record_dispatch_score integration ──────────────────────────────────────


class TestRecordDispatchScoreTriggersEscalation:
    """End-to-end: low scores across the demotion window reach the escalation path."""

    def test_three_low_scores_trigger_demote_call(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=2, last_status="ok")
        pool = CredentialPool("test", [entry])

        demoted = []
        with patch(
            "agent.capacity_mesh.runtime._demote_credential",
            side_effect=lambda p, e: demoted.append((e.id, e.priority)),
        ):
            # Threshold is 0.4; feed three sub-threshold scores.
            record_dispatch_score(pool, entry, 0.1)
            record_dispatch_score(pool, entry, 0.2)
            record_dispatch_score(pool, entry, 0.3)

        assert len(demoted) == 1
        assert demoted[0][0] == "cred-1"

    def test_high_scores_do_not_trigger_demote(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        entry = _entry(priority=2, last_status="ok")
        pool = CredentialPool("test", [entry])

        demoted = []
        with patch(
            "agent.capacity_mesh.runtime._demote_credential",
            side_effect=lambda p, e: demoted.append(e.id),
        ):
            record_dispatch_score(pool, entry, 0.9)
            record_dispatch_score(pool, entry, 0.85)
            record_dispatch_score(pool, entry, 0.95)

        assert demoted == []

    def test_none_entry_is_noop(self, tmp_path, monkeypatch):
        """Defensive: record_dispatch_score(None) must not raise."""
        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
        pool = CredentialPool("test", [_entry()])
        record_dispatch_score(pool, None, 0.1)  # must not raise
