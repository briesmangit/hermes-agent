from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

from agent.capacity_mesh.scorer import compute_score, get_all_scores, persist_score
from agent.capacity_mesh.tracker import ProviderCapacityTracker
from agent.capacity_mesh.persistence import ScorePersistence
from agent.capacity_mesh.types import PlaneConfig, ProviderScore

_log = logging.getLogger(__name__)
_plane: Optional[CapacityPlane] = None
_plane_lock = threading.Lock()


class CapacityPlane:
    def __init__(self, config: PlaneConfig):
        self.config = config
        self.tracker = ProviderCapacityTracker()
        # Scorer is now module-level functions; we use them directly
        self._scorer_config = config
        # Use profile-specific persistence if HERMES_HOME is profile-scoped
        hermes_home = os.environ.get("HERMES_HOME")
        if config.persistence_enabled:
            if hermes_home and "profiles" in hermes_home:
                # Extract profile name from HERMES_HOME
                import re
                m = re.search(r"/profiles/([^/]+)", hermes_home)
                if m:
                    profile = m.group(1)
                    self.persistence = ScorePersistence.for_profile(profile)
                else:
                    self.persistence = ScorePersistence()
            else:
                self.persistence = ScorePersistence()
        else:
            self.persistence = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_save = 0.0

    def start(self) -> None:
        if self.persistence:
            for s in self.persistence.load():
                self.tracker.record_response(s.provider, s.key_id, {}, 200, 0.0)
        interval = max(5, self.config.recompute_interval_sec)
        self._thread = threading.Thread(target=self._loop, args=(interval,), daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        if self.persistence:
            self.persistence.close()

    def _loop(self, interval: int) -> None:
        while not self._stop.is_set():
            try:
                # Recompute all scores from tracker metrics
                now = time.time()
                if self.persistence and now - self._last_save >= 60:
                    scores = self.all_scores()
                    self.persistence.save(scores)
                    self._last_save = now
                # Layer 4: prune stale entries from the cross-profile
                # exhaustion ledger.  Entries whose reset_at has demonstrably
                # elapsed get dropped so the ledger doesn't accumulate
                # forever and so other profiles stop honoring stale exhaustion
                # state.  Cadence matches capacity_plane recompute (30s).
                if int(now) % 60 < interval:
                    try:
                        from agent.exhaustion_ledger import clear_stale_shared_ledger
                        clear_stale_shared_ledger(now=now)
                    except Exception:
                        pass
            except Exception as e:
                _log.warning("capacity_plane loop error: %s", e)
            self._stop.wait(interval)

    def all_scores(self) -> list[ProviderScore]:
        """Get all current scores, computing them fresh from tracker."""
        from agent.capacity_mesh.scorer import _load_scorer_weights
        weights = _load_scorer_weights()
        results = []
        for (provider, key_id), snapshot in self.tracker._state.items():
            # Compute score from snapshot
            metrics = {
                "latency_sec": snapshot.latency_p50_ms / 1000.0 if snapshot.latency_p50_ms > 0 else 0,
                "tokens_in": 0,  # TODO: track tokens
                "tokens_out": 0,
                "error_code": None,
                "has_error": snapshot.failure_count > 0,
            }
            sc = compute_score(metrics)
            results.append(ProviderScore(
                provider=provider,
                key_id=key_id,
                overall=sc.overall,
                rate_limit=sc.rate_limit,
                reliability=sc.reliability,
                latency=sc.latency,
                cost=sc.cost,
                computed_at=time.time(),
            ))
        return results

    def record_response(self, provider: str, key_id: str,
                        headers: dict[str, str] | None = None,
                        status_code: int = 200, latency_ms: float = 0.0) -> None:
        self.tracker.record_response(provider, key_id, headers, status_code, latency_ms)

    @property
    def mode(self) -> str:
        return self.config.mode


def configure_plane(config: PlaneConfig) -> CapacityPlane:
    global _plane
    with _plane_lock:
        if _plane is not None:
            _plane.stop()
        _plane = CapacityPlane(config)
        _plane.start()
        _log.info("capacity_plane: configured (enabled=%s)", config.enabled)
        return _plane


def get_plane() -> CapacityPlane:
    if _plane is None:
        raise RuntimeError("CapacityPlane has not been configured")
    return _plane