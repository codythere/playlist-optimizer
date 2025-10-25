#!/bin/bash
set -e

echo "🔹 Step 1: Switching back to previous branch..."
git checkout -

# 抓出最新的 stash (stash@{0})
LATEST_STASH=$(git stash list | head -n1 | awk -F: '{print $1}')

if [ -z "$LATEST_STASH" ]; then
  echo "❌ No stash found!"
  exit 1
fi

echo "🔹 Step 2: Applying $LATEST_STASH..."
git stash pop "$LATEST_STASH"

echo "✅ Successfully restored from $LATEST_STASH!"
