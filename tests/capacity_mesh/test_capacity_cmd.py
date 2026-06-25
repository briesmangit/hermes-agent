import types

from hermes_cli.capacity_cmd import cmd_capacity_status


def test_capacity_status_when_disabled(capsys, monkeypatch):
    monkeypatch.setattr(
        "hermes_cli.capacity_cmd.get_plane_safe", lambda: None
    )
    assert cmd_capacity_status(types.SimpleNamespace()) == 0
    captured = capsys.readouterr()
    assert "not configured" in captured.out
