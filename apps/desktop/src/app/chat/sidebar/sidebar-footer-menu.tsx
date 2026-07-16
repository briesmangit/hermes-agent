import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  $sidebarAgentsGrouped,
  $sidebarSunsetVisible,
  setSidebarAgentsGrouped,
  setSidebarSunsetVisible
} from '@/store/layout'
import { $sessionNumberingEnabled, resetSessionNumberingCounter, setSessionNumberingEnabled } from '@/store/session'

// Reset counter is a one-shot action; render it as its own non-toggle row (and
// only while numbering is on — there's no counter to reset when it's off).
function ResetCounterItem({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return null
  }

  return (
    <DropdownMenuCheckboxItem
      // Reused CheckboxItem primitive for visual rhythm. We lock `checked` false
      // and rely on `onSelect` to fire the action — Radix's check indicator only
      // paints when checked, so it reads as an action row rather than a toggle.
      checked={false}
      onCheckedChange={() => {
        // No-op. `onSelect` below handles the action; `checked` stays locked
        // false so the indicator never appears.
      }}
      onSelect={event => {
        event.preventDefault()
        resetSessionNumberingCounter()
      }}
    >
      <span className="flex items-center gap-1.5">
        <Codicon name="refresh" size="0.75rem" />
        Reset counter
      </span>
    </DropdownMenuCheckboxItem>
  )
}

// Gear-triggered popover at the sidebar foot (above ProfileRail). Houses the
// session-numbering On/Off+Reset (moved out of the inline tier stack to stop
// rendering always-visible noise), the existing grouped-view toggle, and the
// new sunset-section visibility toggle. S05 owns the cross-profile Sunset
// render gate; this slice just wires the visibility atom.
export function SidebarFooterMenu() {
  const numberingEnabled = useStore($sessionNumberingEnabled)
  const agentsGrouped = useStore($sidebarAgentsGrouped)
  const sunsetVisible = useStore($sidebarSunsetVisible)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Sidebar settings"
          className="text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="gear" size="0.875rem" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" sideOffset={6}>
        <DropdownMenuLabel className="text-[0.625rem] font-medium uppercase tracking-wide">
          Session Numbers
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={numberingEnabled}
          onCheckedChange={value => setSessionNumberingEnabled(Boolean(value))}
        >
          Show session #'s
        </DropdownMenuCheckboxItem>
        <ResetCounterItem enabled={numberingEnabled} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[0.625rem] font-medium uppercase tracking-wide">View</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={agentsGrouped}
          onCheckedChange={value => setSidebarAgentsGrouped(Boolean(value))}
        >
          Group by workspace
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sunsetVisible}
          onCheckedChange={value => setSidebarSunsetVisible(Boolean(value))}
        >
          Show sunset section
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
