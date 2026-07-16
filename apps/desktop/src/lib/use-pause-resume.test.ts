import { afterEach, describe, expect, it, vi } from 'vitest'

// node test env has no window.localStorage — shim it so the store + manifest
// modules can be exercised (mirrors the manifest test's setup).
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): null | string {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}
const memory = new MemoryStorage()
// @ts-expect-error - polyfill for node env
globalThis.localStorage = memory
// @ts-expect-error - storage.ts reads window.localStorage
globalThis.window = globalThis

import { getSessionMessages } from '@/hermes'
import { writePauseManifest } from '@/lib/pause-resume'
import { $pausedManifest, clearPauseState } from '@/store/pause-resume'
import { $workingSessionIds } from '@/store/session'

import { pauseAllSessions, resumeAllSessions } from './use-pause-resume'

vi.mock('@/hermes', () => ({
  getSessionMessages: vi.fn(),
}))

// profile.ts registers a module-load .subscribe side effect (setApiRequestProfile)
// that calls into browser-only APIs — shim it so the hook test can import cleanly
// under the node test env.
vi.mock('@/store/profile', () => ({
  $activeGatewayProfile: { get: () => 'alpha' },
}))

const requestGateway = vi.fn()

describe('pauseAllSessions', () => {
  afterEach(() => {
    clearPauseState()
    $workingSessionIds.set([])
    vi.clearAllMocks()
  })

  it('interrupts every working session and writes a manifest with captured prompts', async () => {
    $workingSessionIds.set(['s1', 's2'])
    // toChatMessages reads message.content (string) -> a text part, which
    // chatMessageText then renders. Mirror that shape.
    vi.mocked(getSessionMessages as unknown as (...a: unknown[]) => Promise<unknown>).mockImplementation(
      async (...args: unknown[]) =>
        ({
          messages: [{ role: 'user', content: `prompt for ${args[0]}` }],
        }) as never,
    )

    const count = await pauseAllSessions(requestGateway)

    expect(count).toBe(2)
    expect(requestGateway).toHaveBeenCalledWith('session.interrupt', { session_id: 's1' })
    expect(requestGateway).toHaveBeenCalledWith('session.interrupt', { session_id: 's2' })
    const manifest = $pausedManifest.get()
    expect(manifest?.sessions).toHaveLength(2)
    expect(manifest?.sessions[0]).toMatchObject({ sessionId: 's1', lastUserPrompt: 'prompt for s1' })
  })

  it('returns 0 and writes nothing when no session is working', async () => {
    $workingSessionIds.set([])
    const count = await pauseAllSessions(requestGateway)
    expect(count).toBe(0)
    expect($pausedManifest.get()).toBeNull()
  })

  it('records the session even when the prompt fetch fails (turn still interrupted)', async () => {
    $workingSessionIds.set(['s1'])
    vi.mocked(getSessionMessages as unknown as (...a: unknown[]) => Promise<unknown>).mockRejectedValue(new Error('db down'))
    const count = await pauseAllSessions(requestGateway)
    expect(count).toBe(1)
    expect(requestGateway).toHaveBeenCalledWith('session.interrupt', { session_id: 's1' })
    expect($pausedManifest.get()?.sessions[0]?.lastUserPrompt).toBe('')
  })
})

describe('resumeAllSessions', () => {
  afterEach(() => {
    clearPauseState()
    vi.clearAllMocks()
  })

  it('re-dispatches each prompt via submit and clears the manifest on success', async () => {
    writePauseManifest({
      version: 1,
      pausedAt: '2026-07-15T00:00:00.000Z',
      profile: 'alpha',
      sessions: [{ sessionId: 's1', profile: 'alpha', lastUserPrompt: 'do the thing' }],
    })
    const submitPrompt = vi.fn().mockResolvedValue(undefined)

    const count = await resumeAllSessions(requestGateway, submitPrompt)

    expect(count).toBe(1)
    // Happy path: submit directly, no resume needed.
    expect(submitPrompt).toHaveBeenCalledWith('s1', 'alpha', 'do the thing')
    expect(requestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
    expect($pausedManifest.get()).toBeNull()
  })

  it('recovers a stale/resolved id via session.resume before re-submitting', async () => {
    writePauseManifest({
      version: 1,
      pausedAt: '2026-07-15T00:00:00.000Z',
      profile: 'alpha',
      sessions: [{ sessionId: 's1', profile: 'alpha', lastUserPrompt: 'do the thing' }],
    })

    // First submit throws session-not-found; resume returns a fresh id; second
    // submit (with the resolved id) succeeds.
    const submitPrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error('SESSION_NOT_FOUND: s1'))
      .mockResolvedValueOnce(undefined)

    requestGateway.mockImplementation(async (method: string) => {
      if (method === 'session.resume') {return { session_id: 's1-fresh' }}

      return undefined
    })

    const count = await resumeAllSessions(requestGateway, submitPrompt)

    expect(count).toBe(1)
    expect(requestGateway).toHaveBeenCalledWith('session.resume', { session_id: 's1', source: 'desktop' })
    expect(submitPrompt).toHaveBeenLastCalledWith('s1-fresh', 'alpha', 'do the thing')
  })

  it('keeps the manifest when a dispatch fails (partial recovery)', async () => {
    writePauseManifest({
      version: 1,
      pausedAt: '2026-07-15T00:00:00.000Z',
      profile: 'alpha',
      sessions: [
        { sessionId: 's1', profile: 'alpha', lastUserPrompt: 'ok' },
        { sessionId: 's2', profile: 'alpha', lastUserPrompt: 'boom' },
      ],
    })
    const submitPrompt = vi.fn().mockRejectedValue(new Error('nope'))
    const count = await resumeAllSessions(requestGateway, submitPrompt)
    expect(count).toBe(0)
    expect($pausedManifest.get()?.sessions).toHaveLength(2)
  })
})
