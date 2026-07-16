// Pause/Resume store atoms. Holds the in-memory copy of the pause manifest so
// the statusbar button and session-row badges react to it across the app.
//
// The manifest is the source of truth for "what is frozen". On boot the app
// hydrates $pausedManifest from localStorage (see use-pause-resume), so a
// relaunch restores the frozen view WITHOUT auto-reviving turns — the user
// clicks Resume to re-dispatch.

import { atom, computed } from 'nanostores'

import { clearPauseManifest, type PauseManifest, readPauseManifest, writePauseManifest } from '@/lib/pause-resume'

/** Current pause manifest (null = nothing frozen). */
export const $pausedManifest = atom<null | PauseManifest>(readPauseManifest())

/** True whenever at least one session is frozen and awaiting Resume. */
export const $hasPausedSessions = computed($pausedManifest, manifest => manifest !== null && manifest.sessions.length > 0)

/** Set of frozen stored session ids — cheap membership test for row badges. */
export const $pausedSessionIds = computed($pausedManifest, manifest =>
  manifest ? new Set(manifest.sessions.map(s => s.sessionId)) : new Set<string>(),
)

/** Replace the manifest and persist it. */
export function setPauseManifest(manifest: null | PauseManifest): void {
  $pausedManifest.set(manifest)

  if (manifest && manifest.sessions.length > 0) {
    writePauseManifest(manifest)
  } else {
    clearPauseManifest()
  }
}

/** Drop the manifest from memory + storage (called after Resume finishes). */
export function clearPauseState(): void {
  $pausedManifest.set(null)
  clearPauseManifest()
}
