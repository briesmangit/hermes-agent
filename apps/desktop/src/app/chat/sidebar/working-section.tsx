import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useMemo } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { profileColor } from '@/lib/profile-color'
import { cn } from '@/lib/utils'
import { $pinnedSessionIds } from '@/store/layout'
import { ALL_PROFILES, normalizeProfileKey } from '@/store/profile'
import {
  $allProfileSessions,
  $workingSessionIds,
  $workingSessions
} from '@/store/session'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

export function WorkingSection({
  activeSessionId,
  showAllProfiles,
  profileScope,
  onResumeSession,
  onArchiveSession,
  onDeleteSession,
  onBranchSession,
  onTogglePin
}: {
  activeSessionId: string | null
  /** When true (ALL_PROFILES view) every profile's working sessions appear here,
   *  grouped by profile-color chip. When false (single-profile), only this
   *  profile's working sessions render. */
  showAllProfiles: boolean
  /** Current sidebar scope (profile key, or ALL_PROFILES). Drives the
   *  "Working · ALPHA" header label in single-profile mode. */
  profileScope?: string | null
  onResumeSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
  onTogglePin: (sessionId: string) => void
}) {
  const { t } = useI18n()
  const s = t.sidebar

  const workingSessions = useStore($workingSessions)
  const allProfileSessions = useStore($allProfileSessions)
  const workingIds = useStore($workingSessionIds)
  const pinnedIds = useStore($pinnedSessionIds)

  const workingSet = useMemo(() => new Set(workingIds), [workingIds])
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  // ALL_PROFILES mode: union of every profile's working sessions, grouped by
  // canonical profile key. The cross-profile mirror ($allProfileSessions) carries
  // every agent's live state, so this title survives a profile-switch that
  // otherwise wipes the scoped $sessions stream.
  const groupedByProfile = useMemo<Array<{ key: string; label: string; sessions: SessionInfo[] }>>(() => {
    if (!showAllProfiles) {
      return []
    }

    const byKey = new Map<string, { key: string; label: string; sessions: SessionInfo[] }>()

    for (const session of allProfileSessions) {
      if (!workingSet.has(session.id)) {
        continue
      }

      const key = normalizeProfileKey(session.profile)

      const bucket = byKey.get(key) ?? {
        key,
        label: key,
        sessions: []
      }

      bucket.sessions.push(session)
      byKey.set(key, bucket)
    }

    return [...byKey.values()]
      .map(bucket => ({
        ...bucket,
        // Newest activity first within a profile group.
        sessions: [...bucket.sessions].sort(
          (a, b) => (b.last_active || 0) - (a.last_active || 0)
        )
      }))
      // default (root) floats to the top; the rest alpha.
      .sort((a, b) =>
        a.key === 'default' ? -1 : b.key === 'default' ? 1 : a.label.localeCompare(b.label)
      )
  }, [showAllProfiles, allProfileSessions, workingSet])

  const totalCount = showAllProfiles
    ? groupedByProfile.reduce((sum, group) => sum + group.sessions.length, 0)
    : workingSessions.length

  // Header label:
  //   single-profile (non-ALL_PROFILES scope) → uppercase profile key, e.g. "ALPHA"
  //   ALL_PROFILES                             → plain "Working" (i18n)
  const labelText =
    !showAllProfiles && profileScope && profileScope !== ALL_PROFILES
      ? profileScope.toUpperCase()
      : s.working

  // The section is hidden when nothing is currently working. Always expanded
  // while visible (the working set is small and time-critical; collapsing it
  // would bury live status).
  const open = true

  if (totalCount === 0) {
    return null
  }

  const renderRow = (session: SessionInfo, isPinnedRow: boolean) => {
    const pinId = session._lineage_root_id ?? session.id
    const isWorking = workingSet.has(session.id)
    const color = profileColor(session.profile)
    // INV-9: profile-color left border (4px when working, 3px when idle).
    const borderWidth = isWorking ? 4 : 3

    return (
      <div className="relative" key={session.id}>
        {color && (
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 rounded-full"
            style={{ backgroundColor: color, width: `${borderWidth / 16}rem` }}
          />
        )}
        <SidebarSessionRow
          isPinned={isPinnedRow}
          isSelected={session.id === activeSessionId}
          isSunset={false}
          isWorking={isWorking}
          onArchive={() => onArchiveSession(session.id)}
          onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
          onDelete={() => onDeleteSession(session.id)}
          onPin={() => onTogglePin(pinId)}
          onResume={() => onResumeSession(session.id)}
          session={session}
          style={color ? { paddingLeft: '0.5rem' } : undefined}
        />
      </div>
    )
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={() => undefined}
          type="button"
        >
          <SidebarPanelLabel>{labelText}</SidebarPanelLabel>
          <SidebarCount>{totalCount}</SidebarCount>
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      </div>
      {showAllProfiles ? (
        // ALL_PROFILES: render one sub-group per profile, each with its own
        // compact profile-color chip header and border-painted rows.
        <SidebarGroupContent
          className={cn(
            'flex flex-col gap-3 pb-1.75 overflow-y-auto overscroll-contain'
          )}
        >
          {groupedByProfile.map(group => {
            const color = profileColor(group.key)

            return (
              <div className="flex flex-col gap-px" key={group.key}>
                <div className="flex items-center gap-1 px-1 pb-0.5 pt-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
                  {color && (
                    <span
                      aria-hidden
                      className="inline-block size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span>{group.label}</span>
                  <SidebarCount>{group.sessions.length}</SidebarCount>
                </div>
                {group.sessions.map(session =>
                  renderRow(session, pinnedSet.has(session._lineage_root_id ?? session.id))
                )}
              </div>
            )
          })}
        </SidebarGroupContent>
      ) : (
        <SidebarGroupContent
          className={cn(
            'flex flex-col gap-px pb-1.75 overflow-y-auto overscroll-contain'
          )}
        >
          {workingSessions.map(session =>
            renderRow(session, pinnedSet.has(session._lineage_root_id ?? session.id))
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
