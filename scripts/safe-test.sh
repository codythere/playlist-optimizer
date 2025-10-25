#!/bin/bash
set -e  # 遇錯即停，確保安全

TARGET_BRANCH=${1:-main}  # 預設切換到 main，若要別的分支可傳入參數
STASH_NAME="temp-backup-$(date +%Y%m%d-%H%M%S)"

echo "🔹 Step 1: Saving current uncommitted changes..."
git add .
git stash push -m "$STASH_NAME" --include-untracked

echo "✅ Changes stashed as: $STASH_NAME"

echo "🔹 Step 2: Switching to $TARGET_BRANCH..."
git checkout $TARGET_BRANCH

echo "✅ Switched to $TARGET_BRANCH. You can now test your project."
echo ""
echo "⚙️  When you’re done testing, run this command to restore your changes:"
echo ""
echo "   ./scripts/safe-restore.sh $STASH_NAME"
