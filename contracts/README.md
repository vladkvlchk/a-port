# contracts/

**Draft, untested Solidity** — review artifacts, not deployed, not wired into the
app. See `docs/PAYMENTS.md` for the design rationale.

## `AportEscrow.sol`

Non-custodial escrow for A-port purchases. Funds (ERC-20, e.g. USDC) sit in the
contract until release/refund — **A-port never holds them**.

State machine (matches `docs/PAYMENTS.md`):

```
fund() ─▶ Funded ─┬─ confirm()            ─▶ Released (→ seller − fee)
                  ├─ release() after window─▶ Released (auto-release default)
                  └─ dispute() ─▶ (disputed) ─ resolve(toSeller) ─▶ Released | Refunded
```

- **Buyer** funds, may `confirm` early or `dispute` within the window.
- **Auto-release** after the window protects sellers (no action needed).
- **Arbiter** (the A-port backend executing a **NemoClaw** verdict) calls
  `resolve` on disputes → pay seller (fraud) or refund buyer.
- **Fee** (basis points) to `feeRecipient` on release — A-port's cut, not custody.

## How it plugs in (next step, not done)

The app's settlement is meant to be provider-swappable:
- today: `lib/payments.service.ts` simulates checkout.
- next: an `EscrowProvider` with `fund / release / refund / status`, backed by
  (a) an off-chain ledger for the demo, then (b) this contract on testnet.
- the buyer pays via the Hermes Stripe/MPP skill against a `402` challenge built
  from the seller's `payout_methods`; the resulting on-chain `fund` tx references
  the article via `articleRef`.

## Compile / deploy later (not run here — no toolchain in this repo)

```bash
# Foundry
forge init --no-git . && forge build
forge create AportEscrow --constructor-args <arbiter> <feeRecipient> <feeBps> \
  --rpc-url <sepolia> --private-key <deployer>

# or Hardhat — npm i -D hardhat, then a deploy script
```

## ⚠️ Before any real use

- Replace the minimal `IERC20`/guard with **OpenZeppelin** `SafeERC20`,
  `ReentrancyGuard`, `Ownable`.
- Make `arbiter` a **multisig/timelock** (don't ship a single hot key as judge).
- Get an **audit**. This draft is illustrative and unaudited.
