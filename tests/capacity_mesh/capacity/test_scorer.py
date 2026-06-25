from agent.capacity_mesh.capacity.scorer import CapacityScorer
from agent.capacity_mesh.capacity.tracker import ProviderCapacityTracker
from agent.capacity_mesh.types import PlaneConfig


def test_scorer_computes_overall():
    cfg = PlaneConfig()
    tracker = ProviderCapacityTracker()
    tracker.record_response("openrouter", "key1", status_code=200, latency_ms=100.0)
    scorer = CapacityScorer(tracker, cfg)
    scorer.recompute_all()
    score = scorer.score("openrouter", "key1")
    assert 0.0 <= score.overall <= 1.0
    assert score.reliability == 1.0


def test_scorer_penalizes_failures():
    cfg = PlaneConfig()
    tracker = ProviderCapacityTracker()
    for _ in range(4):
        tracker.record_response("openrouter", "key1", status_code=200, latency_ms=10.0)
    tracker.record_response("openrouter", "key1", status_code=500, latency_ms=10.0)
    scorer = CapacityScorer(tracker, cfg)
    scorer.recompute_all()
    score = scorer.score("openrouter", "key1")
    assert score.reliability == 0.8
    assert score.overall < 1.0
