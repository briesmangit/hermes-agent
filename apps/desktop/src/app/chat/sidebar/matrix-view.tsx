import { useStore } from '@nanostores/react'
import { useMemo } from 'react'

import { profileColor } from '@/lib/profile-color'
import { cn } from '@/lib/utils'
import {
  $allProfileSessions,
  $attentionSessionIds,
  $completedSessionIds,
  $kanbanSessionIds,
  $prioritySessionIds,
  $workingSessionIds
} from '@/store/session'
import { $pinnedSessionIds } from '@/store/layout'
import { $profiles } from '@/store/profile'
import { $sidebarViewMode } from '@/store/layout'

// Q9: Matrix view — a profile × session-type heat grid. Each cell is the count
// of sessions of a given type for a given profile; the cell background heat
// encodes the count (more = hotter) so at a glance you see where fleet load
// concentrates. Hovering a cell reveals the exact breakdown.

type SessionType = 'working' | 'attention' | 'completed' | 'pinned' | 'priority' | 'kanban' | 'other'

const SESSION_TYPES: { id: SessionType; label: string }[] = [
  { id: 'working', label: 'Working' },
  { id: 'attention', label: 'Needs input' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'priority', label: 'Priority' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'completed', label: 'Completed' },
  { id: 'other', label: 'Other' }
]

// Heat scale: 0 → neutral, max → accent. Returns an hsl mix on the accent hue.
function heatColor(count: number, max: number): string {
  if (count === 0) {
    return 'transparent'
  }

  const t = max <= 1 ? 1 : (count - 1) / Math.max(1, max - 1)
  const intensity = 0.18 + t * 0.62

  return `color-mix(in srgb, var(--ui-accent) ${Math.round(intensity * 100)}%, transparent)`
}

export function MatrixView() {
  const sessions = useStore($allProfileSessions)
  const profiles = useStore($profiles)
  const workingIds = useStore($workingSessionIds)
  const attentionIds = useStore($attentionSessionIds)
  const completedIds = useStore($completedSessionIds)
  const pinnedIds = useStore($pinnedSessionIds)
  const priorityIds = useStore($prioritySessionIds)
  const kanbanIds = useStore($kanbanSessionIds)
  // Consume the mode atom so toggling back to 'tiered' unmounts this view.
  useStore($sidebarViewMode)

  const working = useMemo(() => new Set(workingIds), [workingIds])
  const attention = useMemo(() => new Set(attentionIds), [attentionIds])
  const completed = useMemo(() => new Set(completedIds), [completedIds])
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const priority = useMemo(() => new Set(priorityIds), [priorityIds])
  const kanban = useMemo(() => new Set(kanbanIds), [kanbanIds])

  // Classify each session into exactly one type (precedence: attention > working
  // > priority > pinned > kanban > completed > other).
  const { grid, profileRows, maxCount } = useMemo(() => {
    const byProfile = new Map<string, Record<SessionType, number>>()
    const ensure = (profile: string) => {
      if (!byProfile.has(profile)) {
        byProfile.set(profile, {
          working: 0,
          attention: 0,
          completed: 0,
          pinned: 0,
          priority: 0,
          kanban: 0,
          other: 0
        })
      }

      return byProfile.get(profile)!
    }

    let max = 0
    for (const s of sessions) {
      const profile = s.profile || 'default'
      const row = ensure(profile)
      let type: SessionType = 'other'

      if (attention.has(s.id)) {
        type = 'attention'
      } else if (working.has(s.id)) {
        type = 'working'
      } else if (priority.has(s.id)) {
        type = 'priority'
      } else if (pinned.has(s.id)) {
        type = 'pinned'
      } else if (kanban.has(s.id)) {
        type = 'kanban'
      } else if (completed.has(s.id)) {
        type = 'completed'
      }

      row[type] += 1
      if (row[type] > max) {
        max = row[type]
      }
    }

    // Stable row order: known profiles first (by their listed order), then any
    // extra profiles that appeared in the session set.
    const known = (profiles ?? []).map(p => p.name)
    const extras = [...byProfile.keys()].filter(p => !known.includes(p))
    const profileRows = [...known.filter(p => byProfile.has(p)), ...extras]

    return { grid: byProfile, profileRows, maxCount: max }
  }, [sessions, profiles, working, attention, completed, pinned, priority, kanban])

  if (profileRows.length === 0) {
    return (
      <div className="grid min-h-24 place-items-center px-2 text-center text-xs text-(--ui-text-tertiary)">
        No sessions to display.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-2.5 py-2" data-sidebar-section-gap>
      <div className="text-[0.625rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)">Matrix</div>
      <div
        className="grid gap-0.5 text-[0.6875rem]"
        style={{ gridTemplateColumns: `minmax(4rem, auto) repeat(${SESSION_TYPES.length}, minmax(2.25rem, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {SESSION_TYPES.map(t => (
          <div key={t.id} className="pb-1 text-center font-medium text-(--ui-text-tertiary)" title={t.label}>
            {t.label.split(' ')[0]}
          </div>
        ))}

        {/* Profile rows */}
        {profileRows.map(profile => {
          const row = grid.get(profile)!
          const profColor = profileColor(profile)

          return (
            <RowFragment key={profile}>
              <div className="flex items-center gap-1 pr-1 text-(--ui-text-secondary)" title={profile}>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: profColor ?? 'var(--ui-text-quaternary)' }}
                />
                <span className="truncate">{profile}</span>
              </div>
              {SESSION_TYPES.map(t => {
                const count = row[t.id]

                return (
                  <div
                    key={t.id}
                    className={cn(
                      'grid h-6 place-items-center rounded-[3px] tabular-nums',
                      count > 0 ? 'text-(--ui-text-primary)' : 'text-(--ui-text-quaternary)'
                    )}
                    style={{ backgroundColor: heatColor(count, maxCount) }}
                    title={`${profile} · ${t.label}: ${count}`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                )
              })}
            </RowFragment>
          )
        })}
      </div>
    </div>
  )
}

// Helper that renders its children as consecutive grid cells without a wrapping
// element (so the parent grid's column flow is preserved).
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
