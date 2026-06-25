from __future__ import annotations

import re
import time
from collections import deque
from typing import Iterator

from agent.capacity_mesh.types import ProviderSnapshot, RateLimitBucket, RateLimitState


_HEADER_PATTERNS = [
    ("x-ratelimit-remaining-requests", "requests_min"),
    ("x-ratelimit-limit-requests", "requests_min_limit"),
    ("x-ratelimit-reset-requests", "requests_min_reset"),
    ("x-ratelimit-remaining-tokens", "tokens_min"),
    ("x-ratelimit-limit-tokens", "tokens_min_limit"),
    ("x-ratelimit-reset-tokens", "tokens_min_reset"),
]


def _now() -> float:
    return time.time()


class ProviderCapacityTracker:
    def __init__(self, max_latencies: int = 100):
        self._state: dict[tuple[str, str], ProviderSnapshot] = {}
        self._latencies: dict[tuple[str, str], deque[float]] = {}
        self._max_latencies = max_latencies

    def _snapshot(self, provider: str, key_id: str) -> ProviderSnapshot:
        key = (provider, key_id)
        if key not in self._state:
            self._state[key] = ProviderSnapshot(provider=provider, key_id=key_id)
            self._latencies[key] = deque(maxlen=self._max_latencies)
        return self._state[key]

    def _parse_int_header(self, headers: dict[str, str], name: str) -> int | None:
        val = headers.get(name) or headers.get(name.lower())
        if val is None:
            return None
        m = re.search(r"\d+", str(val))
        return int(m.group()) if m else None

    def record_response(
        self,
        provider: str,
        key_id: str,
        headers: dict[str, str] | None = None,
        status_code: int = 200,
        latency_ms: float = 0.0,
    ) -> None:
        snap = self._snapshot(provider, key_id)
        headers = headers or {}
        if status_code >= 500 or status_code == 429:
            snap.failure_count += 1
        elif 200 <= status_code < 400:
            snap.success_count += 1
        self._latencies[(provider, key_id)].append(latency_ms)
        latencies = sorted(self._latencies[(provider, key_id)])
        if latencies:
            snap.latency_p50_ms = latencies[len(latencies) // 2]
            p95_idx = int(len(latencies) * 0.95)
            snap.latency_p95_ms = latencies[p95_idx] if p95_idx < len(latencies) else latencies[-1]
        snap.state = self._extract_state(headers)

    def _extract_state(self, headers: dict[str, str]) -> RateLimitState:
        state = RateLimitState()
        remaining = self._parse_int_header(headers, "x-ratelimit-remaining-requests")
        limit = self._parse_int_header(headers, "x-ratelimit-limit-requests")
        if remaining is not None or limit is not None:
            state.has_data = True
            state.requests_min = RateLimitBucket(
                limit=limit or 0,
                remaining=remaining or 0,
                reset_at=_now() + 60,
            )
        return state

    def get_snapshot(self, provider: str, key_id: str) -> ProviderSnapshot | None:
        return self._state.get((provider, key_id))

    def get_all_snapshots(self) -> Iterator[ProviderSnapshot]:
        yield from self._state.values()
