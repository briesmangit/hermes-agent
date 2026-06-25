from agent.capacity_mesh.capacity.tracker import ProviderCapacityTracker


def test_record_success_without_headers():
    t = ProviderCapacityTracker()
    t.record_response("openrouter", "key1", status_code=200, latency_ms=120.0)
    snap = t.get_snapshot("openrouter", "key1")
    assert snap is not None
    assert snap.success_count == 1
    assert snap.failure_count == 0


def test_record_429_failure():
    t = ProviderCapacityTracker()
    t.record_response("openrouter", "key1", status_code=429, latency_ms=0.0)
    snap = t.get_snapshot("openrouter", "key1")
    assert snap.failure_count == 1
    assert snap.success_count == 0


def test_record_rate_limit_headers():
    t = ProviderCapacityTracker()
    t.record_response(
        "openrouter", "key1",
        headers={"x-ratelimit-remaining-requests": "5", "x-ratelimit-limit-requests": "60"},
        status_code=200,
        latency_ms=100.0,
    )
    snap = t.get_snapshot("openrouter", "key1")
    assert snap.state.has_data is True
    assert snap.state.requests_min.remaining == 5
    assert snap.state.requests_min.limit == 60
