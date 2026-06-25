"""Capacity mesh module for credential scoring and auto-demotion.

This module provides:
- demote.py: Core demotion logic (should_demote, record_score)
- runtime.py: Runtime hooks for integrating demotion with credential pool operations
"""

from agent.capacity_mesh.plane import CapacityPlane, configure_plane, get_plane
from agent.capacity_mesh.config import PlaneConfig, load_plane_config
from agent.capacity_mesh.types import MeshRoute, WarmupConfig
from .demote import DEMONITION_WINDOWS, SCORE_THRESHOLD, record_score, should_demote
from .runtime import (
    get_score_history,
    record_dispatch_score,
    set_credential_priority,
)

__all__ = [
    "CapacityPlane", "configure_plane", "get_plane", "PlaneConfig",
    "load_plane_config", "MeshRoute", "WarmupConfig",
    "SCORE_THRESHOLD",
    "DEMONITION_WINDOWS",
    "should_demote",
    "record_score",
    "get_score_history",
    "record_dispatch_score",
    "set_credential_priority",
]