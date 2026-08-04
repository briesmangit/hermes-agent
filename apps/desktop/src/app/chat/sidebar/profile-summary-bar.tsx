import { useCallback, useMemo } from 'react'
import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { profileColorSoft, resolveProfileColor } from '@/lib/profile-color'
import { cn } from '@/lib/utils'
import { normalizeProfileKey } from '@/store/profile'

interface ProfileSummaryBarProps {
  profiles: { name: string; is_default: boolean }[]
  sessions: { id: string; profile?: string | null | undefined }[]
  workingIds: Set<string>
  attentionIds: Set<string>
  activeScope: string
  onProfileClick: (name: string) => void
}

interface ProfileSummaryItem {
  name: string
  color: string
  workingCount: number
  attentionCount: number
  totalActive: number
  isActiveScope: boolean
  isDefault: boolean
}

/**
 * ProfileSummaryBar - Compact row of colored dots at TOP of sidebar (above all sections)
 * Shows one dot per profile with working+attention count badges.
 * Brighter for active profiles, dimmed for idle. Click to switch profile scope.
 * Only visible when there are multiple profiles with sessions.
 * Compact: single row, ~24px tall.
 */
export function ProfileSummaryBar({
  profiles,
  sessions,
  workingIds,
  attentionIds,
  activeScope,
  onProfileClick,
}: ProfileSummaryBarProps) {
  const { t } = useI18n()

  const summaryItems = useMemo<ProfileSummaryItem[]>(() => {
    const items: ProfileSummaryItem[] = []

    for (const profile of profiles) {
      const key = normalizeProfileKey(profile.name)
      const color = resolveProfileColor(profile.name, {})

      if (color) {
        // Count working sessions for this profile
        const workingSessionsForProfile = sessions.filter(
          s => normalizeProfileKey(s.profile) === key && workingIds.has(s.id)
        ).length

        // Count attention (needs-input) sessions for this profile
        const attentionSessionsForProfile = sessions.filter(
          s => normalizeProfileKey(s.profile) === key && attentionIds.has(s.id)
        ).length

        const totalActive = workingSessionsForProfile + attentionSessionsForProfile
        const isActiveScope = activeScope === key
        const isDefault = profile.is_default

        items.push({
          name: profile.name,
          color,
          workingCount: workingSessionsForProfile,
          attentionCount: attentionSessionsForProfile,
          totalActive,
          isActiveScope,
          isDefault,
        })
      }
    }

    return items
  }, [profiles, sessions, workingIds, attentionIds, activeScope])

  const handleProfileClick = useCallback(
    (profileName: string) => {
      onProfileClick(profileName)
    },
    [onProfileClick]
  )

  // Always show when more than one profile exists — the bar IS the bird's-eye
  // fleet overview, and hiding it when "only 1 profile is alive" defeats its
  // purpose: the quiet state ("only delta is working right now") is exactly
  // when you want to see the 0/0 badges on the idle profiles. Dots with 0
  // working + 0 attention are still informative (silence is signal).
  if (profiles.length <= 1) {
    return null
  }

  return (
    <TooltipProvider>
      <div
        aria-label={t.sidebar?.profileSummaryBar ?? 'Profile activity summary'}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1.5 border-b border-(--ui-border-subtle)',
          'h-6 shrink-0', // ~24px tall
          'bg-(--ui-sidebar-surface-background)'
        )}
        role="tablist"
      >
        {summaryItems.map((item) => (
          <Tooltip delayDuration={200} key={item.name}>
            <TooltipTrigger asChild>
              <Button
                aria-label={`${item.name}: ${item.workingCount} working, ${item.attentionCount} needs input`}
                aria-pressed={item.isActiveScope}
                className={cn(
                  'relative h-5 w-5 min-w-0 p-0 rounded-full transition-all duration-200',
                  // Size is ~20px (h-5 = 20px), compact row
                  item.totalActive > 0
                    ? 'opacity-100 shadow-[0_0_0_1px_rgba(0,0,0,0.1)]' // brighter, subtle ring for active
                    : 'opacity-50', // dimmed for idle
                  item.isActiveScope && 'ring-2 ring-(--ui-ring) ring-offset-2 ring-offset-(--ui-sidebar-surface-background)',
                  item.isDefault && 'border border-(--ui-border)'
                )}
                onClick={() => handleProfileClick(item.name)}
                role="tab"
                size="icon-xs"
                style={{
                  backgroundColor: item.totalActive > 0 ? item.color : profileColorSoft(item.color, 22),
                } as React.CSSProperties}
                type="button"
                variant="ghost"
              >
                {/* Badge: working + attention count */}
                {item.totalActive > 0 && (
                  <span
                    aria-label={`${item.workingCount} working, ${item.attentionCount} needs input`}
                    className={cn(
                      'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full',
                      'text-[0.5rem] font-semibold leading-none',
                      'bg-(--ui-badge-background) text-(--ui-badge-foreground)',
                      'border border-(--ui-sidebar-surface-background)',
                      'shadow-sm'
                    )}
                  >
                    {item.totalActive > 9 ? '9+' : item.totalActive}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent align="start" className="max-w-xs p-2" side="bottom">
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium truncate">{item.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[0.625rem] text-(--ui-text-tertiary)">
                <span className="flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--ui-accent)" />
                  <span>{t.sidebar?.working ?? 'Working'}: {item.workingCount}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--ui-destructive)" />
                  <span>{t.sidebar?.needsInput ?? 'Needs input'}: {item.attentionCount}</span>
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}