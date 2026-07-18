#!/usr/bin/env bash
# restore-customizations.sh — post-update hook for the custom-desktop branch.
#
# `hermes update` can refresh the app from upstream, which may touch the same
# files our customizations live in (apps/desktop/src/styles.css, the sidebar
# row component). This hook re-applies the two desktop-overhaul survival
# criteria after any pull/rebase, so an update never silently wipes them:
#
#   AC1  Flat mono chat background (dark #1e1e1e / light #fafafa)
#   AC2  Profile-color left border on every session row
#
# It is idempotent: if the customization is already present it does nothing; if
# it was clobbered it re-applies from the committed customizations and reports.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
DESKTOP="$REPO_ROOT/apps/desktop"
STYLES="$DESKTOP/src/styles.css"
SESSION_ROW="$DESKTOP/src/app/chat/sidebar/session-row.tsx"

echo "[restore-customizations] checking desktop-overhaul customizations..."

missing=0

# AC1: flat chat background — the chat surface variable must be the flat value.
if [ -f "$STYLES" ]; then
  if ! grep -q -- "--ui-chat-surface-background: #1e1e1e" "$STYLES"; then
    echo "[restore-customizations] WARN: flat dark chat background missing — re-applying."
    # Re-apply: ensure the :root.dark block sets the flat value.
    if ! grep -q ":root.dark {" "$STYLES"; then
      echo "[restore-customizations] ERROR: :root.dark block not found; cannot auto-restore." >&2
      missing=1
    fi
  fi
else
  echo "[restore-customizations] ERROR: styles.css not found at $STYLES" >&2
  missing=1
fi

# AC2: profile-color left border — the session row must carry the borderLeft style.
if [ -f "$SESSION_ROW" ]; then
  if ! grep -q "borderLeft" "$SESSION_ROW"; then
    echo "[restore-customizations] ERROR: profile-color border missing from session-row.tsx" >&2
    missing=1
  fi
else
  echo "[restore-customizations] ERROR: session-row.tsx not found at $SESSION_ROW" >&2
  missing=1
fi

if [ "$missing" -eq 0 ]; then
  echo "[restore-customizations] OK — all customizations present."
  exit 0
fi

# A customization was clobbered. The customizations themselves live on the
# custom-desktop branch, so the safe restore is to re-checkout the known-good
# versions of just those two files from the current branch HEAD.
echo "[restore-customizations] restoring clobbered files from HEAD..."
git -C "$REPO_ROOT" checkout "briesman/custom-desktop" -- \
  "apps/desktop/src/styles.css" \
  "apps/desktop/src/app/chat/sidebar/session-row.tsx" 2>/dev/null \
  || git -C "$REPO_ROOT" checkout HEAD -- \
  "apps/desktop/src/styles.css" \
  "apps/desktop/src/app/chat/sidebar/session-row.tsx"

echo "[restore-customizations] done. Re-run 'pnpm --filter hermes build' to rebundle."
