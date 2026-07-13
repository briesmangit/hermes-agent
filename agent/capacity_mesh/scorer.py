"""Capacity mesh scorer for computing and persisting credential scores.

Computes overall + component scores (rate_limit, reliability, latency, cost)
and persists them to SQLite scores.db for the capacity plane endpoint.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# Default weights if not configured
DEFAULT_WEIGHTS = {
    "cost": 0.1,
    "latency": 0.2,
    "rate_limit": 0.4,
    "reliability": 0.3,
}


@dataclass
class ScoreComponents:
    """Component scores for a credential."""
    overall: float
    rate_limit: float
    reliability: float
    latency: float
    cost: float


def _get_scores_db_path() -> Path:
    """Get the path to scores.db for the current profile."""
    from hermes_constants import get_hermes_home
    import os
    # Get profile from environment (HERMES_PROFILE set by gateway runner)
    profile = os.environ.get("HERMES_PROFILE", "default")
    # Use profile-specific path: ~/.hermes/profiles/{profile}/capacity_plane/scores.db
    scores_dir = get_hermes_home().parent / profile / "capacity_plane"
    scores_dir.mkdir(parents=True, exist_ok=True)
    return scores_dir / "scores.db"


def _get_profile_scores_db_path(profile: str | None = None) -> Path:
    """Get the path to scores.db for a specific profile."""
    from hermes_constants import get_hermes_home
    home = get_hermes_home()
    # If we're in a profile-specific home, use that
    if profile:
        scores_dir = home.parent / profile / "capacity_plane"
    else:
        scores_dir = home / "capacity_plane"
    scores_dir.mkdir(parents=True, exist_ok=True)
    return scores_dir / "scores.db"


def _init_scores_db() -> None:
    """Initialize scores.db with schema if not exists."""
    db_path = _get_scores_db_path()
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                key_id TEXT,
                provider TEXT NOT NULL,
                overall REAL NOT NULL,
                rate_limit REAL NOT NULL,
                reliability REAL NOT NULL,
                latency REAL NOT NULL,
                cost REAL NOT NULL,
                computed_at REAL NOT NULL,
                model TEXT,
                PRIMARY KEY (key_id, provider)
            )
        """)
        conn.commit()
    finally:
        conn.close()


def _load_scorer_weights() -> Dict[str, float]:
    """Load scorer_weights from config, falling back to defaults."""
    try:
        from hermes_cli.config import load_config
        config = load_config()
        weights = config.get("capacity_plane", {}).get("scorer_weights", {})
        if isinstance(weights, dict):
            return {k: float(v) for k, v in weights.items() if v is not None}
    except Exception:
        pass
    return DEFAULT_WEIGHTS.copy()


def compute_score(metrics: Dict[str, Any]) -> ScoreComponents:
    """Compute capacity scores from invocation metrics.

    Args:
        metrics: Dict with keys:
            - latency_sec: API call duration in seconds
            - tokens_in: Input token count
            - tokens_out: Output token count
            - error_code: HTTP error code if failed (e.g. 429, 500)
            - has_error: bool, True if invocation had an error

    Returns:
        ScoreComponents with overall and individual metric scores.
    """
    # Extract metrics with defaults
    latency_sec = float(metrics.get("latency_sec", 0))
    tokens_in = int(metrics.get("tokens_in", 0))
    tokens_out = int(metrics.get("tokens_out", 0))
    error_code = metrics.get("error_code")
    has_error = bool(metrics.get("has_error", False))

    weights = _load_scorer_weights()

    # Rate limit score: 1.0 if no 429, 0.0 if 429
    rate_limit = 1.0 if error_code != 429 else 0.0

    # Reliability score: 1.0 if no error, decays with error severity
    if has_error:
        if error_code == 429:
            reliability = 0.3  # Rate limited
        elif error_code and error_code >= 500:
            reliability = 0.5  # Server error
        else:
            reliability = 0.7  # Other error
    else:
        reliability = 1.0

    # Latency score: scales 0-1 based on response time
    # <1s = 1.0, 5s = 0.5, 30s+ = 0.0
    if latency_sec <= 1.0:
        latency_score = 1.0
    elif latency_sec >= 30.0:
        latency_score = 0.0
    else:
        latency_score = max(0.0, 1.0 - (latency_sec - 1.0) / 29.0)
    latency = latency_score

    # Cost score: inverse relationship to usage (free models = 1.0)
    # We use a simple heuristic: no cost info = 1.0 (free tier), else estimate
    if tokens_in > 0 or tokens_out > 0:
        total_tokens = tokens_in + tokens_out
        # Normalize: 0 tokens = 1.0, very high tokens = 0.0
        # Assuming 1M tokens is "high cost" threshold
        cost = max(0.0, 1.0 - total_tokens / 1_000_000)
    else:
        cost = 1.0

    # Compute weighted overall score
    overall = (
        weights.get("rate_limit", 0.4) * rate_limit +
        weights.get("reliability", 0.3) * reliability +
        weights.get("latency", 0.2) * latency +
        weights.get("cost", 0.1) * cost
    )
    # Normalize by total weight (in case not all weights sum to 1)
    total_weight = sum(weights.get(k, 0) for k in ["rate_limit", "reliability", "latency", "cost"])
    if total_weight > 0:
        overall = overall / total_weight

    return ScoreComponents(
        overall=round(overall, 4),
        rate_limit=round(rate_limit, 4),
        reliability=round(reliability, 4),
        latency=round(latency, 4),
        cost=round(cost, 4),
    )


def persist_score(
    entry_id: str,
    provider: str,
    scores: ScoreComponents,
    model: Optional[str] = None,
) -> None:
    """Persist scores to SQLite scores.db.

    Args:
        entry_id: Credential entry ID.
        provider: Provider name.
        scores: Computed score components.
        model: Optional model identifier.
    """
    _init_scores_db()
    db_path = _get_scores_db_path()
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO scores
            (key_id, provider, overall, rate_limit, reliability, latency, cost, computed_at, model)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                provider,
                scores.overall,
                scores.rate_limit,
                scores.reliability,
                scores.latency,
                scores.cost,
                time.time(),
                model,
            ),
        )
        conn.commit()
        logger.debug(
            "Persisted score for %s/%s: overall=%.2f",
            provider, entry_id[:8], scores.overall
        )
    finally:
        conn.close()


def get_all_scores() -> list[Dict[str, Any]]:
    """Read all scores from scores.db.

    Returns:
        List of score records as dicts. Empty list if no scores exist.
    """
    db_path = _get_scores_db_path()
    if not db_path.exists():
        return []

    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT key_id, provider, overall, rate_limit, reliability, latency, cost, computed_at, model
            FROM scores
            ORDER BY computed_at DESC
            """
        )
        rows = cursor.fetchall()
        return [
            {
                "key_id": row["key_id"],
                "provider": row["provider"],
                "overall": row["overall"],
                "scores": {
                    "rate_limit": row["rate_limit"],
                    "reliability": row["reliability"],
                    "latency": row["latency"],
                    "cost": row["cost"],
                },
                "computed_at": row["computed_at"],
                "model": row["model"],
            }
            for row in rows
        ]
    finally:
        conn.close()