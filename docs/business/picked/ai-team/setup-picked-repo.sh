#!/usr/bin/env bash
# Build the Picked repository from this folder in one step.
#
#   bash docs/business/picked/ai-team/setup-picked-repo.sh ~/picked
#
# It copies the Picked docs into a new folder, installs the AI team
# (.claude/agents, settings, CLAUDE.md, .gitignore), creates the working
# folders, and makes the first commit. It never pushes. Afterwards create an
# empty private GitHub repository called "picked" and follow the two lines
# it prints.
set -euo pipefail

DEST="${1:-}"
if [ -z "$DEST" ]; then
  echo "Usage: $0 <new folder, for example ~/picked>" >&2
  exit 1
fi
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  echo "Stopping: $DEST already exists and is not empty." >&2
  exit 1
fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"   # docs/business/picked
T="$SRC/ai-team/repo-template"

mkdir -p "$DEST"
# Everything Picked, except the template itself (installed below).
( cd "$SRC" && tar --exclude='./ai-team/repo-template' -cf - . ) | ( cd "$DEST" && tar -xf - )

cp "$T/CLAUDE.template.md" "$DEST/CLAUDE.md"
sed -i.bak '/^<!-- Copy this file/d' "$DEST/CLAUDE.md" && rm -f "$DEST/CLAUDE.md.bak"
mkdir -p "$DEST/.claude"
cp -R "$T/claude/." "$DEST/.claude/"
cp "$T/gitignore.txt" "$DEST/.gitignore"

mkdir -p "$DEST/trackers" "$DEST/lots" "$DEST/data/private" "$DEST/data/raw" "$DEST/outbox" "$DEST/briefs"
cp "$T"/trackers/*.csv "$DEST/trackers/"
cp "$T/lots/SPEC.md" "$DEST/lots/SPEC.md"
cp "$T/data/README.md" "$DEST/data/README.md"
touch "$DEST/outbox/.gitkeep" "$DEST/briefs/.gitkeep"

cd "$DEST"
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-Picked}" -c user.email="${GIT_AUTHOR_EMAIL:-hello@pickedprotein.com}" \
  commit -q -m "Picked: brand, plans, site, and AI team"

echo "Done: $DEST"
echo "Agents installed: $(ls .claude/agents | wc -l | tr -d ' ')"
echo
echo "Next, after creating an empty private GitHub repository named picked:"
echo "  git -C \"$DEST\" remote add origin https://github.com/<your-account>/picked.git"
echo "  git -C \"$DEST\" push -u origin main"
