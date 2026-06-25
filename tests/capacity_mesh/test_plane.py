from agent.capacity_mesh.plane import CapacityPlane, configure_plane, get_plane
from agent.capacity_mesh.types import PlaneConfig


def test_configure_plane_lifecycle():
    cfg = PlaneConfig(enabled=True, recompute_interval_sec=5, persistence_enabled=False)
    plane = configure_plane(cfg)
    assert plane is not None
    assert plane.all_scores() == []
    plane.stop()


def test_get_plane_before_config_raises():
    import pytest
    with pytest.raises(RuntimeError):
        get_plane()
