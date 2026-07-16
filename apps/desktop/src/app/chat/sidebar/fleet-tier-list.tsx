import type { useSensors } from '@dnd-kit/core'
import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import type { HermesGitWorktree } from '@/global'
import type { SessionInfo } from '@/hermes'
import { cn } from '@/lib/utils'

import { AttentionSection } from './attention-section'
import { CompletedSection } from './completed-section'
import { SidebarLoadMoreRow } from './load-more-row'
import {
  ProjectBackRow,
  ProjectMenu,
  type SidebarProjectTree,
  type SidebarSessionGroup,
  StartWorkButton
} from './projects'
import { SidebarPinnedEmptyState, SidebarSessionSkeletons } from './section-states'
import { SidebarSessionsSection } from './sessions-section'
import { SunsetSection } from './sunset-section'
import { WorkingSection } from './working-section'

// See index.tsx for the originals — these constants are duplicated here so
// fleet-tier-list owns the styling of its own tiers. S02–S05 will specialize
// them per-section.
const COMPACT_FLAT = 'compact:max-h-none compact:overflow-visible'

const SCROLL_Y = 'overflow-y-auto overflow-x-hidden overscroll-contain'

const GROUP_BODY = cn(SCROLL_Y, COMPACT_FLAT)

const HEADER_ACTION_BTN =
  'text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100'

const HEADER_NAV_BTN =
  'text-(--ui-text-tertiary) opacity-70 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground hover:opacity-100 focus-visible:opacity-100'

/** Translated i18n strings surfaced to FleetTierList (the subset it renders). */
interface FleetI18n {
  pinned: string
  projectEmpty: string
  allPinned: string
  noSessions: string
  loading: string
  showProjects: string
  showSessions: string
  projects: {
    newButton: string
    back: string
  }
  nav: Record<string, string>
}

export interface FleetTierListProps {
  // ── Session callbacks (from ChatSidebarProps) ──
  onResumeSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onBranchSession: (sessionId: string) => void
  onNewSessionInWorkspace: (path: null | string) => void

  // ── Store actions ──
  pinSession: (sessionId: string) => void
  unpinSession: (sessionId: string) => void
  toggleSunsetFor: (sessionId: string) => void
  setSidebarPinsOpen: (open: boolean) => void
  setSidebarRecentsOpen: (open: boolean) => void
  setSidebarAgentsGrouped: (grouped: boolean) => void
  exitProjectScope: () => void
  openProjectCreate: () => void

  // ── Session/section state ──
  activeSidebarSessionId: string | null
  showAllProfiles: boolean
  profileScope: string
  pinsOpen: boolean
  agentsOpen: boolean
  agentsGrouped: boolean
  pinnedSessions: SessionInfo[]
  workingSessionIdSet: Set<string>
  sunsetIdSet: Set<string>
  sessions: SessionInfo[]
  // INV-5: cross-profile union — feeds the Attention tier. Never pass the
  // scope-filtered `$sessions` here; attention must surface from any profile.
  allProfileSessions: SessionInfo[]
  // Ids flagged `state.needsInput === true` by the gateway — feeds the
  // Attention tier's cross-profile filter.
  attentionSessionIds: string[]
  activeProjectId: string | null
  inProject: boolean
  dndSensors: ReturnType<typeof useSensors>
  recentsVirtualizes: boolean
  showSessionSkeletons: boolean
  hasMoreSessions: boolean
  sessionsLoading: boolean
  recentsLoadMorePending: boolean
  displayAgentGroups: SidebarSessionGroup[] | undefined
  displayAgentSessions: SessionInfo[]
  agentSessions: SessionInfo[]
  enteredProject: SidebarProjectTree | undefined
  enteredProjectContent: SidebarProjectTree | undefined
  scopedRepoWorktrees: Record<string, HermesGitWorktree[]> | undefined
  removedSessionIds: ReadonlySet<string> | undefined
  sessionsLabel: string
  worktreeGroupingActive: boolean
  reposScanning: boolean
  projectsSkeletonVisible: boolean
  recentsMeta: React.ReactNode
  sessionNumbers: Map<string, number> | undefined
  projectOverview: SidebarProjectTree[] | undefined
  overviewPreviews: Record<string, SessionInfo[]> | undefined
  projectTreeLoading: boolean

  // ── Reorder handlers ──
  reorderPinned: (ids: string[]) => void
  reorderProjects: (ids: string[]) => void
  reorderSessions: (ids: string[]) => void

  // ── Project handlers ──
  onEnterProject: (id: string) => void
  onLoadMoreRecents: () => Promise<void>

