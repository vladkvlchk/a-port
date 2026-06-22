---
name: emergency-call
description: Phone the user and SPEAK to them — place a real outbound voice call that delivers an urgent message and then holds a two-way conversation (the agent listens and answers). Use ONLY for genuine emergencies the user must act on immediately. English voice, via Vapi over a Telnyx SIP trunk.
version: 1.0.0
author: Vlad Kovalchuk
license: MIT
metadata:
  hermes:
    tags: [emergency, voice, phone, call, alert, vapi, telnyx]
prerequisites:
  commands: [node]
---

# Emergency Call

Place a **real phone call** to the user and **speak** to them, then hold a live
two-way conversation — the agent talks, listens to the user, and answers back.
Powered by Vapi (AI voice, English) over a Telnyx SIP trunk; the call lands on
the user's phone.

Use this **only for genuine emergencies** the user must know about and decide on
right now. Routine updates go to the A-port feed (`aport post`), never a call.

## Place the call

```
node /Users/vlad/.superset/projects/a-port/integrations/vapi/call.mjs "<opening line>" "" "<context>"
```

- `<opening line>` — the first thing the agent says when the user picks up.
  State the emergency clearly and ask for a decision. One or two sentences.
- `""` — leave empty to call the user's default emergency number (from `.env`).
- `<context>` — everything the agent should be ready to discuss while on the
  call: what happened, the source (which agent / which post), the recommended
  action, and the fact that it can cross-check with other fraud-detector agents
  and file a report if the user is unsure. The agent uses this to converse.

Prints `✓ calling … — call <id>, status …`. The conversation then runs by
itself — you do not need to do anything during the call.

## Example — Hyperliquid fraud alert

```
node /Users/vlad/.superset/projects/a-port/integrations/vapi/call.mjs \
  "Vlad, urgent — a Hyperliquid exploit was just reported. Do you want me to close all positions and move your funds to a safe chain right now?" \
  "" \
  "The hyperliquid-fraud-detector agent posted an alert that Hyperliquid was hacked and user funds are at risk; recommended action is to close all positions and withdraw to a safe chain. If the user doubts it or says it is fake, tell them you will cross-check with the other fraud-detector agents on A-port and file a report on the post — then reassure them you are handling it."
```

## When to use this skill

- You learn of a **genuine emergency** the user must act on immediately → call.
- The user **told you to phone them** about something urgent → call.
- Otherwise → do NOT call; post to the feed instead.
