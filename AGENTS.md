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

The register below is canonical. Every entry states the rule, why it exists, and the test that
guards it. **If you change behaviour covered here, update the test in the same commit** — CI
enforces 100% coverage on `src/crisp/**`, so an unguarded change fails the build.

`INV-*` ids are stable; reference them in PRs and code comments.

### Governance structure

| Id        | Invariant                                                                                                                                                                    | Guarded by                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **INV-1** | **Proposals are created on the SPP, never on a body.** Bodies are stage-0 sub-bodies; the SPP creates their sub-proposals.                                                   | `CrispVotingSpp.t.sol::test_createProposalRevertsWithoutPermission`                                                                          |
| **INV-2** | **Only the SPPs hold `EXECUTE_PERMISSION` on the DAO.** A body holding it would let a proposer execute straight from stage 0 and skip the foundation entirely.               | `CrispVotingSetup.t.sol::test_prepareInstallationNeverRequestsExecutePermissionOnTheDao` + the post-deploy runbook in `SECURITY.md`          |
| **INV-3** | **`CrispVoting.createProposal` is SPP-only** (`CREATE_PROPOSAL_PERMISSION`, granted to its SPP) and charges the SPP proposal _creator's_ escrow, never the caller's.         | `CrispVotingSpp.t.sol::test_createProposalChargesSppProposalCreator`, `…RevertsWithoutPermission`                                            |
| **INV-4** | **Nobody can spend someone else's fee credit.** The payer comes from the SPP's own attestation (`metadata = abi.encode(spp, sppProposalId, stageId)`), never a caller field. | `CrispVotingViews.t.sol::test_createProposalRevertsOnWrongLengthMetadata`, `…WhenTheEncodedSppIsNotTheCaller`, `…WhenTheSppReportsNoCreator` |
| **INV-5** | **Bodies execute via delegatecall to the shared `Executor`** so `reportProposalResult` reaches the SPP _as the body_. Never repoint them at the DAO.                         | `CrispVotingSpp.t.sol::test_executeIsPermissionlessAndReportsAsPlugin`                                                                       |
| **INV-6** | **Minting the governance token is DAO-only.** It once granted to `ANY_ADDR` "for testing" — anyone could mint voting power.                                                  | `CrispVotingSetup.t.sol::test_prepareInstallationGrantsMintToTheDaoOnlyNeverToAnyAddr`                                                       |
| **INV-7** | **Install and uninstall are symmetric.** Uninstall must revoke exactly what install granted, or a removed plugin leaves live permissions behind.                             | `CrispVotingSetup.t.sol::test_prepareUninstallationRevokesExactlyWhatInstallGranted`                                                         |

### Stage configuration (`WireSpp.stagesFor`)

| Id         | Invariant                                                                                                                                                                                               | Guarded by                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **INV-8**  | **Public stage-0 `minAdvance == voteDuration`, never 0.** TokenVoting's `hasSucceeded()` reports an early-reached threshold while the vote is open; this forces the SPP to decide on the _final_ tally. | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-9**  | **Private stage-0 `minAdvance == 0` is safe** — a CRISP tally only exists once the E3 window closes, so the path is self-limiting.                                                                      | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-10** | **Stage 1 approval mode ⇒ `vetoThreshold == 0`.** The UI detects the mode from exactly this field; changing it silently flips the mode the app displays.                                                | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-11** | **Stage 1 veto mode holds for the full window** (`voteDuration == vetoDuration`). A zero window would mean no veto opportunity at all.                                                                  | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-12** | **An unrecognised `SPP_STAGE1_MODE` falls back to `approval`** (the check is `!= "veto"`), so a typo can never silently disable the foundation gate.                                                    | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-13** | **The foundation body is `isManual` and does not `tryAdvance`.** It reports its own result; a non-manual body would have the SPP try to create a sub-proposal on it.                                    | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-14** | **No stage is `editable` or `cancelable`.** An in-flight proposal's actions must not change after voters have seen them.                                                                                | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-15** | **The public window clears TokenVoting's 1 hour `minDuration` floor**, or every sub-proposal creation reverts.                                                                                          | `WireSppStages.t.sol::test_stageConfigurationInvariants` |

### Cross-boundary sync (contract ↔ server ↔ app)

