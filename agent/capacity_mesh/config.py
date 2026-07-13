"""Configuration loading for the capacity plane.

Provides MeshConfig dataclass and load_plane_config function for the
/api/v1/capacity/plane endpoint to expose mesh routing configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class MeshRoute:
    """A single mesh route entry."""
    provider: str
    priority: int
    model_alias: Optional[str] = None


@dataclass
class MeshConfig:
    """Configuration for the capacity plane mesh routing."""
    enabled: bool = True
    mode: str = "dynamic"  # "dynamic" or "static"
    persistence_enabled: bool = True
    recompute_interval_sec: int = 60
    mesh_routes: Dict[str, List[MeshRoute]] = field(default_factory=dict)


def load_plane_config() -> MeshConfig:
    """Load capacity plane configuration from config.yaml.

    Returns:
        MeshConfig with current settings. Falls back to defaults if
        config is not found or doesn't contain capacity_plane settings.
    """
    try:
        from hermes_cli.config import load_config
        config = load_config()

        plane_cfg = config.get("capacity_plane", {})

        return MeshConfig(
            enabled=plane_cfg.get("enabled", True),
            mode=plane_cfg.get("mode", "dynamic"),
            persistence_enabled=plane_cfg.get("persistence_enabled", True),
            recompute_interval_sec=plane_cfg.get("recompute_interval_sec", 60),
            mesh_routes={},  # Will be populated from routing config
        )
    except Exception:
        return MeshConfig()