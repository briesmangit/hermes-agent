import { atom } from 'nanostores'

import { storedStringArray } from '@/lib/storage'

// ─── Cross-profile kanban mirror ──────────────────────────────────────────────
// $kanbanSessionIds (in store/session.ts) is per-profile persisted via
// kanbanKey(): in local mode it's a single shared key, but in remote mode each
// gateway+profile combo gets its own localStorage key. In ALL_PROFILES view
// the per-profile atom only reflects the *active* connection's kanban set, so
// sessions spawned from kanban tasks on other profiles never appear.
//
// $allProfileKanbanIds is the cross-profile mirror: it merges every kanban key
// found in localStorage so KanbanSection can show kanban sessions from ALL
// profiles regardless of which scope the operator is browsing — the same fix
// pattern as $allProfileSessions for the Completed section.
export const $allProfileKanbanIds = atom<string[]>([])

// Prefix shared by the base local key and every remote variant.
const KANBAN_KEY_PREFIX = 'hermes.desktop.kanbanSessionIds'

export function refreshAllProfileKanbanIds(): void {
  const merged = new Set<string>()

  try {
    // Scan every localStorage key that matches the kanban scheme — this
    // catches the base local key ('hermes.desktop.kanbanSessionIds') and all
    // remote variants ('hermes.desktop.kanbanSessionIds.remote.<base>.<profile>').
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)

      if (!key || !key.startsWith(KANBAN_KEY_PREFIX)) {
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
  const prev = $allProfileKanbanIds.get()

  if (prev.length !== next.length || !next.every((id, i) => prev[i] === id)) {
    $allProfileKanbanIds.set(next)
  }
}