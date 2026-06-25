from __future__ import annotations

from agent.capacity_mesh.runtime import get_plane_safe


def record_response(provider: str, key_id: str, headers: dict[str, str] | None,
                    status_code: int, latency_ms: float) -> None:
    plane = get_plane_safe()
    if plane is None:
        return
    plane.record_response(provider, key_id, headers, status_code, latency_ms)
