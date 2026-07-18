import { useStore } from '@nanostores/react'
import { useMemo } from 'react'
import type * as React from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $completedTtlSetting } from '@/store/layout'
import { $allProfileSessions, $completedSessionIds, $completedTick, $sessions, completedSecondsRemaining } from '@/store/session'

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
  const allProfileSessions = useStore($allProfileSessions)

  // Prefer the active-scope $sessions (accurate countdowns via completedSessionExpiry);
  // fall back to the cross-profile mirror so other profiles' completed sessions
  // are visible even when their session objects aren't in the scoped list.
  const sessionById = useMemo(() => {
    const map = new Map<string, SessionInfo>()

    for (const s of allSessions) {map.set(s.id, s)}

    for (const s of allProfileSessions) {
      if (!map.has(s.id)) {map.set(s.id, s)}
    }

    return map
  }, [allSessions, allProfileSessions])

  const completedSessions = completedSessionIds
    .map(id => sessionById.get(id))
    .filter((s): s is SessionInfo => Boolean(s))

  const completedCount = completedSessions.length

  // Subscribe to the TTL setting so sticky-mode is reactive. When 0 (sticky),
  // rows auto-prune is suppressed — they leave only on user action (X/clear).
  const completedTtlMs = useStore($completedTtlSetting)
  const stickyMode = $completedTtlSetting.get() === 0

  // Subscribe to shared completed tick atom (S07 clock consolidation) for countdown re-render.
  useStore($completedTick)

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
                footerBar={
                  stickyMode ? (
                    // Sticky: rows persist until user clears them. Show a steady
                    // amber bar so it reads as "held / doesn't expire".
                    <span
                      aria-label={s.completedTtlSticky}
                      className="block h-full w-full rounded-full bg-amber-500/70"
                      title={s.completedTtlSticky}
                    />
                  ) : remainingSec > 0 ? (
                    (() => {
                      const totalMs = $completedTtlSetting.get() || 1
                      const frac = Math.max(0, Math.min(1, remainingSec * 1000 / totalMs))
                      // Green (fresh, full window) → red (about to prune).
                      const hue = Math.round(18 + (145 - 18) * frac)

                      return (
                        <span
                          aria-label={`${formatCountdown(remainingSec)} until auto-archive`}
                          className="block h-full w-full rounded-full bg-(--ui-border-subtle)"
                          title={`${formatCountdown(remainingSec)} until auto-archive`}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.round(frac * 100)}%`, backgroundColor: `hsl(${hue} 70% 52%)` }}
                          />
                        </span>
                      )
                    })()
                  ) : null
                }
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
              </SidebarSessionRow>
            )
          })}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}