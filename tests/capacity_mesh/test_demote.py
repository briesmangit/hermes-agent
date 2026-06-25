"""Tests for the capacity mesh auto-demotion module."""

from __future__ import annotations

import json
import time

import pytest


def test_should_demote_returns_false_with_few_scores():
    """Less than 3 scores should not trigger demotion."""
    from agent.capacity_mesh.demote import should_demote

    assert should_demote([0.5, 0.5]) is False
    assert should_demote([0.5]) is False
    assert should_demote([]) is False


def test_should_demote_returns_false_with_mixed_scores():
    """Mixed scores should not trigger demotion."""
    from agent.capacity_mesh.demote import should_demote

    assert should_demote([0.5, 0.3, 0.3]) is False
    assert should_demote([0.3, 0.5, 0.3]) is False
    assert should_demote([0.3, 0.3, 0.5]) is False


def test_should_demote_returns_true_with_three_bad_scores():
    """Three consecutive scores below 0.4 should trigger demotion."""
    from agent.capacity_mesh.demote import should_demote

    assert should_demote([0.3, 0.3, 0.3]) is True
    assert should_demote([0.1, 0.2, 0.3]) is True
    assert should_demote([0.39, 0.39, 0.39]) is True  # Just below threshold


def test_should_demote_ignores_old_scores():
    """Only the last 3 scores matter."""
    from agent.capacity_mesh.demote import should_demote

    # 4 scores: first good, last 3 bad -> should demote
    assert should_demote([0.9, 0.3, 0.3, 0.3]) is True
    # 4 scores: last 3 good -> should not demote
    assert should_demote([0.3, 0.5, 0.5, 0.5]) is False


def test_record_score_truncates_history():
    """Record score should keep only the last 3 scores."""
    from agent.capacity_mesh.demote import record_score

    history = []
    for score in [0.5, 0.4, 0.3, 0.2, 0.1]:
        history = record_score(history, score)

    assert len(history) == 3
    assert history == [0.3, 0.2, 0.1]


def test_demote_credential_reduces_priority(tmp_path, monkeypatch):
    """Demoting a credential should reduce its priority."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir(parents=True, exist_ok=True)
    auth_file = hermes_home / "auth.json"
    auth_file.write_text(json.dumps({
        "version": 1,
        "credential_pool": {
            "gemini": [
                {
                    "id": "cred-1",
                    "label": "key 1",
                    "auth_type": "api_key",
                    "priority": 0,
                    "source": "manual",
                    "access_token": "test-key",
                },
                {
                    "id": "cred-2",
                    "label": "key 2",
                    "auth_type": "api_key",
                    "priority": 1,
                    "source": "manual",
                    "access_token": "test-key-2",
                },
            ]
        }
    }))

    from agent.credential_pool import load_pool

    pool = load_pool("gemini")
    assert pool.demote("key 1") is True

    # Priority should be reduced
    assert pool._entries[0].priority == -1


def test_demote_at_minimum_priority_stays_at_minimum(tmp_path, monkeypatch):
    """Cannot demote below priority -1."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir(parents=True, exist_ok=True)
    auth_file = hermes_home / "auth.json"
    auth_file.write_text(json.dumps({
        "version": 1,
        "credential_pool": {
            "gemini": [
                {
                    "id": "cred-1",
                    "label": "key 1",
                    "auth_type": "api_key",
                    "priority": -1,
                    "source": "manual",
                    "access_token": "test-key",
                },
            ]
        }
    }))

    from agent.credential_pool import load_pool

    pool = load_pool("gemini")
    assert pool.demote("key 1") is False
    assert pool._entries[0].priority == -1


def test_set_priority_updates_entry(tmp_path, monkeypatch):
    """set_priority should update an entry's priority."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir(parents=True, exist_ok=True)
    auth_file = hermes_home / "auth.json"
    auth_file.write_text(json.dumps({
        "version": 1,
        "credential_pool": {
            "gemini": [
                {
                    "id": "cred-1",
                    "label": "key 1",
                    "auth_type": "api_key",
                    "priority": 0,
                    "source": "manual",
                    "access_token": "test-key",
                },
            ]
        }
    }))

    from agent.credential_pool import load_pool

    pool = load_pool("gemini")
    assert pool.set_priority("key 1", 5) is True
    assert pool._entries[0].priority == 5
    assert pool.set_priority("cred-1", -3) is True
    assert pool._entries[0].priority == -3


def test_record_dispatch_score_triggers_demotion(tmp_path, monkeypatch):
    """record_dispatch_score should demote after 3 bad scores."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir(parents=True, exist_ok=True)
    auth_file = hermes_home / "auth.json"
    auth_file.write_text(json.dumps({
        "version": 1,
        "credential_pool": {
            "gemini": [
                {
                    "id": "cred-1",
                    "label": "key 1",
                    "auth_type": "api_key",
                    "priority": 0,
                    "source": "manual",
                    "access_token": "test-key",
                },
            ]
        }
    }))

    from agent.credential_pool import load_pool
    from agent.capacity_mesh.runtime import record_dispatch_score, _score_histories

    pool = load_pool("gemini")
    entry = pool._entries[0]

    # Record 2 bad scores - no demotion yet
    record_dispatch_score(pool, entry, 0.3)
    record_dispatch_score(pool, entry, 0.3)
    assert pool._entries[0].priority == 0  # Still at original priority

    # Third bad score triggers demotion
    record_dispatch_score(pool, entry, 0.3)
    assert pool._entries[0].priority == -1  # Demoted