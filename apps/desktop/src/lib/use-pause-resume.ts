// Pause/Resume orchestration. Centralised so the statusbar buttons (S2/S3) and
// the boot-time hydrate (S3) share one implementation.
//
// Pause:  for each working session, interrupt the in-flight turn (the same
//         `session.interrupt` RPC the desktop's own Stop/session-switch uses),
//         then capture the last user prompt and persist a manifest entry.
// Resume: for each manifest entry, re-dispatch the recorded prompt to a fresh
//         turn. The prompt re-send follows the desktop's established
//         submit -> resume -> submit(freshId) contract so a resolved/stale
//         session id (session.resume can return a different runtime id) never
//         misroutes the re-dispatch.
//
// `requestGateway` is the (<T>(method, params) => Promise<T>) requester the
// desktop passes around (see use-statusbar-items.tsx).

import { getSessionMessages } from '@/hermes'
import { chatMessageText, toChatMessages } from '@/lib/chat-messages'
import { buildPauseManifest, readPauseManifest } from '@/lib/pause-resume'
import { clearPauseState, setPauseManifest } from '@/store/pause-resume'
import { $activeGatewayProfile } from '@/store/profile'
import { $workingSessionIds } from '@/store/session'

type GatewayRequester = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

/** True when an RPC error means the session id no longer resolves. */
function isSessionNotFound(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')

  return /session[_ ]?not[_ ]?found|no such session|unknown session|SESSION_NOT_FOUND/i.test(message)
}

/**
 * Freeze every currently-working session.
 *
 * Returns the count of sessions successfully recorded. A session whose prompt
 * can't be fetched is still interrupted (so it won't burn tokens during the GUI
 * restart) and recorded with an empty prompt — Resume will simply skip it.
 */
export async function pauseAllSessions(requestGateway: GatewayRequester): Promise<number> {
  const workingIds = $workingSessionIds.get()

  if (workingIds.length === 0) {return 0}

  const activeProfile = $activeGatewayProfile.get()
  const recorded: Array<readonly [string, string, string]> = []

  await Promise.all(
    workingIds.map(async id => {
      // Interrupt the in-flight turn FIRST — the real foreground turn-abort the
      // desktop's own Stop/session-switch uses.
      try {
        await requestGateway('session.interrupt', { session_id: id })
      } catch {
        // Best-effort: even if the interrupt RPC fails, still record the
        // session so Resume can re-dispatch. The GUI restart will kill the
        // worker anyway.
      }

      // Capture the last user prompt so Resume can re-send it. Reuse the
      // desktop's own SessionMessage -> ChatMessage -> text pipeline so we
      // extract exactly what the UI would show.
      let prompt = ''

      try {
        const { messages } = await getSessionMessages(id, activeProfile)
        const chatMessages = toChatMessages(messages as never)

        for (let i = chatMessages.length - 1; i >= 0; i--) {
          const message = chatMessages[i]

          if (message.role !== 'user') {continue}

          const text = chatMessageText(message).trim()

          if (text) {prompt = text;

 break}
        }
      } catch {
        prompt = ''
      }

      recorded.push([id, activeProfile, prompt])
    }),
  )

  const manifest = buildPauseManifest(recorded, activeProfile)
  setPauseManifest(manifest)

  return manifest.sessions.length
}

/**
 * Re-dispatch one recorded prompt to a fresh turn, following the desktop's
 * submit -> resume -> submit(freshId) contract. `submit` performs the
 * `prompt.submit` RPC; `resume` performs `session.resume` and returns the
 * resolved runtime id. This mirrors use-prompt-actions' stale-id recovery.
 */
async function reDispatchOne(
  requestGateway: GatewayRequester,
  sessionId: string,
  profile: string,
  text: string,
  submit: (id: string, text: string) => Promise<void>,
): Promise<void> {
  try {
    await submit(sessionId, text)

    return
  } catch (err) {
    if (!isSessionNotFound(err)) {throw err}
  }

  // Stale/resolved id — resume to obtain the live runtime id, then re-submit.
  const resumed = await requestGateway<{ session_id?: string }>('session.resume', {
    session_id: sessionId,
    source: 'desktop',
  })

  const resolvedId = resumed?.session_id

  if (!resolvedId) {throw new Error(`session.resume returned no session_id for ${sessionId}`)}

  await submit(resolvedId, text)
}

/**
 * Revive every paused session by re-dispatching its recorded prompt.
 *
 * For each entry, re-dispatch via {@link reDispatchOne}. Clearing the manifest
 * only happens after every entry has been dispatched; partial failures stay
 * frozen so a later Resume retry can recover them.
 */
export async function resumeAllSessions(
  requestGateway: GatewayRequester,
  submitPrompt: (sessionId: string, profile: string, text: string) => Promise<void>,
): Promise<number> {
  const manifest = readPauseManifest()

  if (!manifest || manifest.sessions.length === 0) {return 0}

  let dispatched = 0

  for (const entry of manifest.sessions) {
    if (!entry.lastUserPrompt.trim()) {continue}

    try {
      // submitPrompt signatures against (id, profile, text); adapt to the
      // (id, text) shape reDispatchOne expects.
      await reDispatchOne(
        requestGateway,
        entry.sessionId,
        entry.profile,
        entry.lastUserPrompt,
        (id, text) => submitPrompt(id, entry.profile, text),
      )
      dispatched++
    } catch {
      // Leave the entry in the manifest so a later Resume retry can recover it.
    }
  }

  // Only clear when everything dispatched — partial failures stay frozen.
  if (dispatched === manifest.sessions.length) {
    clearPauseState()
  } else {
    // Re-sync the in-memory atom with whatever is still on disk so the UI
    // (frozen badges, Resume button) reflects the true remaining state.
    setPauseManifest(readPauseManifest())
  }

  return dispatched
}
