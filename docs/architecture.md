# Interfold governance — architecture

How the Interfold DAO works after the move to **staged governance**. This is the authoritative
reference; the per-package READMEs summarize and link here.

## TL;DR

Proposals are no longer created directly on a voting plugin. They are created on a **Staged
Proposal Processor (SPP)**, which runs each proposal through two stages:

```
stage 0  — voting body approves            (CRISP encrypted vote / TokenVoting public vote)
stage 1  — foundation veto window          (optimistic: passes unless the foundation vetoes)
           → SPP executes the actions on the DAO
```

There are **two SPP instances** — one wrapping the private (CRISP) body, one wrapping the public
(TokenVoting) body — because a single SPP runs every proposal through the same fixed pipeline and
can't route a proposal to one body *or* the other. See [Why two SPPs](#why-two-spp-instances).

## Plugins on the DAO

`make deploy` installs five plugins in one atomic `createDao`:

| # | Plugin | Role |
|---|--------|------|
| 0 | **CrispVoting** (forked, `contracts/src/crisp/`) | Private encrypted voting **body** — stage 0 of the private process |
| 1 | **TokenVoting v1.4** (Aragon canonical, by address) | Public voting **body** — stage 0 of the public process |
| 2 | **SPP** (Aragon canonical, by address) | **Private process** — wraps CrispVoting + foundation veto |
| 3 | **SPP** (Aragon canonical, by address) | **Public process** — wraps TokenVoting + foundation veto |
| 4 | **Admin** (Aragon canonical, by address) | **Bootstrap only** — lets the deployer wire everything with no vote, then is disarmed (see [Wiring](#wiring-the-admin-bootstrap)) |

The **foundation** is not a plugin — it is a plain address configured as the manual veto body in
stage 1 of both SPPs.

## Proposal lifecycle

1. **Create** — a proposal is created on the SPP (`SPP.createProposal`). The SPP immediately
   creates a **sub-proposal** on the stage-0 body (CrispVoting or TokenVoting). The body's
   sub-proposal carries a single internal action: a callback to `SPP.reportProposalResult`.
2. **Vote (stage 0)** — members vote on the body sub-proposal (encrypted ballots for CRISP,
   on-chain Yes/No/Abstain for TokenVoting), weighted by FOLD voting power at the snapshot.
3. **Advance to stage 1** — once the body **succeeds**, the SPP advances to the veto stage. The
   SPP decides "succeeded" from the body's `hasSucceeded()`, **not a timer** — see
   [Advancement](#how-the-spp-decides-a-stage-passed).
4. **Veto window (stage 1)** — the proposal is held `Active` for the stage's `voteDuration` (the
   veto window). The foundation may veto by calling `reportProposalResult(id, 1, Veto, false)` on
   the SPP. Stage 1 is optimistic: `approvalThreshold = 0`, `vetoThreshold = 1`.
5. **Execute or expire**
   - **Not vetoed:** after the veto window, anyone calls `advanceProposal` (advancing from the
     last stage **executes**), and the SPP runs the proposal's actions on the DAO.
   - **Vetoed:** `vetoes ≥ vetoThreshold` makes the stage permanently un-advanceable; the
     proposal sits until `maxAdvance` then reads as `Expired`. The UI renders a vetoed stage-1
     proposal as **Vetoed** (a veto is irreversible; there is no un-veto).

### Stage configuration

Set by `make wire-spp` (`WireSpp.stagesFor`), tunable via env, changeable later by the DAO via
`updateStages`. Defaults:

| | Stage 0 (voting) | Stage 1 (veto) |
|---|---|---|
| `voteDuration` | 1h (`SPP_*_VOTE_DURATION`) — voting window / body sub-proposal endDate | 2d (`SPP_VETO_DURATION`) — the veto window |
| `maxAdvance` (expiry) | `voteDuration + SPP_ADVANCE_WINDOW` (7d) | `vetoDuration + SPP_EXECUTE_WINDOW` (30d) |
| `minAdvance` | **public: `voteDuration`** · private: 0 (see below) | 0 |
| `approvalThreshold` | 1 | 0 |
| `vetoThreshold` | 0 | 1 |

## How the SPP decides a stage passed

Stage 0 is an approval stage. To decide it is advanceable, the SPP calls
`body.hasSucceeded(subProposalId)` (a fail-safe staticcall) and counts a success toward the
approval threshold. It does **not** wait on a stage clock. Two consequences:

- **Private (CRISP):** the tally only exists after the encrypted voting window closes and the
  ciphernodes publish it. Before that, `hasSucceeded` reverts and the SPP treats it as "not yet."
  So the CRISP window — including a **per-proposal custom duration** — is what gates advancement.
- **Public (TokenVoting):** `hasSucceeded` uses the *early-reached* support threshold while the
  vote is open (even in Standard mode — that mode only blocks early *execution*, not
  `hasSucceeded`). That means a mathematically-locked Yes could advance **before** the end date.
  It is never a *flippable* result (early success requires that no remaining vote can change the
  outcome), but to always decide on the **final** tally we set stage-0 **`minAdvance =
  voteDuration`** on the public SPP — the SPP refuses to advance before the full window elapses,
  by which point `hasSucceeded` evaluates the final tally. The private path doesn't need this
  (tally availability already enforces the full window).

## Bodies as SPP bodies

The voting plugins are **bodies**, not executors. Two wiring facts make that safe:

- **Only the SPPs hold `EXECUTE_PERMISSION` on the DAO.** The CRISP setup no longer grants it,
  and the wiring **revokes** TokenVoting's direct `EXECUTE` — otherwise a proposer could bypass
  the veto stage by executing on the body directly. The bodies can only *report results* to the
  SPP; the SPP executes.
- **Bodies execute via delegatecall to a shared `Executor`.** The wiring points each body's
  `TargetConfig` at a stateless `Executor` with `operation = DelegateCall`, so when a body
  sub-proposal executes its `reportProposalResult` callback, the SPP sees the **body** as
  `msg.sender` (and thus credits the report). Each SPP is granted `CREATE_PROPOSAL_PERMISSION` on
  its body so it can spawn the sub-proposals.

## CRISP creator-pays fee escrow

CRISP proposals cost an Interfold E3 fee. Because the SPP (not the creator) calls the body's
`createProposal`, the fee can't be pulled from the transaction sender. Instead the CRISP plugin
holds a **per-address prepaid credit** in the Interfold fee token:

- `deposit(amount)` / `withdraw(amount)` — top up or pull back credit (`feeCredits[you]`). Deposit
  is a two-step ERC20 `approve` → `deposit`; the UI approves the exact amount (no unlimited
  approvals) plus a small buffer for fee drift.
- On create, `_chargeFee` debits the **SPP proposal creator's** credit. The payer is attested by
  the SPP itself (`getProposal(id).creator` via the SPP-encoded metadata), so nobody can spend
  someone else's credit — a junk proposal only burns the junk-creator's own deposit.
- **Refunds:** if an E3 fails, anyone may call `claimRefund(proposalId)`; it claims from
  Interfold's `E3RefundManager` and credits the **recorded payer** (never the caller), who can
  then withdraw.

Public/TokenVoting proposals are free — no escrow.

### Per-proposal voting duration (private only)

The CRISP creator picks the voting window per proposal. It flows through the SPP's
`proposalParams` into the body's `_data` (`(uint256 allowFailureMap, uint256 votingDuration,
uint256 credits)`) and overrides the SPP-supplied end date. Bounds: `≥ minDuration()` (enforced
on-chain) and `≤ stage-0 maxAdvance − buffer` (enforced by the UI, so the proposal can't expire
before its vote finishes). The fee is quoted against the chosen window. The public path stays
stage-fixed (canonical TokenVoting always uses the SPP-supplied window).

## Why two SPP instances

A single SPP runs every proposal through its one stage config, and `createProposal` always uses
the current config — there is no per-proposal "pick the body" parameter. Putting both bodies in
one stage would spin up *both* a private E3 vote and a public vote for **every** proposal (double
fees, wrong semantics). So each voting mode gets its own SPP: `private = [CRISP → veto]`,
`public = [TokenVoting → veto]`.

## Wiring: the Admin bootstrap

All wiring actions (set stage configs, grant `CREATE_PROPOSAL`, point bodies at the Executor,
revoke the TokenVoting bypass) must be executed **by the DAO** — the deployer has no direct power
after `createDao`. Rather than route a governance vote, the deploy installs the **Admin** plugin,
which grants the deployer direct execute-on-DAO power. `make wire-spp` has the Admin plugin
execute the whole wiring in one transaction, and its **final action revokes the Admin plugin's own
`EXECUTE` on the DAO**, disarming the bootstrap. (Admin's own uninstall can only revoke that same
permission, so this is the equivalent disarm; the plugin remains listed but powerless.)

## Permission map (after wiring)

| Permission | Where | Holder |
|---|---|---|
| `EXECUTE_PERMISSION` | DAO | SPP private, SPP public |
| `EXECUTE_PERMISSION` | DAO | ~~TokenVoting~~ (revoked), ~~CrispVoting~~ (never granted), ~~Admin~~ (revoked = disarmed) |
| `CREATE_PROPOSAL_PERMISSION` | CrispVoting | SPP private |
| `CREATE_PROPOSAL_PERMISSION` | TokenVoting | SPP public |
| `UPDATE_STAGES_PERMISSION` | each SPP | DAO |
| `SET_TARGET_CONFIG` / `MANAGER` | CrispVoting | DAO |
| stage-1 veto body | each SPP stage config | foundation address |

## Deploy flow

```bash
cd contracts
make deploy       # 5-plugin DAO + Executor (broadcast)
make sync-env     # write deployed addresses into contracts/.env + app/.env
make wire-spp     # Admin executes the wiring in one tx, then disarms — no vote
```

Optionally set `CRISP_FEE_DEPOSIT_AMOUNT` before `wire-spp` to pre-escrow fee credit for the
deployer. See [`contracts/README.md`](../contracts/README.md) for the env reference.
