import { useStore } from '@nanostores/react'
import type * as React from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $workingSessions } from '@/store/session'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

export function WorkingSection({
  activeSessionId,
  hideInAllProfiles,
  onResumeSession,
  onArchiveSession,
  onDeleteSession,
  onBranchSession,
  onTogglePin,
}: {
  activeSessionId: string | null
  /** When true (ALL_PROFILES view) the section is suppressed — there is no
   *  single "this profile" to anchor it, and the All Activity tab covers all. */
  hideInAllProfiles: boolean
  onResumeSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
  onTogglePin: (sessionId: string) => void
}) {
  const { t } = useI18n()
  const s = t.sidebar
  const workingSessions = useStore($workingSessions)
  const workingCount = workingSessions.length

  // The section is hidden when no working sessions (handled by parent)
  // Header is not collapsible - always expanded when visible

  const open = true

  const onToggle = () => {} // no-op since always open

  const contentClassName = cn('flex flex-col gap-px pb-1.75 overflow-y-auto overscroll-contain')

  if (hideInAllProfiles || workingCount === 0) {
    return null
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          <SidebarPanelLabel>{s.working}</SidebarPanelLabel>
          <SidebarCount>{workingCount}</SidebarCount>
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      </div>
      {open && workingCount > 0 && (
        <SidebarGroupContent className={contentClassName}>
          {workingSessions.map(session => (
            <SidebarSessionRow
              isPinned={false}
              isSelected={session.id === activeSessionId}
              isWorking={true}
              key={session.id}
              onArchive={() => onArchiveSession(session.id)}
              onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
              onDelete={() => onDeleteSession(session.id)}
              onPin={() => onTogglePin(session.id)}
              onResume={() => onResumeSession(session.id)}
              session={session}
            />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}