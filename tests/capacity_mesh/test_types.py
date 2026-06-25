from agent.capacity_mesh.types import (
    MeshRoute, PlaneConfig, ProviderScore, ProviderSnapshot, RateLimitBucket, RateLimitState,
)


def test_rate_limit_bucket_defaults():
    b = RateLimitBucket()
    assert b.limit == 0
    assert b.remaining == 0
    assert b.reset_at == 0.0


def test_plane_config_defaults():
    cfg = PlaneConfig()
    assert cfg.enabled is False
    assert cfg.scorer_weights == {
        "rate_limit": 0.40, "reliability": 0.30, "latency": 0.20, "cost": 0.10,
    }


def test_provider_snapshot_accepts_when_no_data():
    snap = ProviderSnapshot(provider="openrouter", key_id="key1")
    assert snap.can_accept() is True


def test_mesh_route_defaults():
    r = MeshRoute(provider="openrouter")
    assert r.priority == 1
    assert r.model_alias is None
