"""Auto-demotion logic for capacity mesh scoring.

When a credential scores poorly across 3 consecutive windows, it should be
demoted (priority reduced) to prevent it from being selected for routing.
"""

from __future__ import annotations

from typing import List

# Threshold below which scores indicate poor performance
SCORE_THRESHOLD = 0.4

# Number of consecutive windows required to trigger demotion
DEMONITION_WINDOWS = 3


def should_demote(score_history: List[float]) -> bool:
    """Check if a credential should be demoted based on score history.

    Args:
        score_history: List of recent overall scores (most recent last).

    Returns:
        True if the credential should be demoted (3 consecutive scores < 0.4).
    """
    if len(score_history) < DEMONITION_WINDOWS:
        return False
    return all(s < SCORE_THRESHOLD for s in score_history[-DEMONITION_WINDOWS:])


def record_score(score_history: List[float], score: float) -> List[float]:
    """Record a new score and maintain bounded history.

    Args:
        score_history: Existing score history.
        score: New score to record.

    Returns:
        Updated score history (bounded to DEMONITION_WINDOWS entries).
    """
    history = list(score_history)
    history.append(score)
    # Keep only the last DEMONITION_WINDOWS entries
    return history[-DEMONITION_WINDOWS:]


def demote(pool: "CredentialPool", key_id: str) -> bool:
    """Demote a credential by reducing its priority.

    Args:
        pool: The credential pool to modify.
        key_id: The credential id or label.

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

    if entry.priority <= -1:
        # Already at minimum priority
        return False

    new_priority = entry.priority - 1
    updated = replace(entry, priority=new_priority)
    pool._replace_entry(entry, updated)
    pool._persist()
    return True


def set_priority(pool: "CredentialPool", key_id: str, priority: int) -> bool:
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
    return True