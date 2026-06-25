import os
import tempfile

from agent.capacity_mesh.runtime import init_capacity_plane_if_enabled, get_plane_safe


def test_init_disabled_returns_none(tmp_path):
    cfg = tmp_path / "config.yaml"
    cfg.write_text("capacity_plane:\n  enabled: false\n")
    old = os.environ.get("HERMES_HOME")
    try:
        os.environ["HERMES_HOME"] = str(tmp_path)
        assert init_capacity_plane_if_enabled() is None
    finally:
        if old is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = old


def test_init_enabled_and_safe_get(tmp_path):
    cfg = tmp_path / "config.yaml"
    cfg.write_text("capacity_plane:\n  enabled: true\n  persistence_enabled: false\n")
    old = os.environ.get("HERMES_HOME")
    try:
        os.environ["HERMES_HOME"] = str(tmp_path)
        plane = init_capacity_plane_if_enabled()
        assert plane is not None
        assert get_plane_safe() is plane
        plane.stop()
    finally:
        if old is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = old
