import { useMemo } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { profileColor } from '@/lib/profile-color'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface PrioritySectionProps {
  /**
   * Cross-profile union of every profile's live session mirror. This is the
   * source of truth for priority scanning — never pass the scope-filtered
   * `$sessions` here, or a priority from profile B becomes invisible
   * while the operator is scoped to profile A (INV-5).
   */
  allProfileSessions: SessionInfo[]
  /** Ids flagged `isPriority` by the operator. */
  allProfilePriorityIds: Set<string>
  activeSessionId: string | null
  workingSessionIdSet: Set<string>
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onTogglePriority: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

/**
 * PrioritySection — top tier of the Fleet Tier List.
 *
 * Surfaces every session currently flagged by the operator as priority.
 * Invariant INV-5: this tier is always cross-profile — `allProfileSessions` is
 * the union of every profile's live mirror, so a priority in profile B is
 * visible while the operator is scoped to profile A.
 *
 * Invariant INV-6: the row carries a steady 3px amber left-border (no pulse /
 * ping animation). The header is always expanded while non-empty.
 */
export function PrioritySection({
  allProfileSessions,
  allProfilePriorityIds,
  activeSessionId,
  workingSessionIdSet,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePin,
  onTogglePriority,
  onBranchSession
}: PrioritySectionProps) {
  const { t } = useI18n()
  const s = t.sidebar

  // Cross-profile filter + sort by `last_active` desc (newest first).
  const sessions = useMemo(() => {
    if (allProfilePriorityIds.size === 0) {
      return []
    }

    const next: SessionInfo[] = []

    for (const session of allProfileSessions) {
      if (allProfilePriorityIds.has(session.id)) {
        next.push(session)
      }
    }

    next.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))

    return next
  }, [allProfileSessions, allProfilePriorityIds])

  // Render nothing when there is nothing to prioritize.
  if (sessions.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="priority-section shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <div className="flex w-fit items-center gap-1 leading-none">
          <SidebarPanelLabel>{s.prioritySection}</SidebarPanelLabel>
          <SidebarCount>{sessions.length}</SidebarCount>
        </div>
      </div>
      <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
        {sessions.map(session => {
          const color = profileColor(session.profile)
          // INV-6: 3px steady amber left-border.
          const borderWidth = 3

          return (
            <div className="relative" key={session.id}>
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 bg-amber-500"
                style={{ width: `${borderWidth / 16}rem` }}
              />
              {color && (
                <span
                  aria-hidden
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{
                    backgroundColor: color,
                    // Sit just inside the amber bar so the profile identity is
                    // discoverable without crowding the urgency signal.
                    left: `${(borderWidth + 2) / 16}rem`,
                    width: '0.125rem'
                  }}
                />
              )}
              <SidebarSessionRow
                isPinned={false}
                isPriority={true}
                isSelected={session.id === activeSessionId}
                isSunset={false}
                isWorking={workingSessionIdSet.has(session.id)}
                onArchive={() => onArchiveSession(session.id)}
                onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
                onDelete={() => onDeleteSession(session.id)}
                onPin={() => onTogglePin(session.id)}
                onPriority={() => onTogglePriority(session.id)}
                onResume={() => onResumeSession(session.id)}
                session={session}
                style={color ? { paddingLeft: '0.625rem' } : undefined}
              />
            </div>
          )
        })}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}