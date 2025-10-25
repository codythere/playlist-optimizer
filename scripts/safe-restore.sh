#!/bin/bash
set -e

STASH_NAME=${1:-}

if [ -z "$STASH_NAME" ]; then
  echo "❌ Please provide the stash name. Example:"
  echo "   ./scripts/safe-restore.sh temp-backup-20251025-123456"
  exit 1
fi

echo "🔹 Step 1: Switching back to previous branch..."
git checkout -

echo "🔹 Step 2: Applying stash $STASH_NAME..."
git stash list | grep "$STASH_NAME" >/dev/null || {
  echo "❌ Stash '$STASH_NAME' not found!"
  exit 1
}

STASH_INDEX=$(git stash list | grep -n "$STASH_NAME" | cut -d: -f1 | head -n1)
if [ -n "$STASH_INDEX" ]; then
  git stash pop stash@{$((STASH_INDEX - 1))}
else
  echo "❌ Could not determine stash index."
  exit 1
fi

echo "✅ Your previous changes have been restored successfully!"
