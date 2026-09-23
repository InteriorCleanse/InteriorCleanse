#!/usr/bin/env bash
# Install the full third-party skill collections for Claude Code at USER level
# (~/.claude/skills), where they apply to every project on this machine.
#
# The repository already vendors a curated subset under .claude/skills/ (see
# .claude/skills/THIRD_PARTY_SKILLS.md). Run this only if you want the whole
# collections: they are large (the scientific set is hundreds of megabytes)
# and every skill is a set of instructions an agent will follow, written by
# someone else. Read what you install.
#
# Nothing here touches the bot, its data, or its configuration.
set -euo pipefail

DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

clone() { # name url subdir
  local name="$1" url="$2" sub="${3:-}"
  echo "== $name"
  git clone -q --depth 1 --filter=blob:none "$url" "$TMP/$name"
  local src="$TMP/$name${sub:+/$sub}"
  if [ -f "$src/SKILL.md" ]; then
    rm -rf "$DEST/$name"; cp -r "$src" "$DEST/$name"
  else
    # a collection: one folder per skill
    for d in "$src"/*/; do [ -f "$d/SKILL.md" ] && { rm -rf "$DEST/$(basename "$d")"; cp -r "$d" "$DEST/$(basename "$d")"; }; done
  fi
  [ -f "$TMP/$name/LICENSE" ] && cp "$TMP/$name/LICENSE" "$DEST/$name.LICENSE" || true
  [ -f "$TMP/$name/LICENSE.md" ] && cp "$TMP/$name/LICENSE.md" "$DEST/$name.LICENSE" || true
}

clone diagram-design https://github.com/cathrynlavery/diagram-design skills/diagram-design
clone scientific-agent-skills https://github.com/k-dense-ai/scientific-agent-skills skills
clone cybersecurity-skills https://github.com/mukul975/Anthropic-Cybersecurity-Skills skills

echo
echo "Installed into $DEST. Restart Claude Code to pick them up."
echo "Note: 'Anthropic-Cybersecurity-Skills' is a community project; despite the name it is not published by Anthropic."
