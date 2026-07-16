// Pause/Resume manifest — survives a desktop-app restart so in-flight sessions
// can be frozen (Pause) and later revived (manual Resume on relaunch).
//
// Design: an in-flight turn is a `tui_gateway.slash_worker` subprocess owned by
// the desktop's own `serve` process. Killing the GUI (our standard restart path)
// therefore kills every running turn. Pause turns that into a *deliberate,
// recoverable* freeze: it records each working session's last user prompt to a
// manifest, then aborts the turn. Resume re-dispatches the recorded prompt to a
// fresh turn. Manifest lives in localStorage (renderer-accessible, restart-safe)
// per the AGENTS.md seam rule — GUI intent is a renderer/runtime fact, NOT
// gateway state, so it does NOT go in state.db.

import { persistString, storedString } from '@/lib/storage'

export interface PausedSessionEntry {
  /** Stable stored session id the turn was running on. */
  sessionId: string
  /** Profile that owned the turn (so Resume routes to the right gateway). */
  profile: string
  /** The last user prompt — re-dispatched verbatim on Resume. */
  lastUserPrompt: string
}

export interface PauseManifest {
  version: 1
  /** ISO timestamp of the Pause action. */
  pausedAt: string
  /** Active profile at pause time (the one whose turns were frozen). */
  profile: string
  sessions: PausedSessionEntry[]
}

const MANIFEST_KEY = 'hermes.desktop.pauseManifest'

/** Read the current manifest, or null when none is stored. */
export function readPauseManifest(): null | PauseManifest {
  const raw = storedString(MANIFEST_KEY)

  if (!raw) {return null}

  try {
    const parsed = JSON.parse(raw) as PauseManifest

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/** Persist a manifest. Passing a manifest with zero sessions is equivalent to clear. */
export function writePauseManifest(manifest: PauseManifest): void {
  if (manifest.sessions.length === 0) {
    clearPauseManifest()

    return
  }

  persistString(MANIFEST_KEY, JSON.stringify(manifest))
}

/** Remove the manifest entirely (e.g. after Resume dispatched everything). */
export function clearPauseManifest(): void {
  persistString(MANIFEST_KEY, null)
}

/**
 * Build a manifest from the currently-working sessions.
 *
 * @param workingSessions  Tuples of [sessionId, profile, lastUserPrompt] for
 *                         every session that had an active turn at pause time.
 * @param activeProfile    The profile whose turns are being frozen.
 */
export function buildPauseManifest(
  workingSessions: ReadonlyArray<readonly [string, string, string]>,
  activeProfile: string,
): PauseManifest {
  return {
    version: 1,
    pausedAt: new Date().toISOString(),
    profile: activeProfile,
    sessions: workingSessions.map(([sessionId, profile, lastUserPrompt]) => ({
      sessionId,
      profile,
      lastUserPrompt,
    })),
  }
}