  // ── i18n (subset) ──
  s: FleetI18n
}

/**
 * Fleet Tier List — the single render entry point for the 7 sidebar sections
 * (Working / Other-Agents / Session-#'s / Completed / Sunset / Pinned / Recents).
 *
 * This is a pure structural refactor: the JSX is moved verbatim from index.tsx
 * so S02–S05 can specialize each tier in place without touching the parent.
 */
export function FleetTierList({
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onBranchSession,
  onNewSessionInWorkspace,
  pinSession,
  unpinSession,
  toggleSunsetFor,
  setSidebarPinsOpen,
  setSidebarRecentsOpen,
  setSidebarAgentsGrouped,
  exitProjectScope,
  openProjectCreate,
  activeSidebarSessionId,
  showAllProfiles,
  profileScope,
  pinsOpen,
  agentsOpen,
  agentsGrouped,
  pinnedSessions,
  workingSessionIdSet,
  sunsetIdSet,
  sessions,
  allProfileSessions,
  attentionSessionIds,
  activeProjectId,
  inProject,
  dndSensors,
  recentsVirtualizes,
  showSessionSkeletons,
  hasMoreSessions,
  sessionsLoading,
  recentsLoadMorePending,
  displayAgentGroups,
  displayAgentSessions,
  agentSessions,
  enteredProject,
  enteredProjectContent,
  scopedRepoWorktrees,
  removedSessionIds,
  sessionsLabel,
  worktreeGroupingActive,
  reposScanning,
  projectsSkeletonVisible,
  recentsMeta,
  sessionNumbers,
  projectOverview,
  overviewPreviews,
  projectTreeLoading,
  reorderPinned,
  reorderProjects,
  reorderSessions,
  onEnterProject,
  onLoadMoreRecents,
  s
}: FleetTierListProps) {
  return (
    <div className="fleet-tier-list">
      <AttentionSection
        activeSessionId={activeSidebarSessionId}
        allProfileSessions={allProfileSessions}
        attentionSessionIds={attentionSessionIds}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onResumeSession={onResumeSession}
        onTogglePin={pinSession}
        workingSessionIdSet={workingSessionIdSet}
      />

      <WorkingSection
        activeSessionId={activeSidebarSessionId}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onResumeSession={onResumeSession}
        onTogglePin={pinSession}
        profileScope={profileScope}
        showAllProfiles={showAllProfiles}
      />

      <CompletedSection
        activeSessionId={activeSidebarSessionId}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onResumeSession={onResumeSession}
        onTogglePin={pinSession}
      />

      <SunsetSection
        activeSessionId={activeSidebarSessionId}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onResumeSession={onResumeSession}
        onTogglePin={pinSession}
        onToggleSunset={toggleSunsetFor}
      />

      <SidebarSessionsSection
        activeSessionId={activeSidebarSessionId}
        contentClassName={cn('flex max-h-44 flex-col gap-px rounded-lg pb-2 pt-1', GROUP_BODY)}
        dndSensors={dndSensors}
        emptyState={<SidebarPinnedEmptyState />}
        label={s.pinned}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onReorderSessions={reorderPinned}
        onResumeSession={onResumeSession}
        onToggle={() => setSidebarPinsOpen(!pinsOpen)}
        onTogglePin={unpinSession}
        open={pinsOpen}
        pinned
        rootClassName="shrink-0 p-0 pb-1"
        sessions={pinnedSessions}
        sortable={pinnedSessions.length > 1}
        workingSessionIdSet={workingSessionIdSet}
      />

      <SidebarSessionsSection
        activeProjectId={activeProjectId}
        activeSessionId={activeSidebarSessionId}
        collapsible={!inProject}
        contentClassName={cn(
          'flex min-h-0 flex-1 flex-col pb-1.75',
          SCROLL_Y,
          // Separate profile sections clearly in the ALL view; rows inside
          // each group keep their own tight gap-px rhythm.
          showAllProfiles ? 'gap-3' : 'gap-px',
          // Flatten into the single scroll when compact — unless this is the
          // virtualized long list, which must keep its own scroller.
          !recentsVirtualizes && COMPACT_FLAT
        )}
        dndSensors={dndSensors}
        emptyState={
          showSessionSkeletons ? (
            <SidebarSessionSkeletons />
          ) : (
            <div className="grid min-h-16 place-items-center rounded-lg px-2 text-center text-xs text-(--ui-text-tertiary)">
              {inProject ? s.projectEmpty : pinnedSessions.length > 0 ? s.allPinned : s.noSessions}
            </div>
          )
        }
        footer={
          // Hide "load more" only when workspace-grouped (those groups page
          // themselves). ALL-profiles now pages per-profile from each profile
          // header; the global footer only applies to non-ALL views.
          !showAllProfiles && !agentsGrouped && !showSessionSkeletons && hasMoreSessions ? (
            <SidebarLoadMoreRow
              loading={sessionsLoading || recentsLoadMorePending}
              onClick={() => void onLoadMoreRecents()}
              // Recents are post-filtered to non-project sessions, so a
              // backend page size (50) is not a truthful "rows you'll
              // see" count. Use the generic label instead of a fake N.
              step={0}
            />
          ) : null
        }
        forceEmptyState={showSessionSkeletons}
        groups={displayAgentGroups}
        headerAction={
          inProject && enteredProject ? (
            <div className="group/workspace flex shrink-0 items-center gap-0.5">
              {enteredProject.path && (
                <StartWorkButton onStarted={onNewSessionInWorkspace} repoPath={enteredProject.path} />
              )}
              <ProjectMenu
                isActive={enteredProject.id === activeProjectId}
                onExitScope={exitProjectScope}
                project={enteredProject}
                scoped
              />
              <div className="grid size-6 place-items-center">
                <Button
                  aria-label={s.showProjects}
                  className={HEADER_NAV_BTN}
                  onClick={event => {
                    event.stopPropagation()
                    exitProjectScope()
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Codicon name="list-unordered" size="0.75rem" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-0.5">
              {!showAllProfiles ? (
                <Button
                  aria-label={agentsGrouped ? s.projects.newButton : s.nav['new-session']}
                  className={HEADER_ACTION_BTN}
                  onClick={event => {
                    event.stopPropagation()

                    if (agentsGrouped) {
                      openProjectCreate()
                    } else {
                      onNewSessionInWorkspace(null)
                    }
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Codicon name="add" size="0.75rem" />
                </Button>
              ) : null}
              <div className="grid size-6 place-items-center">
                {!showAllProfiles && agentSessions.length > 0 ? (
                  <Button
                    aria-label={agentsGrouped ? s.showSessions : s.showProjects}
                    className={cn(
                      HEADER_NAV_BTN,
                      agentsGrouped && 'bg-(--ui-control-active-background) text-foreground opacity-100'
                    )}
                    onClick={event => {
                      event.stopPropagation()
                      setSidebarRecentsOpen(true)
                      setSidebarAgentsGrouped(!agentsGrouped)
                    }}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Codicon name={agentsGrouped ? 'list-unordered' : 'root-folder'} size="0.75rem" />
                  </Button>
                ) : null}
              </div>
            </div>
          )
        }
        label={sessionsLabel}
        labelMeta={
          worktreeGroupingActive ? (
            reposScanning && !projectsSkeletonVisible ? (
              <GlyphSpinner ariaLabel={s.loading} className="text-[0.6875rem] text-(--ui-text-quaternary)" />
            ) : undefined
          ) : (
            recentsMeta
          )
        }
        liveSessions={inProject ? agentSessions : undefined}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onEnterProject={onEnterProject}
        onNewSessionInWorkspace={showAllProfiles ? undefined : onNewSessionInWorkspace}
        onReorderProjects={showAllProfiles ? undefined : reorderProjects}
        onReorderSessions={showAllProfiles ? undefined : reorderSessions}
        onResumeSession={onResumeSession}
        onToggle={() => setSidebarRecentsOpen(!agentsOpen)}
        onTogglePin={pinSession}
        onToggleSunset={toggleSunsetFor}
        open={agentsOpen}
        pinned={false}
        projectBackRow={
          inProject ? <ProjectBackRow label={s.projects.back} onClick={exitProjectScope} /> : undefined
        }
        projectContent={inProject ? enteredProjectContent : undefined}
        projectOverview={projectOverview}
        projectOverviewPreviews={overviewPreviews}
        projectRepoWorktrees={inProject ? scopedRepoWorktrees : undefined}
        projectsLoading={worktreeGroupingActive ? projectTreeLoading : false}
        removedSessionIds={inProject ? removedSessionIds : undefined}
        rootClassName={cn(
          'min-h-32 flex-1 overflow-hidden p-0',
          !recentsVirtualizes && 'compact:min-h-0 compact:flex-none compact:overflow-visible'
        )}
        sessionNumbers={sessionNumbers}
        sessions={displayAgentSessions}
        sortable={!showAllProfiles && agentSessions.length > 1}
        sunsetIdSet={sunsetIdSet}
        workingSessionIdSet={workingSessionIdSet}
      />
    </div>
  )
}
