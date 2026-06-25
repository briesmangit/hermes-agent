import os
import tempfile
from pathlib import Path

from agent.capacity_mesh.config import load_plane_config


def test_load_plane_config_disabled(tmp_path, monkeypatch):
    cfg = tmp_path / "config.yaml"
    cfg.write_text("capacity_plane:\n  enabled: false\n")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.chdir(tmp_path)
    plane_cfg = load_plane_config()
    assert plane_cfg.enabled is False


def test_load_plane_config_enabled(tmp_path, monkeypatch):
    cfg = tmp_path / "config.yaml"
    cfg.write_text("""
capacity_plane:
  enabled: true
  mode: B
  recompute_interval_sec: 10
  scorer_weights:
    latency: 0.5
""")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    plane_cfg = load_plane_config()
    assert plane_cfg.enabled is True
    assert plane_cfg.mode == "B"
    assert plane_cfg.recompute_interval_sec == 10
    assert plane_cfg.scorer_weights["latency"] == 0.5
    assert plane_cfg.scorer_weights["rate_limit"] == 0.40


def test_plane_config_mode_normalizes():
    from agent.capacity_mesh.types import PlaneConfig
    assert PlaneConfig(mode="b").mode == "B"
    assert PlaneConfig(mode="invalid").mode == "A"
