from __future__ import annotations

from agent.capacity_mesh.runtime import get_plane_safe


def cmd_capacity_status(args) -> int:  # noqa: ARG001
    """Print live capacity plane scores."""
    plane = get_plane_safe()
    if plane is None:
        print("capacity_plane: not configured or disabled")
        return 0
    scores = plane.all_scores()
    print(f"{'PROVIDER':<16} {'KEY':<16} {'SCORE':>6} {'RPM%':>6} {'REL':>5} {'LAT':>6} {'COST':>5}")
    for s in scores:
        print(f"{s.provider:<16} {s.key_id:<16} {s.overall:>6.2f} {s.rate_limit:>6.2f} {s.reliability:>5.2f} {s.latency:>6.2f} {s.cost:>5.2f}")
    return 0


def cmd_capacity(args) -> int:
    if args.capacity_command == "status":
        return cmd_capacity_status(args)
    print("capacity_plane: unknown subcommand")
    return 1
