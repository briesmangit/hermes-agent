import { useMemo } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { profileColor } from '@/lib/profile-color'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface AttentionSectionProps {
  /**
   * Cross-profile union of every profile's live session mirror. This is the
   * source of truth for attention scanning — never pass the scope-filtered
   * `$sessions` here, or a crave for input from profile B becomes invisible
   * while the operator is scoped to profile A (INV-5).
   */
  allProfileSessions: SessionInfo[]
  /** Ids flagged `state.needsInput === true` by the gateway. */
  attentionSessionIds: string[]
  activeSessionId: string | null
  workingSessionIdSet: Set<string>
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

/**
 * AttentionSection — top tier of the Fleet Tier List.
 *
 * Surfaces every session currently flagged by the gateway as awaiting user
 * input (i.e. `state.needsInput === true`). Invariant INV-5: this tier is
 * always cross-profile — `allProfileSessions` is the union of every
 * profile's live mirror, so a need in profile B is visible while the
 * operator is scoped to profile A.
 *
 * Invariant INV-6: the row carries a steady 3px red left-border (no pulse /
 * ping animation). The header is always expanded while non-empty.
 */
export function AttentionSection({
  allProfileSessions,
  attentionSessionIds,
  activeSessionId,
  workingSessionIdSet,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePin,
  onBranchSession
}: AttentionSectionProps) {
  const { t } = useI18n()
  const s = t.sidebar

  const attentionSet = useMemo(() => new Set(attentionSessionIds), [attentionSessionIds])

  // Cross-profile filter + sort by `last_active` desc (newest first).
  const sessions = useMemo(() => {
    if (attentionSet.size === 0) {
      return []
    }
    const next: SessionInfo[] = []
    for (const session of allProfileSessions) {
      if (attentionSet.has(session.id)) {
        next.push(session)
      }
    }
    next.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
    return next
  }, [allProfileSessions, attentionSet])

  // Render nothing when there is nothing to attend to.
  if (sessions.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="attention-section shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <div className="flex w-fit items-center gap-1 leading-none">
          <SidebarPanelLabel>{s.needsInput}</SidebarPanelLabel>
          <SidebarCount>{sessions.length}</SidebarCount>
        </div>
      </div>
      <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
        {sessions.map(session => {
          const isWorking = workingSessionIdSet.has(session.id)
          const color = profileColor(session.profile)
          // INV-6: 3px steady red left-border. Bump to 4px only when the
          // session is also in the working set (very rare — the gateway
          // typically picks one signal at a time).
          const borderWidth = isWorking ? 4 : 3
          return (
            <div className="relative" key={session.id}>
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 bg-red-500"
                style={{ width: `${borderWidth / 16}rem` }}
              />
              {color && (
                <span
                  aria-hidden
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{
                    backgroundColor: color,
                    // Sit just inside the red bar so the profile identity is
                    // discoverable without crowding the urgency signal.
                    left: `${(borderWidth + 2) / 16}rem`,
                    width: '0.125rem'
                  }}
                />
              )}
              <SidebarSessionRow
                isPinned={false}
                isSelected={session.id === activeSessionId}
                isSunset={false}
                isWorking={isWorking}
                onArchive={() => onArchiveSession(session.id)}
                onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
                onDelete={() => onDeleteSession(session.id)}
                onPin={() => onTogglePin(session.id)}
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
