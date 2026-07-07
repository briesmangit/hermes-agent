import type * as React from 'react'
import { useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { flattenSessionsWithBranches } from '@/lib/session-branch-tree'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface AttentionSectionProps {
  sessions: SessionInfo[]
  activeSessionId: string | null
  workingSessionIdSet: Set<string>
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onTogglePin: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
}

export function AttentionSection({
  sessions,
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
  const [open, setOpen] = useState(true)

  // Sort sessions by most recent activity (last_active descending)
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.last_active || 0) - (a.last_active || 0)),
    [sessions]
  )

  const displayEntries = useMemo(() => flattenSessionsWithBranches(sortedSessions), [sortedSessions])

  if (sessions.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <SidebarSectionHeader
        collapsible={true}
        label={s.attention}
        meta={String(sessions.length)}
        onToggle={() => setOpen(!open)}
        open={open}
      />
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {displayEntries.map(({ branchStem, session }) => (
            <SidebarSessionRow
              branchStem={branchStem}
              isPinned={false}
              isSelected={session.id === activeSessionId}
              isWorking={workingSessionIdSet.has(session.id)}
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

interface SidebarSectionHeaderProps {
  label: string
  open: boolean
  onToggle: () => void
  meta?: React.ReactNode
  icon?: React.ReactNode
  collapsible?: boolean
}

function SidebarSectionHeader({
  label,
  open,
  onToggle,
  meta,
  icon,
  collapsible = true
}: SidebarSectionHeaderProps) {
  const labelBody = (
    <>
      {icon}
      <SidebarPanelLabel>{label}</SidebarPanelLabel>
      {meta && <SidebarCount>{meta}</SidebarCount>}
    </>
  )

  return (
    <div className="group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5">
      {collapsible ? (
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          {labelBody}
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      ) : (
        <div className="flex w-fit items-center gap-1 leading-none">{labelBody}</div>
      )}
    </div>
  )
}