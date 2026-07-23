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
  It's what forces the public vote to decide on the _final_ tally (see the gotcha below).
- **Bodies execute via delegatecall to the shared `Executor`** (`TargetConfig` set in wiring) so
  their `reportProposalResult` callback reaches the SPP as the body. Don't repoint them at the DAO.
- **Snapshot timepoints are token-clock units, not block numbers.** FOLD is an ERC-6372
  `mode=timestamp` token, so `CrispVoting` snapshots `votingToken.clock() - 1` and the stored
  `snapshotBlock` field holds a **timestamp**. Anything consuming it (app hooks, CRISP server)
  must feed it to `getPastVotes`/`getPastTotalSupply` — never use it as an `eth_call` block tag.
- **Vote scaling is a three-way sync.** The CRISP server encodes each voter's power at 1 decimal
  of precision (`balance / 10^(decimals-1)`), so tallies come back in scaled units. This factor
  MUST match in all three places: the server, `CrispVoting._tallyScale()` (quorum math), and the
  app (`useCrispServer` `adjustedBalance` + `utils/quorum.ts` `voteScale`). Changing one without
  the others silently breaks merkle proofs or quorum.

## Gotchas (things that cost time if you don't know them)

- **`hasSucceeded` vs a timer.** The SPP advances stage 0 on the body's `hasSucceeded()`, not a
  clock. TokenVoting's `hasSucceeded` reports an _early-reached_ threshold while the vote is open
  (even in Standard mode — that mode only blocks early _execution_). That's why the public path
  needs `minAdvance = voteDuration`. The private (CRISP) path is self-limiting: its tally only
  exists after the E3 window closes.
- **Stage 1 has two modes** (`SPP_STAGE1_MODE` in `WireSpp.stagesFor`, default `approval`):
  `approval` = opt-in (foundation must explicitly report an Approval; silence = expiry),
  `veto` = opt-out (silence = consent). The UI detects the mode from the on-chain stage config
  (`vetoThreshold == 0` ⇒ approval). Switching later needs no redeploy: a governance proposal
  with `spp.updateStages(...)` actions (calldata via
  `forge script script/WireSpp.s.sol:WireSppScript --sig "printUpdateStages()"`) — it applies
  to future proposals only; in-flight ones keep their config.
- **A veto reads as `Expired`, not `Canceled`.** The UI renders a stage-1 proposal with
  `vetoes ≥ vetoThreshold` as **Vetoed**. Vetoes are irreversible.
- **Per-proposal duration is private-only.** The CRISP creator picks the window; it must stay
  within `[minDuration(), stage-0 maxAdvance − buffer]`. Public uses the stage window (canonical
  TokenVoting, can't be per-proposal without forking it).
- **ABI regen after contract changes.** Regenerate `app/plugins/crispVoting/artifacts/CrispVoting.ts`
  and `app/plugins/spp/artifacts/StagedProposalProcessor.ts` from `contracts/out/**` when the
  corresponding contract changes.
- **Never trust gas estimation for SPP `createProposal`.** The SPP wraps sub-proposal creation in
  try/catch, so `eth_estimateGas` converges on a limit where the inner call (CRISP E3 request
  included) runs out of gas, gets swallowed (`SubProposalNotCreated`), and the outer tx still
  "succeeds" — leaving a dead parent proposal. Both create hooks pass explicit gas limits
  (`CREATE_PROPOSAL_GAS_LIMIT`); keep them.
- **Deployed canonical TokenVoting ≠ its npm source.** Sepolia build 4 is clock-aware (handles
  timestamp tokens via `tokenIndexedByTimestamp`), but the bundled `@aragon/token-voting-plugin`
  npm source still snapshots `block.number`. Judge the deployed build by its on-chain bytecode,
  not the vendored source. Its `minDuration` floor is 1 hour — public windows can't go below.
- **`MINIMUM_PARTICIPATION` is a percentage of `RATIO_BASE = 100`** (CRISP), so 1 = 1% and the
  finest step is 1%. `0` disables quorum (testing). TokenVoting's `TV_MIN_PARTICIPATION` is ppm
  out of 1_000_000 instead.
- **Etherscan V1 endpoints are sunset.** All Etherscan reads go through the V2 multichain
  endpoint (`api.etherscan.io/v2/api` + `chainid`); `hooks/useAbi.ts` rides the chainid in with
  the API key because whatsabi 0.14 has no chainid config.
- **`.env` is the source of truth for addresses** (written by `sync-env`, gitignored). `deploy.log`
  is a convenience artifact; canonical Aragon repo addresses (TokenVoting, SPP, Admin) live in
  `.env.example`.

## Where things live

| Concern                                                     | Location                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Staged-governance mechanism                                 | `docs/architecture.md`                                                          |
| CRISP fork (escrow, per-proposal duration, SPP-body wiring) | `contracts/src/crisp/CrispVoting.sol` + `setup/`                                |
| Deploy (5 plugins + Executor)                               | `contracts/script/DeployInterfoldDao.s.sol`                                     |
| Wiring (stages, grants, delegatecall, disarm)               | `contracts/script/WireSpp.s.sol`                                                |
| Canonical-plugin install encoders                           | `contracts/script/{TokenVotingInstall,SppInstall}.sol`                          |
| SPP frontend module (stages, veto, advance)                 | `app/plugins/spp/`                                                              |
| Private / public body UIs                                   | `app/plugins/crispVoting/` · `app/plugins/tokenVoting/`                         |
| Fee escrow UI                                               | `app/plugins/crispVoting/{hooks/useFeeCredits.ts,components/feeCreditCard.tsx}` |
| Unified list / detail shell                                 | `app/plugins/governance/`                                                       |

## Conventions

- Contracts: `forge fmt`; Solidity 0.8.29; match existing NatSpc density. Add tests to
  `contracts/test/` for any behavior change (see `CrispVotingSpp.t.sol` for the SPP-body mocks).
- App: match existing style — `If/Then` components, `useTransactionManager`, alerts, `@aragon/ods`.
  Run `bun run build` (typecheck) before committing.
- Root: `bun run format` / `bun run lint` cover both packages (Prettier + `forge fmt`).
