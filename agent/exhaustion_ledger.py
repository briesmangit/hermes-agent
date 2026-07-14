"""Cross-profile exhaustion ledger — shared coordination for multi-key pools.

Live background
---------------
Hermes runs up to ~10 profiles concurrently.  Each profile owns its own
``auth.json`` with its own ``credential_pool`` block — so when profile A
learns that a Gemini API key 429'd for the day, profile B's pool has no way
to know and keeps handing that key out, paying its own 429 round-trip
minutes later.  On heavy load with 9 profiles the same upstream daily quota
is independently discovered 9 times.  The waste is the visible symptom.

What this module does
---------------------
Sidecar ledger at ``<HERMES_HOME>/capacity/credential_exhaustion.json`` —
*one level above ``profiles/``, shared across the whole install*.  When any
profile's ``CredentialPool._mark_exhausted`` records a quota-key as
exhausted (with a real ``reset_at`` or a quota-window TTL fallback), it also
writes through to the ledger, keyed by provider + a non-reversible
fingerprint of the key.  Other profiles' pools see the ledger entry on
``load_pool()`` construction (cheaply) and on a periodic heartbeat (the
capacity plane already loops at 30s intervals — see
``capacity_mesh.plane.CapacityPlane._loop``), and apply the exhaustion
state to their local copy of the same key.  This is an *overlay*: the local
pool still owns its own keys and selection logic; only the exhaustion state
is shared.

Threading
---------
Multi-process writes are guarded by an OS file lock via the existing
``_auth_store_lock`` pattern (flock dance on a sibling ``.lock`` file).
Reads are read-with-cache to avoid touching the JSON file on every
``load_pool()`` call in a high-throughput loop.

This module deliberately avoids touching the credential plaintext — only a
sha256 fingerprint is stored in the shared ledger.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# Shared ledger sits one level above ``profiles/`` so all profiles share it.
# Resolved lazily from HERMES_HOME so test isolation (tmp_path) works.
_LEDGER_CACHE: Optional[Dict[str, Any]] = None
_LEDGER_CACHE_MTIME: float = 0.0
_LEDGER_CACHE_PATH: Optional[Path] = None


def _ledger_path() -> Path:
    """Resolve the canonical ledger path from HERMES_HOME.

    Falls back to ``~/.hermes/capacity/credential_exhaustion.json`` when
    HERMES_HOME is unset — production behaviour.
    """
    home = os.environ.get("HERMES_HOME")
    if home:
        return Path(home) / "capacity" / "credential_exhaustion.json"
    return Path.home() / ".hermes" / "capacity" / "credential_exhaustion.json"


def fingerprint_key(runtime_api_key: str) -> str:
    """Non-reversible fingerprint of an API key for the shared ledger.

    Storing the raw key in a level-shared JSON file would be a regression on
    secret-scope: the canonical ``auth.json`` already holds the keys per-profile,
    but the shared ledger is *cross-profile* — a write-storm from 9 profiles
    on a single shared file shouldn't have any plaintext keys on disk.

    sha256[:16] gives us collision-safe identification: 16 hex chars =
    64 bits of entropy, ample for distinguishing the ~9 keys per provider
    per install.  The fingerprint is unidirectional — original key cannot be
    recovered from it.
    """
    if not runtime_api_key:
        return ""
    # No raw key on disk.  Salt is constant — we don't need HMAC here, only
    # a stable identifier that two profiles computing it on the same key agree on.
    return hashlib.sha256(runtime_api_key.encode("utf-8")).hexdigest()[:16]


def _ensure_ledger_dir() -> None:
    p = _ledger_path().parent
    p.mkdir(parents=True, exist_ok=True)


def _read_ledger_locked() -> Dict[str, Any]:
    """Read the ledger JSON, with an mtime-keyed cache for hot paths.

    Returns an empty dict on any read/parse failure — never raises; a
    corrupted ledger should not break credential pool operations.
    """
    global _LEDGER_CACHE, _LEDGER_CACHE_MTIME, _LEDGER_CACHE_PATH

    path = _ledger_path()
    if _LEDGER_CACHE_PATH == path:
        try:
            mtime = path.stat().st_mtime
        except FileNotFoundError:
            return _LEDGER_CACHE or {}
        if mtime == _LEDGER_CACHE_MTIME and _LEDGER_CACHE is not None:
            return _LEDGER_CACHE
    _LEDGER_CACHE_PATH = path

    try:
        text = path.read_text()
        data = json.loads(text)
        if isinstance(data, dict):
            _LEDGER_CACHE = data
            _LEDGER_CACHE_MTIME = path.stat().st_mtime
            return data
    except FileNotFoundError:
        _LEDGER_CACHE = {}
        _LEDGER_CACHE_MTIME = 0.0
        return {}
    except Exception as exc:
        logger.debug("exhaustion_ledger: read failed (%s); treating as empty", exc)
        _LEDGER_CACHE = {}
        _LEDGER_CACHE_MTIME = 0.0
        return {}
    return _LEDGER_CACHE or {}


def _write_ledger(data: Dict[str, Any]) -> None:
    """Persist the full ledger atomically (write-temp then rename)."""
    global _LEDGER_CACHE, _LEDGER_CACHE_MTIME, _LEDGER_CACHE_PATH
    path = _ledger_path()
    _ensure_ledger_dir()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    tmp.replace(path)
    _LEDGER_CACHE = data
    _LEDGER_CACHE_MTIME = path.stat().st_mtime
    _LEDGER_CACHE_PATH = path


def mark_exhausted_shared(
    *,
    provider: str,
    runtime_api_key: str,
    reset_at: Optional[float],
    marked_by: str,
) -> None:
    """Write a (provider, key) exhaustion entry to the shared ledger.

    Args:
        provider: Pool provider name (e.g. 'gemini', 'nvidia').
        runtime_api_key: The actual key whose upstream quota rolled.
        reset_at: When the upstream window rolls (epoch seconds).  None when
            we don't know — readers treat that as "don't unblock until manual
            reset / a 200".
        marked_by: Profile name that recorded this.  For diagnostics only.
    """
    if not runtime_api_key:
        return
    fp = fingerprint_key(runtime_api_key)
    if not fp:
        return
    now = time.time()
    data = _read_ledger_locked()
    providers = data.setdefault("providers", {})
    prov = providers.setdefault(provider, {})
    prov[fp] = {
        "reset_at": reset_at,
        "marked_by": marked_by,
        "marked_at": now,
    }
    try:
        _write_ledger(data)
        logger.debug(
            "exhaustion_ledger: marked provider=%s key=%s reset_at=%s by=%s",
            provider, fp, reset_at, marked_by,
        )
    except Exception as exc:
        # Don't break the caller — the local pool's own mark_exhausted already
        # succeeded; the shared write is a best-effort cross-profile signal.
        logger.info("exhaustion_ledger: write failed (%s); local pool unaffected", exc)


def clear_exhausted_shared(
    *,
    provider: str,
    runtime_api_key: str,
) -> None:
    """Remove an entry from the shared ledger (key recovered).

    Called from ``mark_ok_on_success`` when a 200 response proves the upstream
    window rolled.  The other profiles will read the cleared state on their
    next heartbeat / ``load_pool()``.
    """
    if not runtime_api_key:
        return
    fp = fingerprint_key(runtime_api_key)
    if not fp:
        return
    data = _read_ledger_locked()
    providers = data.get("providers", {})
    prov = providers.get(provider)
    if not prov or fp not in prov:
        return
    prov.pop(fp)
    if not prov:
        providers.pop(provider, None)
    try:
        _write_ledger(data)
        logger.debug("exhaustion_ledger: cleared provider=%s key=%s", provider, fp)
    except Exception as exc:
        logger.info("exhaustion_ledger: clear failed (%s)", exc)


def get_shared_exhaustion(
    *,
    provider: str,
    runtime_api_key: str,
) -> Optional[Dict[str, Any]]:
    """Look up whether a key is globally marked exhausted in the ledger.

    Returns the entry dict (``reset_at``, ``marked_by``, ``marked_at``) if
    marked, else None.  Local pools consult this on load_pool() and heartbeat
    to align their own state.
    """
    if not runtime_api_key:
        return None
    fp = fingerprint_key(runtime_api_key)
    if not fp:
        return None
    data = _read_ledger_locked()
    return data.get("providers", {}).get(provider, {}).get(fp)


def list_shared_exhaustion(*, provider: Optional[str] = None) -> Dict[str, Any]:
    """Return the (optionally provider-filtered) shared ledger contents.

    Used by ``hermes pool status --shared`` and by unit tests.
    """
    data = _read_ledger_locked()
    providers = data.get("providers", {})
    if provider is None:
        return providers
    return {provider: providers.get(provider, {})}


def reset_shared_ledger(*, provider: Optional[str] = None, all_providers: bool = False) -> int:
    """Operator-recovery path — clear the shared ledger.

    Args:
        provider: If given, only clear that provider's entries.
        all_providers: If True, clear the entire ledger (operator
            ``hermes pool reset --shared``).

    Returns number of (provider, key) entries cleared.
    """
    data = _read_ledger_locked()
    providers = data.get("providers", {})
    if all_providers:
        n = sum(len(v) for v in providers.values())
        providers.clear()
        _write_ledger(data)
        return n
    if provider:
        n = len(providers.get(provider, {}))
        providers.pop(provider, None)
        _write_ledger(data)
        return n
    return 0


def clear_stale_shared_ledger(now: Optional[float] = None) -> int:
    """Drop ledger entries whose reset_at has demonstrably elapsed.

    Called from the capacity plane loop (30s cadence) so the ledger doesn't
    accumulate stale entries forever.  Entries with ``reset_at = None`` are
    kept — we only prune entries whose real upstream signal has elapsed.
    """
    if now is None:
        now = time.time()
    data = _read_ledger_locked()
    providers = data.get("providers", {})
    pruned = 0
    for prov_name, prov in list(providers.items()):
        for fp, entry in list(prov.items()):
            reset_at = entry.get("reset_at")
            if isinstance(reset_at, (int, float)) and now >= reset_at:
                prov.pop(fp)
                pruned += 1
        if not prov:
            providers.pop(prov_name, None)
    if pruned:
        _write_ledger(data)
        logger.debug("exhaustion_ledger: pruned %d stale entries", pruned)
    return pruned
