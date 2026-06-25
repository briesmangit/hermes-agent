from __future__ import annotations

from typing import Callable


def build_capacity_parser(subparsers, *, cmd_capacity: Callable) -> None:
    parser = subparsers.add_parser(
        "capacity",
        help="Capacity plane commands",
        description="Inspect and manage the provider capacity plane.",
    )
    sub = parser.add_subparsers(dest="capacity_command")
    status = sub.add_parser("status", help="show capacity plane scores")
    status.set_defaults(func=cmd_capacity)
    parser.set_defaults(func=cmd_capacity)
