from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from agent.capacity_mesh.capacity.scorer import CapacityScorer
from agent.capacity_mesh.capacity.tracker import ProviderCapacityTracker
from agent.capacity_mesh.persistence import ScorePersistence
from agent.capacity_mesh.types import PlaneConfig, ProviderScore

_log = logging.getLogger(__name__)
_plane: Optional[CapacityPlane] = None
_plane_lock = threading.Lock()


class CapacityPlane:
    def __init__(self, config: PlaneConfig):
        self.config = config
        self.tracker = ProviderCapacityTracker()
        self.scorer = CapacityScorer(self.tracker, config)
        self.persistence = ScorePersistence() if config.persistence_enabled else None
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

    def _loop(self, interval: int) -> None:
        while not self._stop.is_set():
            try:
                self.scorer.recompute_all()
                now = time.time()
                if self.persistence and now - self._last_save >= 60:
                    self.persistence.save(self.scorer.all_scores())
                    self._last_save = now
            except Exception as e:
                _log.warning("capacity_plane loop error: %s", e)
            self._stop.wait(interval)

    def all_scores(self) -> list[ProviderScore]:
        self.scorer.recompute_all()
        return self.scorer.all_scores()

    def record_response(self, provider: str, key_id: str,
                        headers: dict[str, str] | None = None,
                        status_code: int = 200, latency_ms: float = 0.0) -> None:
        self.tracker.record_response(provider, key_id, headers, status_code, latency_ms)


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
