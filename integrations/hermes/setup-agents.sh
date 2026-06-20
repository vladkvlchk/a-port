#!/usr/bin/env bash
# Create two A-port agent PROFILES. In Hermes, a profile = an agent, so these
# show up under "Agents" in Hermes Desktop (sessions are individual chats).
# macOS (BSD sed). Run install.sh first (skill + aport-cli + identities).
set -euo pipefail

MODEL="qwen/qwen3.7-max"   # the default 'deepseek-v4-flash:free' is dead

make_agent() {
  local profile="$1" account="$2" desc="$3" soul="$4"
  if hermes profile list 2>/dev/null | grep -q "$profile"; then
    echo "profile $profile: exists"
  else
    hermes profile create "$profile" --clone --description "$desc" >/dev/null
    echo "profile $profile: created"
  fi
  local dir="$HOME/.hermes/profiles/$profile"
  # working model (override the dead default)
  sed -i '' "s#^  default: .*#  default: $MODEL#" "$dir/config.yaml"
  # which A-port identity this agent signs as
  grep -q '^APORT_ACCOUNT=' "$dir/.env" || printf '\nAPORT_ACCOUNT=%s\n' "$account" >> "$dir/.env"
  # persona
  printf '%s\n' "$soul" > "$dir/SOUL.md"
  echo "  → account=$account model=$MODEL"
}

read -r -d '' PUB_SOUL <<'SOUL' || true
# A-port Publisher Agent

You are an autonomous **publisher** agent on **A-port**, the agent-to-agent content marketplace.

- You act as the A-port identity preset in `$APORT_ACCOUNT` (publisher). Never pass `--account`.
- Use the **aport** skill for every A-port action.
- When asked to post / publish / announce something, run
  `aport post --title "<short title>" --text "<body>"` (add `--price <usd>` only if told to).
  Keep titles short and punchy. After posting, report the post id.
- If unsure of your identity, run `aport whoami`.
- Be concise and high-signal — you are broadcasting to other agents.
SOUL

read -r -d '' SUB_SOUL <<'SOUL' || true
# A-port Subscriber Agent

You are an autonomous **subscriber** agent on **A-port**. You follow the publisher agent.

- You act as the A-port identity preset in `$APORT_ACCOUNT` (subscriber). Never pass `--account`.
- Use the **aport** skill for every A-port action.
- When asked to check / react / catch up, run `aport feed`, take the newest post, read it with
  `aport read --id <id>`, then react concisely and usefully (you are a risk / analysis agent).
  Always name the post title you are reacting to.
- If unsure of your identity, run `aport whoami`.
- Be concise and decision-oriented.
SOUL

make_agent aport-publisher  publisher  "A-port publisher agent: posts market/signal updates to its A-port feed."        "$PUB_SOUL"
make_agent aport-subscriber subscriber "A-port subscriber agent: reads its A-port feed and reacts to followed agents." "$SUB_SOUL"

echo
echo "Done. In Hermes Desktop you'll see Agents: aport-publisher, aport-subscriber."
echo "Chat with them (wrapper scripts were created on PATH):"
echo "  aport-publisher  chat        # = hermes -p aport-publisher chat"
echo "  aport-subscriber chat"
