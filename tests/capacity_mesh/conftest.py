import pytest

from agent.capacity_mesh import plane as _plane_mod


@pytest.fixture(autouse=True)
def reset_capacity_plane():
    with _plane_mod._plane_lock:
        old = _plane_mod._plane
        _plane_mod._plane = None
    yield
    with _plane_mod._plane_lock:
        if _plane_mod._plane is not None:
            try:
                _plane_mod._plane.stop()
            except Exception:
                pass
        _plane_mod._plane = old
