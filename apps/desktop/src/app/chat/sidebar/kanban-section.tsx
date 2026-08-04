import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { $allProfileSessions, $sessions } from '@/store/session'
import { $allProfileKanbanIds, isAutoKanbanSession } from '@/store/kanban-cross-profile'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface KanbanSectionProps {
  activeSessionId: string | null
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onToggleKanban: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

/**
 * Kanban section — collects sessions that are part of kanban task worktrees
 * (detected via kanbanWorktreeDir(cwd) or manually marked via the kebab menu)
 * into one collapsible block. Hidden entirely when empty.
 *
 * Reads the cross-profile mirror `$allProfileKanbanIds` (not the per-profile
 * `$kanbanSessionIds`) so kanban sessions from ALL profiles appear regardless
 * of which scope the operator is browsing — the same pattern as
 * CompletedSection using `$allProfileSessions` and SunsetSection using
 * `$allProfileSunsetIds`.
 */
export function KanbanSection({
  activeSessionId,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePin,
  onToggleKanban,
  onBranchSession
}: KanbanSectionProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const [open, setOpen] = useState(true)

  // Cross-profile kanban ids — merges every profile's kanban localStorage key.
  const allKanbanIds = useStore($allProfileKanbanIds)

  const scopedSessions = useStore($sessions)
  const crossProfileSessions = useStore($allProfileSessions)

  // Build a session lookup from both the scoped list and the cross-profile
  // mirror so kanban sessions from other profiles resolve to their full
  // SessionInfo objects even when not in the active scope.
  const sessionById = useMemo(() => {
    const map = new Map<string, SessionInfo>()

    for (const s of scopedSessions) { map.set(s.id, s) }

    for (const s of crossProfileSessions) {
      if (!map.has(s.id)) { map.set(s.id, s) }
    }

    return map
  }, [scopedSessions, crossProfileSessions])

  const kanbanIdSet = useMemo(() => new Set(allKanbanIds), [allKanbanIds])

  const kanbanSessions = useMemo(() => {
    const resolved: SessionInfo[] = []
    const seen = new Set<string>()

    // 1) Sessions explicitly toggled (manual "Mark as Kanban").
    for (const id of kanbanIdSet) {
      const session = sessionById.get(id)

      if (session) {
        resolved.push(session)
        seen.add(session.id)
      }
    }

    // Also match by lineage-root id so a compressed continuation tip still
    // resolves to a session object even if the root id itself isn't a session id.
    for (const session of crossProfileSessions) {
      if (seen.has(session.id)) {
        continue
      }

      const rootId = session._lineage_root_id ?? session.id

      if (kanbanIdSet.has(rootId) && !sessionById.get(rootId)) {
        resolved.push(session)
        seen.add(session.id)
      }
    }

    // 2) Auto-detected kanban sessions: cwd is a kanban task worktree
    //    (`<repo>/.worktrees/t_<hex>`) OR title matches `"work kanban task …"`.
    //    These appear in the Kanban tier automatically — no manual toggle needed.
    for (const session of crossProfileSessions) {
      if (seen.has(session.id)) {
        continue
      }

      if (isAutoKanbanSession(session)) {
        resolved.push(session)
        seen.add(session.id)
      }
    }

    return resolved.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
  }, [kanbanIdSet, sessionById, crossProfileSessions])

  if (kanbanSessions.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <SidebarPanelLabel>{s.kanbanSection}</SidebarPanelLabel>
          <SidebarCount>{kanbanSessions.length}</SidebarCount>
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      </div>
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {kanbanSessions.map(session => (
            <SidebarSessionRow
              isPinned={false}
              isSelected={session.id === activeSessionId}
              isKanban
              isWorking={false}
              key={session.id}
              onArchive={() => onArchiveSession(session.id)}
              onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
              onDelete={() => onDeleteSession(session.id)}
              onPin={() => onTogglePin(session.id)}
              onResume={() => onResumeSession(session.id)}
              onToggleKanban={() => onToggleKanban(session.id)}
              session={session}
            />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}