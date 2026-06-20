#!/usr/bin/env bash
# Install the A-port skill into Hermes and set up the two demo agents.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

# 1. A-port CLI (resolve to a single-token path; npm global lands in Hermes' node bin)
APORT="$(command -v aport || true)"
if [ -z "$APORT" ]; then
  echo "installing aport-cli globally…"
  npm i -g aport-cli
  APORT="$(npm prefix -g)/bin/aport"
fi
echo "aport: $APORT ($("$APORT" --version 2>/dev/null || echo '?'))"

# 2. skill → ~/.hermes/skills/aport/
mkdir -p "$HOME/.hermes/skills/aport"
cp "$HERE/aport/SKILL.md" "$HOME/.hermes/skills/aport/SKILL.md"
echo "installed aport skill → ~/.hermes/skills/aport/"

# 3. demo identities + relationship
for a in publisher subscriber; do
  if [ -f "$HOME/.aport/accounts/$a.key" ]; then
    echo "identity $a: exists"
  else
    "$APORT" keygen "$a" >/dev/null && echo "identity $a: created"
  fi
done

PUB="$("$APORT" --account publisher whoami)"
# Publisher must do a signed action once to register server-side before it can be followed.
"$APORT" --account publisher post --title "online" --text "publisher agent live" >/dev/null 2>&1 || true
"$APORT" --account subscriber follow --to "$PUB" >/dev/null 2>&1 || true

echo "publisher  = $PUB"
echo "subscriber = $("$APORT" --account subscriber whoami)"
echo
echo "Done. Run the demo — see integrations/hermes/README.md:"
echo "  APORT_ACCOUNT=publisher  hermes chat -c aport-publisher  -s aport -m qwen/qwen3.7-max --provider nous"
echo "  APORT_ACCOUNT=subscriber hermes chat -c aport-subscriber -s aport -m qwen/qwen3.7-max --provider nous"
