import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import type * as React from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $completedSessionIds, $sessions, completedSecondsRemaining, pruneCompletedSessions } from '@/store/session'

import { SidebarCount } from './chrome'
import { SidebarSessionRow } from './session-row'

function formatCountdown(seconds: number): string {
  if (seconds <= 0) {
    return ''
  }
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CompletedSection({
  activeSessionId,
  onResumeSession,
  onArchiveSession,
  onDeleteSession,
  onBranchSession,
  onTogglePin,
}: {
  activeSessionId: string | null
  onResumeSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
  onTogglePin: (sessionId: string) => void
}) {
  const { t } = useI18n()
  const s = t.sidebar
  const completedSessionIds = useStore($completedSessionIds)
  const allSessions = useStore($sessions)
  const completedSessions = allSessions.filter(session => completedSessionIds.includes(session.id))
  const completedCount = completedSessions.length

  // Live countdown tick (1 s) — drives per-row "mm:ss" re-render.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (completedCount === 0) {
      return
    }
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [completedCount])

  // Prune expired completions once a second (cheap Map scan, only bumps atom when something expired).
  useEffect(() => {
    if (completedCount === 0) {
      return
    }
    const id = setInterval(() => {
      pruneCompletedSessions()
    }, 1000)
    return () => clearInterval(id)
  }, [completedCount])

  // Section is hidden when empty.
  if (completedCount === 0) {
    return null
  }

  // Header is not collapsible - always expanded
  const open = true

  const onToggle = () => {}

  const contentClassName = cn('flex flex-col gap-px pb-1.75 overflow-y-auto overscroll-contain')

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          <SidebarPanelLabel>{s.completed}</SidebarPanelLabel>
          <SidebarCount>{completedCount}</SidebarCount>
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      </div>
      {open && completedCount > 0 && (
        <SidebarGroupContent className={contentClassName}>
          {completedSessions.map(session => {
            const remainingSec = completedSecondsRemaining(session.id)
            return (
              <SidebarSessionRow
                isPinned={false}
                isSelected={session.id === activeSessionId}
                isWorking={false}
                key={session.id}
                onArchive={() => onArchiveSession(session.id)}
                onBranch={onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined}
                onDelete={() => onDeleteSession(session.id)}
                onPin={() => onTogglePin(session.id)}
                onResume={() => onResumeSession(session.id)}
                session={session}
              >
                {remainingSec > 0 && (
                  <span className="shrink-0 ml-1 text-[0.625rem] font-mono text-(--ui-text-tertiary) tabular-nums">
                    {formatCountdown(remainingSec)}
                  </span>
                )}
              </SidebarSessionRow>
            )
          })}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}