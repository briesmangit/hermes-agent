import { useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

interface SunsetSectionProps {
  sessions: SessionInfo[]
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
 */
export function SunsetSection({
  sessions,
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

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => (b.last_active || 0) - (a.last_active || 0)),
    [sessions]
  )

  if (sessions.length === 0) {
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
          <SidebarCount>{sessions.length}</SidebarCount>
          <DisclosureCaret className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100" open={open} />
        </button>
      </div>
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {sorted.map(session => (
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