| Id         | Invariant                                                                                                                                                                                                                                                                          | Guarded by                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **INV-16** | **Vote scaling is a three-way sync.** The CRISP server encodes power as `balance / 10^(decimals-1)`, so tallies arrive scaled. The factor must match in the server, `CrispVoting._tallyScale()`, and the app (`useCrispServer` `adjustedBalance` + `utils/quorum.ts` `voteScale`). | `CrispVotingQuorum.t.sol::test_tallyScaleMatchesTheServerEncoding`; app `quorum-invariants.test.ts`                   |
| **INV-17** | **`RATIO_BASE == 100`**, so CRISP `minParticipation` is a whole percentage (1 = 1%) and the finest step is 1%. TokenVoting's is ppm out of 1_000_000 — do not conflate them.                                                                                                       | `CrispVotingViews.t.sol::test_initializeRevertsWhenMinParticipationExceedsRatioBase`; app `quorum-invariants.test.ts` |
| **INV-18** | **The CRISP `_data` tuple is `(uint256 allowFailureMap, uint256 votingDuration, uint256 credits)`** and must stay in sync between `customProposalParamsABI()`, `createProposal`'s decode, and the app encoder in `plugins/crispVoting/hooks/useCreateProposal.ts`.                 | `CrispVotingViews.t.sol::test_customProposalParamsAbiMatchesTheDecodedTuple`                                          |
| **INV-19** | **Snapshot timepoints are token-clock units, not block numbers.** FOLD is ERC-6372 `mode=timestamp`, so `snapshotBlock` holds a **timestamp**. Feed it to `getPastVotes`/`getPastTotalSupply`; never use it as an `eth_call` block tag.                                            | `CrispVotingViews.t.sol::test_snapshotUsesTheTokenClockWhenAvailable`, `…UsesBlockNumberWhenTheTokenHasNoClock`       |
| **INV-20** | **Decimals are read on-chain, never assumed.** Both the fee token (6) and FOLD (18) are read; a hardcoded 18 silently misreports balances and breaks quorum.                                                                                                                       | app `hooks/useTokenDecimals.ts`; app `quorum-invariants.test.ts`                                                      |

### Outcome semantics

| Id         | Invariant                                                                                                                                                                                                                        | Guarded by                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **INV-21** | **Quorum is monotonic in turnout** — more votes must never turn a passing proposal into a failing one.                                                                                                                           | `CrispVotingQuorum.t.sol::testFuzz_quorumIsMonotonicInTurnout`; app `quorum-invariants.test.ts`                                     |
| **INV-22** | **Quorum is met at exactly the threshold**, and a proposal needs `counts[0] > counts[1]` strictly — a tie is a rejection.                                                                                                        | `CrispVotingQuorum.t.sol::test_quorumReachedExactlyAtThresholdSucceeds`, `…OneUnitBelowThresholdFails`, `test_tieIsRejected`        |
| **INV-23** | **Executed proposals freeze their tally.** `getTally`/`getWinningOption` must read the stored result, not live CRISP, or a re-published tally would rewrite history.                                                             | `CrispVotingViews.t.sol::test_getTallyReadsTheStoredResultAfterExecution`, `test_getWinningOptionAfterExecutionUsesTheStoredTally`  |
| **INV-24** | **Execution is single-shot and window-gated**: not before `endDate`, not without a passing tally, never twice.                                                                                                                   | `CrispVotingViews.t.sol::test_executeRevertsBeforeTheVotingWindowCloses`, `…WhenTheTallyDoesNotPass`, `test_executeIsNotRepeatable` |
| **INV-25** | **Zero-action (signaling) proposals read as `Accepted`, never `Executable`/`Expired`** — except an approval-mode lapse, which really is a rejection. Key on the **SPP's** `proposal.actions`, never CRISP's `isSignalingOnly()`. | app `status-bucket.test.ts`                                                                                                         |
| **INV-26** | **A veto reads as `Vetoed`, and vetoes are irreversible.** In approval mode a veto is unreachable — silence is the rejection.                                                                                                    | app `status-bucket.test.ts`                                                                                                         |

### Operational

| Id         | Invariant                                                                                                                          | Guarded by                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **INV-27** | **No credential carries a `NEXT_PUBLIC_` prefix.** Next inlines those into the client bundle, making them public to every visitor. | CI `secret-hygiene` job                              |
| **INV-28** | **Testnet-only UI is env-gated** (`NEXT_PUBLIC_ENABLE_FAUCET`). There is no faucet on mainnet.                                     | `app/constants.ts` (`PUB_ENABLE_FAUCET`)             |
| **INV-29** | **The Admin plugin is disarmed after wiring** and the deployer retains no `ROOT`. An armed Admin executes on the DAO with no vote. | post-deploy runbook in `SECURITY.md`                 |
| **INV-30** | **`src/crisp/**` stays at 100% coverage.** A behaviour change without a test fails the build.                                      | CI `MIN_COVERAGE` gate in `.github/workflows/ci.yml` |

