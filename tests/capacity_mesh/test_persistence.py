import os
import tempfile
from pathlib import Path

from agent.capacity_mesh.persistence import ScorePersistence
from agent.capacity_mesh.types import ProviderScore


def test_persistence_round_trip(tmp_path):
    db = tmp_path / "scores.db"
    p = ScorePersistence(path=db)
    p.save([ProviderScore(provider="openrouter", key_id="k1", overall=0.9)])
    loaded = p.load()
    assert len(loaded) == 1
    assert loaded[0].key_id == "k1"
    assert loaded[0].overall == 0.9


def test_persistence_empty_load(tmp_path):
    db = tmp_path / "scores.db"
    assert ScorePersistence(path=db).load() == []
