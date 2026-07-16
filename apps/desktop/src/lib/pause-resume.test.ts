import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Desktop has no vitest environment configured (tests run under node), so
// window.localStorage is absent. storage.ts swallows that gracefully at
// runtime, but these tests seed/clear the key directly — provide a tiny shim.
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
// @ts-expect-error - polyfill window.localStorage for the node test env
globalThis.localStorage = memory
// @ts-expect-error - storage.ts reads window.localStorage
globalThis.window = globalThis

import {
  buildPauseManifest,
  clearPauseManifest,
  type PauseManifest,
  readPauseManifest,
  writePauseManifest,
} from './pause-resume'

const SAMPLE: PauseManifest = {
  version: 1,
  pausedAt: '2026-07-15T00:00:00.000Z',
  profile: 'alpha',
  sessions: [
    { sessionId: 's1', profile: 'alpha', lastUserPrompt: 'build the thing' },
    { sessionId: 's2', profile: 'alpha', lastUserPrompt: 'test the thing' },
  ],
}

describe('pause-resume manifest', () => {
  beforeEach(() => clearPauseManifest())
  afterEach(() => clearPauseManifest())

  it('round-trips a manifest through localStorage', () => {
    writePauseManifest(SAMPLE)
    const read = readPauseManifest()

    expect(read).not.toBeNull()
    expect(read?.version).toBe(1)
    expect(read?.profile).toBe('alpha')
    expect(read?.sessions).toHaveLength(2)
    expect(read?.sessions[0]).toEqual({ sessionId: 's1', profile: 'alpha', lastUserPrompt: 'build the thing' })
  })

  it('returns null when no manifest is stored', () => {
    clearPauseManifest()
    expect(readPauseManifest()).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem('hermes.desktop.pauseManifest', '{not json')
    expect(readPauseManifest()).toBeNull()
  })

  it('treats a v1 manifest with a non-array sessions field as null (defensive)', () => {
    localStorage.setItem('hermes.desktop.pauseManifest', JSON.stringify({ version: 1, profile: 'alpha', sessions: 'nope' }))
    expect(readPauseManifest()).toBeNull()
  })

  it('clearing removes the key', () => {
    writePauseManifest(SAMPLE)
    clearPauseManifest()
    expect(readPauseManifest()).toBeNull()
  })

  it('writePauseManifest with zero sessions clears instead of writing', () => {
    writePauseManifest(SAMPLE)
    writePauseManifest({ ...SAMPLE, sessions: [] })
    expect(readPauseManifest()).toBeNull()
  })

  it('buildPauseManifest maps [sessionId, profile, prompt] tuples', () => {
    const manifest = buildPauseManifest(
      [
        ['s1', 'alpha', 'build the thing'],
        ['s2', 'alpha', 'test the thing'],
      ],
      'alpha',
    )

    expect(manifest.version).toBe(1)
    expect(manifest.profile).toBe('alpha')
    expect(manifest.sessions).toEqual([
      { sessionId: 's1', profile: 'alpha', lastUserPrompt: 'build the thing' },
      { sessionId: 's2', profile: 'alpha', lastUserPrompt: 'test the thing' },
    ])
    expect(manifest.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
