"""Runtime hooks for capacity mesh scoring and auto-demotion.

This module integrates the demote logic with credential pool operations.
After each dispatch, it pulls the score history for the routed key, checks
if demotion is warranted, and executes it.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Dict, List, Optional, Any

if TYPE_CHECKING:
    from agent.credential_pool import CredentialPool, PooledCredential

from agent.capacity_mesh.config import load_plane_config
from agent.capacity_mesh.demote import DEMONITION_WINDOWS, record_score, should_demote
from agent.capacity_mesh.plane import CapacityPlane, configure_plane

logger = logging.getLogger(__name__)

__all__ = [
    "init_capacity_plane_if_enabled",
    "get_plane_safe",
    "get_score_history",
    "record_dispatch_score",
    "set_credential_priority",
    "record_dispatch_metrics",
]

# In-memory score tracking per credential entry
_score_histories: Dict[str, List[float]] = {}


def init_capacity_plane_if_enabled() -> Optional[CapacityPlane]:
    try:
        cfg = load_plane_config()
        if cfg.enabled:
            return configure_plane(cfg)
        return None
    except Exception as e:
        logger.info("capacity_plane: not started: %s", e)
        return None


def get_plane_safe() -> Optional[CapacityPlane]:
    try:
        from agent.capacity_mesh.plane import get_plane
        return get_plane()
    except RuntimeError:
        return None


def get_score_history(entry_id: str) -> List[float]:
    """Get the score history for a credential entry."""
    return list(_score_histories.get(entry_id, []))


def record_dispatch_score(
    pool: CredentialPool,
    entry: Optional[PooledCredential],
    score: float,
) -> None:
    """Record a dispatch score and demote if warranted.

    Args:
        pool: The credential pool being used.
        entry: The credential entry that was selected.
        score: The overall score (0.0-1.0) for this dispatch.
    """
    if entry is None:
        return

    entry_id = entry.id
    history = get_score_history(entry_id)
    history = record_score(history, score)
    _score_histories[entry_id] = history

    if should_demote(history):
        _demote_credential(pool, entry)


def _demote_credential(pool: CredentialPool, entry: PooledCredential) -> None:
    """Demote a credential by reducing its priority.

    Layer 5 reinforcement: when the capacity-mesh scorer sees a credential
    that consistently under-performs (high error rate, repeated 429s, slow),
    it used to just decrement ``priority`` — leaving the demoted key in
    rotation, merely picked last.  On heavy load that's pointless: under load
    the pool still sends traffic to a key the scorer has already concluded is
    failing.  Behavior contracts over snapshots: the scorer is telling us
    'this key is bad right now — stop using it'.

    The new behavior: if the entry's recent dispatch score history is bad
    enough to warrant demotion AND it's already at or below priority 0,
    proactively mark the credential ``exhausted`` via the pool's standard
    mechanism — this triggers the Layer 4 cross-profile ledger broadcast so
    other profiles align, and this profile skips the key in subsequent
    selections.  The actual decision threshold is in ``should_demote``.
    """
    from dataclasses import replace

    if entry.priority <= -1:
        # Already at minimum priority — escalate to exhaustion so the pool
        # actually stops dispatching to this key.  The capacity-mesh scorer
        # has decided this credential is consistently problematic; demoting
        # priority further would be a no-op.  Mark exhausted via the pool's
        # standard path (writes through to the shared ledger too).
        try:
            # Only escalate if not already exhausted (avoid duplicate work).
            if entry.last_status not in ("exhausted", "dead"):
                pool._mark_exhausted(
                    entry,
                    status_code=429,
                    error_context={
                        "reason": "capacity_mesh_escalation",
                        "message": "Capacity plane scored credential as consistently failing — escalating to exhaustion",
                        "reset_at": time.time() + 3600,  # try again in 1h
                    },
                )
                logger.warning(
                    "capacity_mesh: escalated credential %s to exhausted (priority floor reached, scorer says bad)",
                    entry.label or entry.id[:8],
                )
        except Exception as exc:
            logger.warning(
                "capacity_mesh: failed to escalate %s to exhausted: %s — leaving at priority floor",
                entry.label or entry.id[:8], exc,
            )
        return

    new_priority = entry.priority - 1
    updated = replace(entry, priority=new_priority)
    pool._replace_entry(entry, updated)
    pool._persist()
    logger.info(
        "capacity_mesh: auto-demoted credential %s (priority -> %s)",
        entry.label or entry.id[:8],
        new_priority,
    )

    # Reset score history after demotion to allow recovery
    _score_histories.pop(entry.id, None)


def set_credential_priority(
    pool: CredentialPool,
    key_id: str,
    priority: int,
) -> bool:
    """Set the priority of a credential by its id or label.

    Args:
        pool: The credential pool to modify.
        key_id: The credential id or label.
        priority: The new priority value.

    Returns:
        True if the priority was updated, False otherwise.
    """
    from dataclasses import replace

    entry = next(
        (e for e in pool._entries if e.id == key_id or e.label == key_id),
        None,
    )
    if entry is None:
        return False

    updated = replace(entry, priority=priority)
    pool._replace_entry(entry, updated)
    pool._persist()

    logger.info(
        "capacity_mesh: set priority for credential %s to %d",
        entry.label or entry.id[:8],
        priority,
    )
    return True


def record_dispatch_metrics(
    pool: CredentialPool,
    entry: Optional[PooledCredential],
    metrics: Dict[str, Any],
) -> None:
    """Record dispatch metrics and persist scores to scores.db.

    This function computes scores from invocation metrics and persists them,
    then delegates to record_dispatch_score for demotion logic.

    Args:
        pool: The credential pool being used.
        entry: The credential entry that was selected.
        metrics: Invocation metrics including latency_sec, error_code, etc.
    """
    from agent.capacity_mesh.scorer import compute_score, persist_score

    if entry is None:
        return

    entry_id = entry.id
    provider = entry.provider

    # Compute and persist scores
    scores = compute_score(metrics)
    persist_score(entry_id, provider, scores)

    # Record for demotion logic (uses overall score)
    history = get_score_history(entry_id)
    history = record_score(history, scores.overall)
    _score_histories[entry_id] = history

    if should_demote(history):
        _demote_credential(pool, entry)