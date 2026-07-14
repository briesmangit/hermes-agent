import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { profileColor } from '@/lib/profile-color'
import { $pinnedSessionIds } from '@/store/layout'
import { normalizeProfileKey } from '@/store/profile'
import { $allProfileSessions, $completedSessionIds, $workingSessionIds } from '@/store/session'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface AllActivitySectionProps {
  activeSessionId: string | null
  /** Profile currently scoped in the sidebar. Sessions owned by this profile are
   *  excluded so "Other Agents" shows only the OTHER profiles' live sessions
   *  (no overlap with "Working (this profile)"). Null when scoped to ALL_PROFILES. */
  currentProfile: string | null
  /** When true (ALL_PROFILES view) the section is suppressed — that view already
   *  shows every agent grouped by profile, so a separate overview is redundant. */
  hideInAllProfiles: boolean
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onToggleSunset: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

/**
 * Other Agents — every OTHER profile's live sessions (working / completed /
 * pinned), sourced from the cross-profile $allProfileSessions mirror. Excludes
 * the currently-scoped profile so it never overlaps with "Working (this
 * profile)". Hidden in ALL_PROFILES view (the unified grouped view covers it).
 * Each row carries a profile-color chip so you know which agent owns it.
 */
export function AllActivitySection({
  activeSessionId,
  currentProfile,
  hideInAllProfiles,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePin,
  onToggleSunset,
  onBranchSession
}: AllActivitySectionProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const [open, setOpen] = useState(true)

  const allSessions = useStore($allProfileSessions)
  const workingIds = useStore($workingSessionIds)
  const completedIds = useStore($completedSessionIds)
  const pinnedIds = useStore($pinnedSessionIds)

  const workingSet = useMemo(() => new Set(workingIds), [workingIds])
  const completedSet = useMemo(() => new Set(completedIds), [completedIds])
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  // Only surface sessions that are actually "active" in some sense: working,
  // recently completed, or pinned. Pure-idle recents would just duplicate the
  // main list, so they're excluded here. The current profile is filtered out
  // so this section reads strictly as "other agents".
  const overviewSessions = useMemo(() => {
    const seen = new Set<string>()
    const out: SessionInfo[] = []

    for (const session of allSessions) {
      if (currentProfile && normalizeProfileKey(session.profile) === normalizeProfileKey(currentProfile)) {
        continue
      }

      const id = session._lineage_root_id ?? session.id

      if (seen.has(id)) {
        continue
      }

      if (workingSet.has(session.id) || completedSet.has(session.id) || pinnedSet.has(id)) {
        seen.add(id)
        out.push(session)
      }
    }

    return out.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
  }, [allSessions, workingSet, completedSet, pinnedSet, currentProfile])

  if (hideInAllProfiles || overviewSessions.length === 0) {
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
          <SidebarPanelLabel>{s.otherAgents}</SidebarPanelLabel>
          <SidebarCount>{overviewSessions.length}</SidebarCount>
          <DisclosureCaret className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100" open={open} />
        </button>
      </div>
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {overviewSessions.map(session => {
            const pinId = session._lineage_root_id ?? session.id
            const color = profileColor(session.profile)
            const isWorking = workingSet.has(session.id)
            const isSunset = false

            return (
              <div className="relative" key={session.id}>
                {color && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                    style={{ backgroundColor: color }}
                  />
                )}
                <SidebarSessionRow
                  isPinned={pinnedSet.has(pinId)}
                  isSelected={session.id === activeSessionId}
                  isSunset={isSunset}
                  isWorking={isWorking}
                  onArchive={() => onArchiveSession(session.id)}
                  onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
                  onDelete={() => onDeleteSession(session.id)}
                  onPin={() => onTogglePin(pinId)}
                  onResume={() => onResumeSession(session.id)}
                  onToggleSunset={() => onToggleSunset(session.id)}
                  session={session}
                  style={color ? { paddingLeft: '0.5rem' } : undefined}
                />
              </div>
            )
          })}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
