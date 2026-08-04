import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { $allProfileSessions, $sessions } from '@/store/session'
import { $allProfileSunsetIds } from '@/store/sunset-cross-profile'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface SunsetSectionProps {
  activeSessionId: string | null
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onToggleSunset: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

/**
 * Sunset section — collects sessions the user has triaged as "done but not
 * archived" into one collapsible, low-emphasis block at the bottom of the
 * sidebar. Hidden entirely when empty. Rows render with their per-profile color
 * chip (like the all-profiles view) so a sunset session from another profile
 * still reads as belonging elsewhere.
 *
 * Reads the cross-profile mirror `$allProfileSunsetIds` (not the per-profile
 * `$sunsetSessionIds`) so sunset sessions from ALL profiles appear regardless
 * of which scope the operator is browsing — the same pattern as
 * CompletedSection using `$allProfileSessions`.
 */
export function SunsetSection({
  activeSessionId,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePin,
  onToggleSunset,
  onBranchSession
}: SunsetSectionProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const [open, setOpen] = useState(true)

  // Cross-profile sunset ids — merges every profile's sunset localStorage key.
  const allSunsetIds = useStore($allProfileSunsetIds)

  const scopedSessions = useStore($sessions)
  const crossProfileSessions = useStore($allProfileSessions)

  // Build a session lookup from both the scoped list and the cross-profile
  // mirror so sunset sessions from other profiles resolve to their full
  // SessionInfo objects even when not in the active scope.
  const sessionById = useMemo(() => {
    const map = new Map<string, SessionInfo>()

    for (const s of scopedSessions) {map.set(s.id, s)}

    for (const s of crossProfileSessions) {
      if (!map.has(s.id)) {map.set(s.id, s)}
    }

    return map
  }, [scopedSessions, crossProfileSessions])

  const sunsetIdSet = useMemo(() => new Set(allSunsetIds), [allSunsetIds])

  const sunsetSessions = useMemo(() => {
    const resolved: SessionInfo[] = []

    for (const id of sunsetIdSet) {
      const session = sessionById.get(id)

      if (session) {
        resolved.push(session)
      }
    }

    // Also match by lineage-root id so a compressed continuation tip still
    // resolves to a session object even if the root id itself isn't a session id.
    for (const session of crossProfileSessions) {
      if (resolved.includes(session)) {
        continue
      }

      const rootId = session._lineage_root_id ?? session.id

      if (sunsetIdSet.has(rootId) && !sessionById.get(rootId)) {
        resolved.push(session)
      }
    }

    return resolved.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
  }, [sunsetIdSet, sessionById, crossProfileSessions])

  if (sunsetSessions.length === 0) {
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
          <SidebarPanelLabel>{s.sunsetSection}</SidebarPanelLabel>
          <SidebarCount>{sunsetSessions.length}</SidebarCount>
          <DisclosureCaret className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100" open={open} />
        </button>
      </div>
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {sunsetSessions.map(session => (
            <SidebarSessionRow
              isPinned={false}
              isSelected={session.id === activeSessionId}
              isSunset
              isWorking={false}
              key={session.id}
              onArchive={() => onArchiveSession(session.id)}
              onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
              onDelete={() => onDeleteSession(session.id)}
              onPin={() => onTogglePin(session.id)}
              onResume={() => onResumeSession(session.id)}
              onToggleSunset={() => onToggleSunset(session.id)}
              session={session}
            />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