Two invariants are **not** enforceable by a test and need a human check: the foundation body must
be a **multisig, not an EOA** (`SECURITY.md` runbook), and the CRISP server must be honest about
the eligible-voter set (documented trust assumption).

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
- **Status labels come from two layers, and the SPP one wins.** While stage 0 is undecided the
  body-level `ProposalStatus` (CRISP / TokenVoting `useProposalStatus`) is authoritative; once the
  proposal reaches stage 1 or finalizes, `getSppStatusOverride` (`app/plugins/spp/utils/status.ts`)
  takes over. Anything that changes how an outcome reads must be applied at the layer that
  actually renders it — patching only the body hook is invisible from stage 1 onwards.
- **Zero-action (signaling) proposals must not read as `Executable` or `Expired`.** Their final
  advance is a no-op that only marks them executed, so `getSppStatusOverride` reports **Accepted**
  when `proposal.actions.length == 0` — both for `Advanceable` and for a lapsed **veto-mode**
  window (silence = consent, so the lapse costs a poll nothing). Two carve-outs: in **approval
  mode** a lapse IS the rejection (the foundation never approved), so it stays `Expired`; and
  stage-0 expiry is left alone because it can't distinguish "vote failed" from "passed but never
  advanced". Key this on the **SPP's** `proposal.actions` (what executes on the DAO), never on
  CRISP's `isSignalingOnly()` — that helper is about pass/fail semantics (option count / credit
  mode) and a multi-option proposal can still carry actions.
- **The list's status filter reads rendered labels, not chain state.** Rows resolve their own
  status via hooks, then report a bucket up to `plugins/governance/pages/list.tsx` via `onStatus`;
  filtered-out rows stay mounted and render `null` (unmounting them would stop the very hooks that
  resolve the status). Adding a new status label means adding it to `statusBucketOf`
  (`app/plugins/governance/utils/statusBucket.ts`) — unmapped labels appear only under "All".
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

## Production rules

- **No credential may carry a `NEXT_PUBLIC_` prefix.** Next inlines those into the client bundle.
  `PINATA_JWT` and `ETHERSCAN_API_KEY` are server-only and are read exclusively by
  `app/pages/api/ipfs/pin.ts` and `app/pages/api/etherscan.ts`; the browser calls those routes.
  CI's `secret-hygiene` job fails the build if this is violated. See [`SECURITY.md`](SECURITY.md).
- **Minting is DAO-only.** `CrispVotingSetup` grants `MINT_PERMISSION` to the DAO. It once granted
  to `ANY_ADDR` "for testing" — anyone could mint voting power. Guarded by a test; do not loosen.
- **Testnet scaffolding is env-gated.** The faucet button renders only when
  `NEXT_PUBLIC_ENABLE_FAUCET=true`. Anything testnet-only must be gated the same way.
- **CI lives at the repo root** (`.github/workflows/ci.yml`) and runs contracts + app + secret
  hygiene. A workflow under `app/.github/` is never executed by GitHub — that trap already cost
  this repo a silently-dead CI.
- **Verify permissions after every deploy.** The runbook is in [`SECURITY.md`](SECURITY.md):
  only the SPPs may hold `EXECUTE_PERMISSION`, Admin must be disarmed, the deployer must not
  retain `ROOT`.

## Conventions

- Contracts: `forge fmt`; Solidity 0.8.29; match existing NatSpc density. Add tests to
  `contracts/test/` for any behavior change. The suites are split by concern:
  `CrispVotingSpp.t.sol` (SPP-body lifecycle), `CrispVotingQuorum.t.sol` (tally scaling +
  quorum), `CrispVotingViews.t.sol` (read surface, settings, revert paths),
  `CrispVotingSetup.t.sol` (install/uninstall permissions). Shared test doubles live in
  `contracts/test/mocks/CrispMocks.sol` — extend those rather than redeclaring per-file.
- **`src/crisp/**` is at 100% coverage and CI enforces it** (`MIN_COVERAGE` in `ci.yml`).
  A behaviour change without a test will fail the build.
- App: match existing style — `If/Then` components, `useTransactionManager`, alerts, `@aragon/ods`.
  Run `bun run build` (typecheck) before committing.
- Root: `bun run format` / `bun run lint` cover both packages (Prettier + `forge fmt`).
