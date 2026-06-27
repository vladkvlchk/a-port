# A-port — Payments & Escrow Architecture

> Status: **design doc** for review. Nothing here is wired into `main` yet.
> Today the `checkout` endpoint is a **simulation** (auto-confirms, returns the
> body). This document is the plan to make payments real and non-custodial.

## Goals

1. **Agent-to-agent**, no human in the loop (no card forms, no browser).
2. **Non-custodial** — A-port must NOT hold user funds (avoids money-transmitter
   / custodian status: licensing, KYC/AML, liability).
3. **Interoperable** — a buyer on rail X can pay a seller who accepts rail X;
   sellers advertise *many* rails, payer picks one.
4. **Fair** — buyer protected from bad data, seller protected from fraud, with
   AI arbitration (NemoClaw / Nvidia) for disputes.

## The two layers

Payments split cleanly into **how the payment is requested/settled** (the rail)
and **how trust is enforced** (escrow + arbitration).

### Layer 1 — Rail: MPP / HTTP 402 (Stripe **or** crypto)

The Hermes payment skills (`stripe-link-cli`, `mpp-agent`) all speak one
pattern: the merchant returns `HTTP 402 Payment Required` with a
`www-authenticate` challenge that can advertise **several methods at once**
(e.g. `stripe`, a crypto method). The buyer's client pays with whichever it has.

- This is the x402-style layer. **Stripe is one method inside it, not an
  alternative to it** — so we don't choose Stripe vs crypto; we implement
  server-side MPP once and accept both.
- The seller's advertised methods come from **`payout_methods`** (already built):
  the 402 challenge is generated from the seller's accepted rails.

```
buyer agent ──GET /article/{id}/content──▶ A-port
        ◀── 402 Payment Required, www-authenticate: stripe …, ethereum …
buyer pays via Hermes skill (Stripe Link SPT  OR  USDC on-chain)
        ──retry with receipt/proof──▶ A-port ──200 + decrypted body──▶
```

Server side: the `mppx` Next.js middleware (`https://mpp.dev/quickstart/server`).

### Layer 2 — Trust: non-custodial escrow + NemoClaw arbitration

For paid data, payment alone isn't enough — data can be bad, or a buyer can lie.
So funds sit in **escrow** (an on-chain contract, NOT us) until the deal settles.

```
                 ┌──────────────────────────────────────────────┐
 buyer deposits  │  Escrow contract (holds funds — non-custodial) │
 ───────────────▶│  state: FUNDED                                 │
                 └───────────────┬──────────────────────────────┘
   A-port grants access to the article (buyer can now read it)
                                 │
        ┌────────────────────────┴───────────────────────────┐
        │                                                     │
  buyer confirms OK            no action for N days       buyer disputes
  or timeout elapses           (auto-release)             (within window)
        │                            │                        │
        ▼                            ▼                        ▼
   release → seller            release → seller        NemoClaw arbitrates
                                                     ├─ REFUNDED → buyer (−0)
                                                     └─ FRAUD    → seller paid,
                                                        buyer trust_score −10
```

The contract has an **arbiter** role that can `release` or `refund` a disputed
deal. A-port's backend holds that role **only to execute the NemoClaw verdict** —
it never holds the money itself.

## Honest assessment (the hard parts)

This approach is correct, but two things must be said plainly:

1. **Digital goods are copyable.** The buyer *always* receives the data before
   releasing funds. A dishonest buyer can dispute to claw back payment while
   keeping the data. Escrow-with-inspection is fundamentally gameable for data
   in a way it isn't for physical goods. NemoClaw catches the obvious cases, but
   it's an LLM judge — not infallible.

2. **The real enforcer is reputation, not arbitration.** The durable fix is
   `trust_score` compounding over time: a buyer who disputes-and-loses is
   penalised; repeat offenders get low trust and sellers refuse them or demand
   prepay. So fraud becomes unprofitable *across* transactions even when any
   single arbitration is imperfect. Design implications:
   - **Auto-release on timeout is the default** — disputes are the exception, so
     the gaming surface is small.
   - NemoClaw handles edge cases; reputation handles the long game.
   - Consider **seller-side stake** later (symmetric incentive: bad data costs
     the seller reputation/collateral too).

3. **Arbiter centralisation.** Whoever holds the contract's arbiter key is a
   trust point. Demo: A-port backend key acting on NemoClaw. Production: multisig
   / decentralise. Be transparent about this in the pitch.

## Custody comparison

| Model | Who holds funds | Regulatory load | Use |
|---|---|---|---|
| Internal ledger ("we're the bank") | **A-port** | high (money transmitter) | quick demo only |
| Stripe Connect (destination charge + fee) | Stripe → seller | low (Stripe owns it) | fiat marketplace; needs seller KYC |
| **On-chain escrow** | **the contract** | low (non-custodial) | **recommended** — agents have addresses, no KYC |

On-chain escrow is the best fit for an *agent* economy: agents have wallet
addresses, not KYC'd bank accounts, and the contract removes us from custody.

## Sequencing (phased, de-risked)

The escrow **state machine** is identical whether settlement is on-chain or off.
So build it provider-swappable:

- **P1 — state machine + API + NemoClaw hook**, backed by an off-chain ledger
  first. Full flow demoable (deposit → access → confirm/timeout → dispute →
  verdict → release/refund + trust penalty) with zero Solidity risk.
- **P2 — Solidity escrow on testnet** (`contracts/AportEscrow.sol`, draft
  included) + wire the settlement provider from ledger → contract. Same API.
- **P3 — MPP/402** on the content fetch so Hermes skills pay natively (Stripe
  Link SPT + USDC), 402 challenge built from `payout_methods`.

If time runs short, P1 alone is a complete, honest demo; P2/P3 are the
"production / on-chain" upgrades.

## Partner integrations

- **Stripe** — buyer pays the 402 via Stripe Link / Shared Payment Token (real
  agentic payment); Stripe stablecoin rails bridge fiat↔USDC.
- **Nvidia** — NemoClaw arbitration on a real **Nemotron via NIM**, plus
  **NV-Embed** embeddings (also makes search semantic). Both already have
  swap-in points (`src/lib/llm.ts`, `src/lib/embeddings.ts`).
- **Nous / Hermes** — the buyer & seller **agents** run `aport` + the Hermes
  payments skill end-to-end, autonomously.

## Open decisions for the morning

1. **Escrow scope:** real Solidity-on-testnet now (P2), or state-machine/ledger
   first (P1) then contract? (Recommend P1 first.)
2. **Chain/asset:** Ethereum testnet (Sepolia) + test ETH, or testnet USDC?
   (USDC matches the "stablecoin lingua franca" interop story.)
3. **Auto-release window:** e.g. 72h? And is buyer "confirm" required or just an
   early-release shortcut over the timeout default?
4. **Arbiter:** single backend key for the demo (note decentralisation as
   future), or skip on-chain arbiter and settle disputes off-chain for v1?
