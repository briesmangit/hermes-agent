from __future__ import annotations

import math
import time
from threading import Lock
from typing import Optional

from agent.capacity_mesh.capacity.tracker import ProviderCapacityTracker
from agent.capacity_mesh.types import PlaneConfig, ProviderScore


class CapacityScorer:
    def __init__(self, tracker: ProviderCapacityTracker, config: PlaneConfig):
        self._tracker = tracker
        self._weights = config.scorer_weights
        self._scores: dict[tuple[str, str], ProviderScore] = {}
        self._lock = Lock()

    def score(self, provider: str, key_id: str) -> ProviderScore:
        with self._lock:
            return self._scores.get((provider, key_id), ProviderScore(provider=provider, key_id=key_id))

    def all_scores(self) -> list[ProviderScore]:
        with self._lock:
            return list(self._scores.values())

    def recompute_all(self) -> None:
        snap = {}
        for s in self._tracker.get_all_snapshots():
            snap[(s.provider, s.key_id)] = s
        new_scores: dict[tuple[str, str], ProviderScore] = {}
        for key, s in snap.items():
            total = s.success_count + s.failure_count
            reliability = s.success_count / total if total > 0 else 0.95
            rate_limit = self._rate_limit_score(s)
            latency = self._latency_score(s)
            cost = 1.0 if s.is_free_tier else 0.3
            overall = (
                self._weights.get("rate_limit", 0.4) * rate_limit +
                self._weights.get("reliability", 0.3) * reliability +
                self._weights.get("latency", 0.2) * latency +
                self._weights.get("cost", 0.1) * cost
            )
            new_scores[key] = ProviderScore(
                provider=s.provider,
                key_id=s.key_id,
                overall=round(overall, 4),
                rate_limit=round(rate_limit, 4),
                reliability=round(reliability, 4),
                latency=round(latency, 4),
                cost=round(cost, 4),
                computed_at=time.time(),
            )
        with self._lock:
            self._scores = new_scores

    @staticmethod
    def _rate_limit_score(snap) -> float:
        if not snap.state.has_data:
            return 1.0
        scores = []
        for bucket in (snap.state.requests_min, snap.state.requests_hour,
                       snap.state.tokens_min, snap.state.tokens_hour):
            if bucket.limit > 0:
                scores.append(bucket.remaining / bucket.limit)
        return sum(scores) / len(scores) if scores else 1.0

    @staticmethod
    def _latency_score(snap) -> float:
        if snap.latency_p95_ms <= 0:
            return 1.0
        return max(0.3, 1.0 - math.log1p(snap.latency_p95_ms / 1000.0) / 2.0)
