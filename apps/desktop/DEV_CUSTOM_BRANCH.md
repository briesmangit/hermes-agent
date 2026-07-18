# Custom Desktop Branch

Long-lived branch for Hermes Desktop UI customizations, kept rebased on upstream
`main` so upstream fixes flow in without merge noise.

## Branch

- **Name:** `briesman/custom-desktop`
- **Tracks:** `briesmangit/briesman/custom-desktop` (your fork)
- **Strategy:** rebase (never merge commits — keeps history linear)

```bash
# Sync with upstream main, then push the rebased custom branch to the fork.
git fetch upstream
git rebase upstream/main          # replay custom commits on top of upstream
git push --force-with-lease briesmangit briesman/custom-desktop
```

> Use `--force-with-lease` (not `--force`) so you never clobber a fork state you
> haven't seen.

## CI

`.github/workflows/desktop-custom.yml` runs on every push/PR to
`briesman/custom-desktop`:

- `pnpm typecheck` (tsc, both renderer + electron configs)
- `pnpm lint` (eslint)
- `pnpm build` (vite + electron main bundle)
- `pnpm test:ui` (vitest, jsdom)

All four must be green before a push is considered shippable.

## Surviving `hermes update`

`hermes update` refreshes the app from upstream and can touch the same files our
customizations edit. A **post-merge git hook** (`.git/hooks/post-merge`) runs
`apps/desktop/scripts/restore-customizations.sh` after every pull/rebase. The
script verifies the two survival criteria and re-checks-out the known-good
versions from the custom branch if they were clobbered:

- **AC1 — Flat mono chat background:** `--ui-chat-surface-background` is the flat
  `#1e1e1e` (dark) / `#fafafa` (light) value, not the themed chrome gradient.
- **AC2 — Profile-color left border:** every session row in
  `sidebar/session-row.tsx` carries the `borderLeft: 2px solid <profileColor>`
  style.

The hook is idempotent — if both criteria are already present it does nothing.

### Manual restore

```bash
bash apps/desktop/scripts/restore-customizations.sh
# then rebundle:
pnpm --filter hermes build
```

## Adding a new customization

1. Make the change on `briesman/custom-desktop`.
2. If it touches a file upstream also edits, add a verification + restore step to
   `restore-customizations.sh` so future updates don't wipe it.
3. Commit, push, confirm CI is green.
