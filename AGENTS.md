# Agent guide — the-interfold-governance

Operational entry point for coding agents. **Read [`docs/architecture.md`](docs/architecture.md)
first** — it is the authoritative explanation of how staged governance works. This file is the
short operational layer: commands, invariants, and traps.

## What this is

A monorepo for the Interfold DAO. Proposals run through **staged governance**: two Aragon OSx
**Staged Proposal Processor (SPP)** processes, each wrapping a voting body in stage 0 and a
foundation veto in stage 1.

```
the-interfold-governance/
  app/        Next.js (pages router) + wagmi/viem + @aragon/ods — the frontend
  contracts/  Foundry — CrispVoting fork, deploy + wiring scripts, tests
  docs/       architecture.md — the source of truth for the mechanism
```

## Commands

Contracts (`cd contracts`):

```bash
make setup      # git submodules + pnpm install (first time only)
make build      # forge build
make test       # forge test
make predeploy  # simulate the deploy (no broadcast)
make deploy     # broadcast the 5-plugin DAO + Executor
make sync-env   # parse deploy.log → write contracts/.env + app/.env
make wire-spp   # Admin executes the wiring in one tx, then disarms (no vote)
```

Frontend (`cd app`):

```bash
bun install
bun dev         # http://localhost:3000
bun run build   # typecheck + build — must pass before committing app changes
```

Deploy is a strict order: **`deploy` → `sync-env` → `wire-spp`**. All three broadcast except
`sync-env`. Contract changes require a full redeploy cycle (the deployed plugins are immutable
proxies pinned at install).

## Invariants — do not break these

- **Proposals are created on the SPP, never on a body.** The bodies (CrispVoting, TokenVoting)
  are stage-0 bodies; the SPP creates their sub-proposals.
- **Only the SPPs hold `EXECUTE_PERMISSION` on the DAO.** Bodies must never (re)gain it — that
  would let a proposer bypass the veto stage. `wire-spp` revokes TokenVoting's; CrispVoting's
  setup never grants it.
- **CrispVoting `createProposal` is SPP-only** (`CREATE_PROPOSAL_PERMISSION`, granted to its SPP).
  It charges the creator's escrow, not the caller — see the creator-pays section in the arch doc.
- **The CRISP `_data` tuple is `(uint256 allowFailureMap, uint256 votingDuration, uint256
  credits)`** and MUST stay in sync between `CrispVoting.customProposalParamsABI()` /
  `createProposal` and the app encoder in `plugins/crispVoting/hooks/useCreateProposal.ts`. If you
  change one, change both and regenerate the ABI (below).
- **Public stage-0 `minAdvance = voteDuration`** (`WireSpp.stagesFor`) — do not set it to 0.
  It's what forces the public vote to decide on the *final* tally (see the gotcha below).
- **Bodies execute via delegatecall to the shared `Executor`** (`TargetConfig` set in wiring) so
  their `reportProposalResult` callback reaches the SPP as the body. Don't repoint them at the DAO.

## Gotchas (things that cost time if you don't know them)

- **`hasSucceeded` vs a timer.** The SPP advances stage 0 on the body's `hasSucceeded()`, not a
  clock. TokenVoting's `hasSucceeded` reports an *early-reached* threshold while the vote is open
  (even in Standard mode — that mode only blocks early *execution*). That's why the public path
  needs `minAdvance = voteDuration`. The private (CRISP) path is self-limiting: its tally only
  exists after the E3 window closes.
- **A veto reads as `Expired`, not `Canceled`.** The UI renders a stage-1 proposal with
  `vetoes ≥ vetoThreshold` as **Vetoed**. Vetoes are irreversible.
- **Per-proposal duration is private-only.** The CRISP creator picks the window; it must stay
  within `[minDuration(), stage-0 maxAdvance − buffer]`. Public uses the stage window (canonical
  TokenVoting, can't be per-proposal without forking it).
- **ABI regen after contract changes.** Regenerate `app/plugins/crispVoting/artifacts/CrispVoting.ts`
  and `app/plugins/spp/artifacts/StagedProposalProcessor.ts` from `contracts/out/**` when the
  corresponding contract changes.
- **`.env` is the source of truth for addresses** (written by `sync-env`, gitignored). `deploy.log`
  is a convenience artifact; canonical Aragon repo addresses (TokenVoting, SPP, Admin) live in
  `.env.example`.

## Where things live

| Concern | Location |
|---|---|
| Staged-governance mechanism | `docs/architecture.md` |
| CRISP fork (escrow, per-proposal duration, SPP-body wiring) | `contracts/src/crisp/CrispVoting.sol` + `setup/` |
| Deploy (5 plugins + Executor) | `contracts/script/DeployInterfoldDao.s.sol` |
| Wiring (stages, grants, delegatecall, disarm) | `contracts/script/WireSpp.s.sol` |
| Canonical-plugin install encoders | `contracts/script/{TokenVotingInstall,SppInstall}.sol` |
| SPP frontend module (stages, veto, advance) | `app/plugins/spp/` |
| Private / public body UIs | `app/plugins/crispVoting/` · `app/plugins/tokenVoting/` |
| Fee escrow UI | `app/plugins/crispVoting/{hooks/useFeeCredits.ts,components/feeCreditCard.tsx}` |
| Unified list / detail shell | `app/plugins/governance/` |

## Conventions

- Contracts: `forge fmt`; Solidity 0.8.29; match existing NatSpc density. Add tests to
  `contracts/test/` for any behavior change (see `CrispVotingSpp.t.sol` for the SPP-body mocks).
- App: match existing style — `If/Then` components, `useTransactionManager`, alerts, `@aragon/ods`.
  Run `bun run build` (typecheck) before committing.
- Root: `bun run format` / `bun run lint` cover both packages (Prettier + `forge fmt`).
