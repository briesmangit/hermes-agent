from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RateLimitBucket:
    limit: int = 0
    remaining: int = 0
    reset_at: float = 0.0
    used: int = 0

    @property
    def remaining_seconds_now(self) -> float:
        return max(0.0, self.reset_at - time.time())


@dataclass
class RateLimitState:
    requests_min: RateLimitBucket = field(default_factory=RateLimitBucket)
    requests_hour: RateLimitBucket = field(default_factory=RateLimitBucket)
    tokens_min: RateLimitBucket = field(default_factory=RateLimitBucket)
    tokens_hour: RateLimitBucket = field(default_factory=RateLimitBucket)
    has_data: bool = False


@dataclass
class ProviderSnapshot:
    provider: str
    key_id: str
    state: RateLimitState = field(default_factory=RateLimitState)
    success_count: int = 0
    failure_count: int = 0
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    is_free_tier: bool = True

    def can_accept(self, estimated_tokens: int = 0) -> bool:
        if not self.state.has_data:
            return True
        for bucket in (self.state.requests_min, self.state.requests_hour,
                       self.state.tokens_min, self.state.tokens_hour):
            if bucket.limit > 0:
                headroom = bucket.remaining / bucket.limit
                if headroom < 0.05 and bucket.remaining_seconds_now > 2:
                    return False
        return True

    def time_until_available(self) -> float:
        wait = 0.0
        for bucket in (self.state.requests_min, self.state.requests_hour,
                       self.state.tokens_min, self.state.tokens_hour):
            if bucket.limit > 0 and bucket.remaining / bucket.limit < 0.05:
                wait = max(wait, bucket.remaining_seconds_now)
        return wait


@dataclass
class ProviderScore:
    provider: str
    key_id: str
    overall: float = 0.0
    rate_limit: float = 0.0
    reliability: float = 0.0
    latency: float = 0.0
    cost: float = 0.0
    computed_at: float = 0.0


@dataclass
class MeshRoute:
    provider: str
    priority: int = 1
    model_alias: Optional[str] = None


@dataclass
class WarmupConfig:
    enabled: bool = False
    stages: list[dict] = field(default_factory=list)


@dataclass
class PlaneConfig:
    enabled: bool = False
    mode: str = "A"  # "A" = passive scoring, "B" = active routing
    scorer_weights: dict = field(default_factory=lambda: {
        "rate_limit": 0.40,
        "reliability": 0.30,
        "latency": 0.20,
        "cost": 0.10,
    })
    recompute_interval_sec: int = 30
    persistence_enabled: bool = True
    warmup: WarmupConfig = field(default_factory=WarmupConfig)
    mesh_routes: dict[str, list[MeshRoute]] = field(default_factory=dict)

    def __post_init__(self):
        self.mode = str(self.mode or "A").strip().upper()
        if self.mode not in {"A", "B"}:
            self.mode = "A"


@dataclass
class ResolvedRoute:
    provider: str
    key_id: str
    base_url: Optional[str] = None
    model: Optional[str] = None
    wait_seconds: float = 0.0
    is_fallback: bool = False
