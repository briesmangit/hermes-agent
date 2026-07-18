import { atom } from 'nanostores'

import { storedStringArray } from '@/lib/storage'

// ─── Cross-profile priority mirror ─────────────────────────────────────────────
// $prioritySessionIds (in store/session.ts) is per-profile persisted via
// priorityKey(): in local mode it's a single shared key, but in remote mode each
// gateway+profile combo gets its own localStorage key. In ALL_PROFILES view
// the per-profile atom only reflects the *active* connection's priority set, so
// sessions triaged as "priority" on other profiles never appear.
//
// $allProfilePriorityIds is the cross-profile mirror: it merges every priority key
// found in localStorage so PrioritySection can show priority sessions from ALL
// profiles regardless of which scope the operator is browsing.
export const $allProfilePriorityIds = atom<string[]>([])

// Prefix shared by the base local key and every remote variant.
const PRIORITY_KEY_PREFIX = 'hermes.desktop.prioritySessionIds'

export function refreshAllProfilePriorityIds(): void {
  const merged = new Set<string>()

  try {
    // Scan every localStorage key that matches the priority scheme — this
    // catches the base local key ('hermes.desktop.prioritySessionIds') and all
    // remote variants ('hermes.desktop.prioritySessionIds.remote.<base>.<profile>').
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)

      if (!key || !key.startsWith(PRIORITY_KEY_PREFIX)) {
        continue
      }

      for (const id of storedStringArray(key)) {
        merged.add(id)
      }
    }
  } catch {
    // localStorage access can fail in restricted contexts; fall back to the
    // last-known mirror state (the atom keeps its previous value).
    return
  }

  const next = [...merged]

  // Avoid spurious re-renders: only write when the set actually changed.
  const prev = $allProfilePriorityIds.get()

  if (prev.length !== next.length || !next.every((id, i) => prev[i] === id)) {
    $allProfilePriorityIds.set(next)
  }
}