from __future__ import annotations

from hermes_cli.config import load_config
from agent.capacity_mesh.types import MeshRoute, PlaneConfig, WarmupConfig


def load_plane_config() -> PlaneConfig:
    """Load top-level capacity_plane config from the active profile's config.yaml."""
    try:
        cfg = load_config()
    except Exception:
        cfg = {}
    cp = cfg.get("capacity_plane", {}) or {}
    mesh = cp.get("mesh_routes", {}) or {}
    routes: dict[str, list[MeshRoute]] = {}
    for model, entries in mesh.items():
        routes[model] = [
            MeshRoute(provider=e.get("provider"), priority=e.get("priority", 1),
                      model_alias=e.get("model_alias"))
            for e in entries
        ]
    warmup_cfg = cfg.get("credential_pool", {}).get("warmup", {}) or {}
    return PlaneConfig(
        enabled=bool(cp.get("enabled", False)),
        mode=str(cp.get("mode", "A")),
        scorer_weights={
            **PlaneConfig().scorer_weights,
            **(cp.get("scorer_weights", {}) or {}),
        },
        recompute_interval_sec=int(cp.get("recompute_interval_sec", 30)),
        persistence_enabled=bool(cp.get("persistence_enabled", True)),
        warmup=WarmupConfig(
            enabled=bool(warmup_cfg.get("enabled", False)),
            stages=warmup_cfg.get("stages", []),
        ),
        mesh_routes=routes,
    )
