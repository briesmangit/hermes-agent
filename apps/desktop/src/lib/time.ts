// Canonical time/date formatting. Shared `Intl` instances (created once, not
// per-render) + relative-time helpers. Every surface that shows a timestamp or
// an age pulls from here so the rendered strings stay consistent app-wide.

export const SECOND = 1000
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

// ── Absolute date/time formatters ──────────────────────────────────────────
// `hh:mm` clock (thread today/yesterday lines).
export const fmtClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

// Compact "day + clock", no year/seconds (artifacts, thread fallback, cron runs).
export const fmtDayTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short'
})

// Medium date + short time (command center session detail).
export const fmtDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Date only, "5 Jun 2026" (starmap tooltip).
export const fmtDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// ── Relative time ──────────────────────────────────────────────────────────
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })

// Localized bidirectional "in 5 min" / "2 hr ago" — coarsest sensible unit so a
// daily job reads "in 14 hr", not "in 840 min".
export function relativeTime(targetMs: number, nowMs = Date.now()): string {
  const diff = targetMs - nowMs
  const abs = Math.abs(diff)
  const sign = diff < 0 ? -1 : 1

  if (abs < MINUTE) {
    return rtf.format(sign * Math.round(abs / SECOND), 'second')
  }

  if (abs < HOUR) {
    return rtf.format(sign * Math.round(abs / MINUTE), 'minute')
  }

  if (abs < DAY) {
    return rtf.format(sign * Math.round(abs / HOUR), 'hour')
  }

  return rtf.format(sign * Math.round(abs / DAY), 'day')
}

export type ElapsedUnit = 'day' | 'hour' | 'minute' | 'second'

// ── Sidebar age heat ────────────────────────────────────────────────────────
// Maps seconds-since-last-touch to a recency color so the user can see at a
// glance what's fresh vs stale WITHOUT reading a timestamp. Returns an hsl()
// string. The ramp is tuned to stay within the app's calm palette:
//   ≤15m  → green (fresh, recently opened/touched)
//   15m–1h → green→amber
//   1h–1d  → amber→red-orange
//   >1d    → muted red (stale — the usual "wrong session" trap)
// Hue 145 (green) → 18 (red), lightness held steady so text stays legible.
export function ageHeatColor(secondsSinceTouch: number): string {
  const s = Math.max(0, secondsSinceTouch)
  const GREEN = 145
  const RED = 18
  const STALE = 24 * 60 * 60
  const t = Math.min(1, s / STALE)
  const eased = t * t * (3 - 2 * t) // smoothstep
  const hue = GREEN + (RED - GREEN) * eased

  return `hsl(${hue.toFixed(0)} 70% 52%)`
}

export const AGE_FRESH_SEC = 15 * 60
export const AGE_STALE_SEC = 24 * 60 * 60

// Coarsest elapsed bucket for a (clamped-nonnegative) duration, floored. The
// caller owns rendering — compact "5m", "5m ago", etc. — so no format is baked
// in here.
export function coarseElapsed(deltaMs: number): { unit: ElapsedUnit; value: number } {
  const ms = Math.max(0, deltaMs)

  if (ms >= DAY) {
    return { unit: 'day', value: Math.floor(ms / DAY) }
  }

  if (ms >= HOUR) {
    return { unit: 'hour', value: Math.floor(ms / HOUR) }
  }

  if (ms >= MINUTE) {
    return { unit: 'minute', value: Math.floor(ms / MINUTE) }
  }

  return { unit: 'second', value: Math.floor(ms / SECOND) }
}
