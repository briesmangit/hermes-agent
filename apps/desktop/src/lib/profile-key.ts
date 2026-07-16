// Canonical key for a profile: trimmed, empty → "default". Used everywhere we
// compare a session's owning profile against the live gateway's profile.
//
// Lives in `src/lib` (a dependency-free pure helper) so both `store/profile.ts`
// and `store/layout.ts` can use it without importing each other — importing it
// from `store/profile` created a circular dependency (layout ⇄ profile) that
// crashed the renderer at boot when layout evaluated first and profile's
// module-load `$profileScope.subscribe` fired before layout's atoms existed.
export function normalizeProfileKey(name: string | null | undefined): string {
  const value = (name ?? '').trim()

  return value || 'default'
}
