import { atom } from 'nanostores'

import { storedStringArray } from '@/lib/storage'
import type { SessionInfo } from '@/types/hermes'

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

// ─── Auto-detection ───────────────────────────────────────────────────────────
// Kanban-spawned sessions are identificable by two structural signals, so the
// Kanban tier can auto-populate without requiring a manual "Mark as Kanban"
// toggle on every session. Both signals are matched here so the detection is
// robust even when one is missing (e.g. legacy sessions without cwd, or
// renamed sessions whose title no longer matches).
//
// 1. cwd: the kanban dispatcher mints a per-task git worktree under
//    `<repo>/.worktrees/t_<hex>/` (see kanban_db.py's _ensure_git_worktree).
//    This path pattern is structural and survives renames.
//
// 2. title: the dispatcher sets the worker's first prompt to
//    `f"work kanban task {task.id}"` (see kanban_db.py line ~7745), which
//    becomes the session title. Matching `^work kanban task ` catches all
//    dispatcher-spawned worker sessions.

// Must stay in sync with `KANBAN_DIR_RE` in workspace-groups.ts:
//   /^(.*[/\\]\.worktrees)[/\\]t_[0-9a-f]+[/\\]?$/
const KANBAN_CWD_RE = /[\\/]\.worktrees[\\/]t_[0-9a-f]+[\\/]?$/

const KANBAN_TITLE_RE = /^work kanban task \S+/i

/** True when the session's cwd is a kanban task worktree (`<repo>/.worktrees/t_<hex>`). */
export function isKanbanSessionByCwd(session: SessionInfo): boolean {
  return Boolean(session.cwd && KANBAN_CWD_RE.test(session.cwd))
}

/** True when the session title matches the dispatcher's `"work kanban task <id>"` prompt. */
export function isKanbanSessionByTitle(session: SessionInfo): boolean {
  return Boolean(session.title && KANBAN_TITLE_RE.test(session.title))
}

/** True when the session is auto-detected as kanban-spawned (by cwd OR title). */
export function isAutoKanbanSession(session: SessionInfo): boolean {
  return isKanbanSessionByCwd(session) || isKanbanSessionByTitle(session)
}
