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

Phased rollout (mainnet — see [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)). Two env
flags, both defaulting to today's single-phase behaviour so Sepolia is unaffected:
`DEPLOY_PRIVATE_PROCESS=false` deploys the public process only, `DISARM_ADMIN=false` leaves the
Admin bootstrap armed so plugins can be installed later without a vote.

```bash
make publish-crisp-repo         # phase 2 step 1: CrispVotingSetup + mint the CRISP PluginRepo
make prepare-private-process    # phase 2 step 2: prepareInstallation (EOA, DAO untouched)
make install-private-process    # phase 2 step 3: Admin applies + wires the private process
make print-private-actions      # same actions as calldata, if the Admin is already disarmed
make grant-admin                # phase 2b step 1: grant ADMIN_SUCCESSOR_ADDRESS the bootstrap
make revoke-admin               # phase 2b step 2: revoke the predecessor (default: this key)
make disarm-admin               # revoke the Admin bootstrap's EXECUTE (INV-29) — always separate
```

Installing the **public** process into a DAO that already exists with only the Admin plugin (the
mainnet case — `DeployInterfoldDao` cannot be used, there is no DAO left to create):

```bash
make deploy-executor            # EOA: the stateless delegatecall target (INV-5)
make simulate-public-install    # fork: assert the end-state permissions before signing
make simulate-public-governance # fork: create -> vote -> advance -> approve -> execute
make safe-prepare-public        # two DIRECT Safe calls (prepareInstallation is permissionless)
make safe-install-public        # ONE atomic Safe tx: apply BOTH installs + wire
```

`safe-install-public` is atomic **on purpose** — see the trap below. All of these take
`ENV_FILE=.env.mainnet`.

**Disarming is never bundled into a deploy or an install.** It is its own command so it is always a
deliberate action, and so a failed install is not entangled with an irreversible revoke.

**Rotation is two commands, never one.** `grant-admin` / `revoke-admin` move
`EXECUTE_PROPOSAL_PERMISSION` on the Admin _plugin_ — who may drive the bootstrap — not `EXECUTE` on
the DAO, which is whether it is armed at all. Between the two commands both holders can drive it,
and that is the point: the successor executes a no-op proposal to prove the grant satisfies the
plugin's auth check before the EOA gives up the only key. Rotating is not disarming.

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

| Id        | Invariant                                                                                                                                                                                                                                                                                                                                          | Guarded by                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **INV-1** | **Proposals are created on the SPP, never on a body.** Bodies are stage-0 sub-bodies; the SPP creates their sub-proposals.                                                                                                                                                                                                                         | `CrispVotingSpp.t.sol::test_createProposalRevertsWithoutPermission`                                                                                                                              |
| **INV-2** | **Only the SPPs hold `EXECUTE_PERMISSION` on the DAO.** A body holding it would let a proposer execute straight from stage 0 and skip the foundation entirely.                                                                                                                                                                                     | `CrispVotingSetup.t.sol::test_prepareInstallationNeverRequestsExecutePermissionOnTheDao` + the post-deploy runbook in `SECURITY.md`                                                              |
| **INV-3** | **`CrispVoting.createProposal` is SPP-only** (`CREATE_PROPOSAL_PERMISSION`, granted to its SPP at wiring; an SPP-body install grants it to NOBODY — an `ANY_ADDR` wildcard would let a direct creator front-run the SPP's deterministic sub-proposal id and brick the parent) and charges the SPP proposal _creator's_ escrow, never the caller's. | `CrispVotingSpp.t.sol::test_createProposalChargesSppProposalCreator`, `…RevertsWithoutPermission`; `CrispVotingSetup.t.sol::test_prepareInstallationGrantsCreateProposalToAnyAddrOnlyStandalone` |
| **INV-4** | **Nobody can spend someone else's fee credit.** The payer comes from the SPP's own attestation (`metadata = abi.encode(spp, sppProposalId, stageId)`), never a caller field.                                                                                                                                                                       | `CrispVotingViews.t.sol::test_createProposalTreatsWrongLengthMetadataAsADirectProposal`, `…WillNotChargeAnSppItIsNotCalledBy`, `…RevertsWhenTheSppReportsNoCreator`                              |
| **INV-5** | **Bodies execute via delegatecall to the shared `Executor`** so `reportProposalResult` reaches the SPP _as the body_. Never repoint them at the DAO.                                                                                                                                                                                               | `CrispVotingSpp.t.sol::test_executeIsPermissionlessAndReportsAsPlugin`                                                                                                                           |
| **INV-6** | **The setup can mint no voting power at all.** The fresh-token and wrap paths were removed: only an existing IVotes token installs (anything else reverts), so no install shape may request a mint permission. It once granted mint to `ANY_ADDR` "for testing".                                                                                   | `CrispVotingSetup.t.sol::test_prepareInstallationNeverRequestsAMintPermission`, `…RejectsANonIVotesErc20InsteadOfWrapping`, `…RejectsTheZeroAddressFreshTokenRequest`                            |
| **INV-7** | **Install and uninstall are symmetric.** Uninstall must revoke exactly what install granted, or a removed plugin leaves live permissions behind.                                                                                                                                                                                                   | `CrispVotingSetup.t.sol::test_prepareUninstallationRevokesExactlyWhatInstallGranted`                                                                                                             |

### Stage configuration (`WireSpp.stagesFor`)

| Id         | Invariant                                                                                                                                                                                                                                         | Guarded by                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **INV-8**  | **Public stage-0 `minAdvance == voteDuration`, never 0.** TokenVoting's `hasSucceeded()` reports an early-reached threshold while the vote is open; this forces the SPP to decide on the _final_ tally.                                           | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-9**  | **Private stage-0 `minAdvance == 0` is safe** — a CRISP tally only exists once the E3 window closes, so the path is self-limiting.                                                                                                                | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-10** | **Stage 1 approval mode ⇒ `vetoThreshold == 0`.** The UI detects the mode from exactly this field; changing it silently flips the mode the app displays.                                                                                          | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-11** | **Stage 1 veto mode holds for the full window** (`voteDuration == vetoDuration`). A zero window would mean no veto opportunity at all.                                                                                                            | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-12** | **An unrecognised `SPP_STAGE1_MODE` falls back to `approval`** (the check is `!= "veto"`), so a typo can never silently disable the foundation gate.                                                                                              | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-13** | **The foundation body is `isManual` and does not `tryAdvance`.** It reports its own result; a non-manual body would have the SPP try to create a sub-proposal on it.                                                                              | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-14** | **No stage is `editable` or `cancelable`.** An in-flight proposal's actions must not change after voters have seen them.                                                                                                                          | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-37** | **The private stage window clears CRISP's `minDuration`** (`SPP_PRIVATE_VOTE_DURATION >= MINIMUM_DURATION`), or every private `createProposal` reverts INSIDE the SPP's try/catch and dies silently — `stagesFor` refuses to build such a config. | `WireSppStages.t.sol::test_stageConfigurationInvariants` |
| **INV-15** | **The public window clears TokenVoting's 1 hour `minDuration` floor**, or every sub-proposal creation reverts.                                                                                                                                    | `WireSppStages.t.sol::test_stageConfigurationInvariants` |

### Fixed vote shape

| Id         | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Guarded by                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **INV-34** | **Every CRISP proposal is exactly 3 options** — yes (0), no (1), abstain (2) — via `CrispVoting.NUM_OPTIONS`, and `CreditMode` is always `CUSTOM`. There is no multi-option or CONSTANT-credit path; do not reintroduce option-count branching. Changing this means revisiting `_canExecute`, the E3 request params and the app's tally rendering together.                                                                                                                                                                                                                 | `CrispVotingQuorum.t.sol` (tally is 3-wide throughout)                                                                                                                                                      |
| **INV-32** | **Quorum applies to every proposal, with or without actions.** `_canExecute` gates on it unconditionally, so the app must never skip it for "signaling" proposals — that would report a pass the chain rejects.                                                                                                                                                                                                                                                                                                                                                             | app `quorum-invariants.test.ts`; `CrispVotingQuorum.t.sol`                                                                                                                                                  |
| **INV-33** | **A proposal settles under the rules in force WHEN IT WAS CREATED.** `_canExecute` must read `proposal.parameters.minParticipation` and `.supportThreshold`, never the live `votingSettings`. Canonical TokenVoting freezes `minVotingPower` into `ProposalParameters` at creation and never re-reads the setting; the SPP pins each proposal to a `stageConfigIndex`. All three layers must agree, or a governance proposal that changes the quorum retroactively decides votes already in flight — and a CRISP ballot is encrypted, so voters cannot re-cast in response. | `CrispVotingQuorum.t.sol::test_quorumRaisedMidProposalDoesNotAffectAnOpenProposal`, `…QuorumLoweredMidProposalDoesNotRescueAnOpenProposal`, `…SupportThresholdRaisedMidProposalDoesNotAffectAnOpenProposal` |

### Cross-boundary sync (contract ↔ server ↔ app)

| Id         | Invariant                                                                                                                                                                                                                                                                                                                                      | Guarded by                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **INV-16** | **Vote scaling is a three-way sync.** The CRISP server encodes power as `balance / 10^(decimals-1)`, so tallies arrive scaled. The factor must match in the server, `CrispVoting._tallyScale()`, and the app (`useCrispServer` `adjustedBalance` + `utils/quorum.ts` `voteScale`).                                                             | `CrispVotingQuorum.t.sol::test_tallyScaleMatchesTheServerEncoding`; app `quorum-invariants.test.ts`                   |
| **INV-17** | **`RATIO_BASE == 100`**, so CRISP `minParticipation` AND `supportThreshold` are whole percentages (1 = 1%) and the finest step is 1%. TokenVoting's are ppm out of 1_000_000 — do not conflate them.                                                                                                                                           | `CrispVotingViews.t.sol::test_initializeRevertsWhenMinParticipationExceedsRatioBase`; app `quorum-invariants.test.ts` |
| **INV-18** | **The CRISP `_data` tuple is `(uint256 allowFailureMap)`** — nothing else. The voting window is the stage-configured one (never creator-chosen) and credits are always 0; the tuple must stay in sync between `customProposalParamsABI()`, `createProposal`'s decode, and the app encoder in `plugins/crispVoting/hooks/useCreateProposal.ts`. | `CrispVotingViews.t.sol::test_customProposalParamsAbiMatchesTheDecodedTuple`                                          |
| **INV-19** | **Snapshot timepoints are token-clock units, not block numbers.** FOLD is ERC-6372 `mode=timestamp`, so `snapshotBlock` holds a **timestamp**. Feed it to `getPastVotes`/`getPastTotalSupply`; never use it as an `eth_call` block tag.                                                                                                        | `CrispVotingViews.t.sol::test_snapshotUsesTheTokenClockWhenAvailable`, `…UsesBlockNumberWhenTheTokenHasNoClock`       |
| **INV-20** | **Decimals are read on-chain, never assumed.** Both the fee token (6) and FOLD (18) are read; a hardcoded 18 silently misreports balances and breaks quorum.                                                                                                                                                                                   | app `hooks/useTokenDecimals.ts`; app `quorum-invariants.test.ts`                                                      |

### Outcome semantics

| Id         | Invariant                                                                                                                                                                                                                                                                                                                                                                              | Guarded by                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **INV-21** | **Quorum is monotonic in turnout** — more votes must never turn a passing proposal into a failing one.                                                                                                                                                                                                                                                                                 | `CrispVotingQuorum.t.sol::testFuzz_quorumIsMonotonicInTurnout`; app `quorum-invariants.test.ts`                                                                                                                                                                                                              |
| **INV-22** | **Quorum is met at exactly the threshold**, and yes must STRICTLY exceed the configurable `supportThreshold` share of yes+no (`(RATIO_BASE - t) * yes > t * no`; at the 50 default a tie is a rejection, and landing exactly ON the threshold fails). `getWinningOption` reports the same decision (0 or 1, never an abstain "win"), so the UI can never show a Yes the chain refuses. | `CrispVotingQuorum.t.sol::test_quorumReachedExactlyAtThresholdSucceeds`, `…OneUnitBelowThresholdFails`, `test_tieIsRejected`; `CrispVotingViews.t.sol::test_getWinningOptionReportsATieAsARejection`; `CrispVotingQuorum.t.sol::test_supportExactlyAtTheThresholdFails`, `…OneUnitAboveTheThresholdSucceeds` |
| **INV-23** | **Executed proposals freeze their tally.** `getTally`/`getWinningOption` must read the stored result, not live CRISP, or a re-published tally would rewrite history.                                                                                                                                                                                                                   | `CrispVotingViews.t.sol::test_getTallyReadsTheStoredResultAfterExecution`, `test_getWinningOptionAfterExecutionUsesTheStoredTally`                                                                                                                                                                           |
| **INV-24** | **Execution is single-shot and window-gated**: not before `endDate`, not without a passing tally, never twice.                                                                                                                                                                                                                                                                         | `CrispVotingViews.t.sol::test_executeRevertsBeforeTheVotingWindowCloses`, `…WhenTheTallyDoesNotPass`, `test_executeIsNotRepeatable`                                                                                                                                                                          |
| **INV-25** | **Zero-action (signaling) proposals read as `Accepted`, never `Executable`/`Expired`** — except an approval-mode lapse, which really is a rejection. Key on the **SPP's** `proposal.actions`, never CRISP's `isSignalingOnly()`.                                                                                                                                                       | app `status-bucket.test.ts`                                                                                                                                                                                                                                                                                  |
| **INV-26** | **A veto reads as `Vetoed`, and vetoes are irreversible.** In approval mode a veto is unreachable — silence is the rejection.                                                                                                                                                                                                                                                          | app `status-bucket.test.ts`                                                                                                                                                                                                                                                                                  |

### Operational

| Id         | Invariant                                                                                                                                                                                  | Guarded by                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **INV-27** | **No credential carries a `NEXT_PUBLIC_` prefix.** Next inlines those into the client bundle, making them public to every visitor.                                                         | CI `secret-hygiene` job                                                             |
| **INV-28** | **Testnet-only UI is env-gated** (`NEXT_PUBLIC_ENABLE_FAUCET`). There is no faucet on mainnet.                                                                                             | `app/constants.ts` (`PUB_ENABLE_FAUCET`)                                            |
| **INV-29** | **The Admin plugin is disarmed after wiring** and the deployer retains no `ROOT`. An armed Admin executes on the DAO with no vote.                                                         | post-deploy runbook in `SECURITY.md`                                                |
| **INV-30** | **`src/crisp/**` stays at 100% coverage.** A behaviour change without a test fails the build.                                                                                              | CI `MIN_COVERAGE` gate in `.github/workflows/ci.yml`                                |
| **INV-31** | **Exactly one address holds `EXECUTE_PROPOSAL_PERMISSION` on an armed Admin plugin**, outside a rotation window. Two means a rotation was started and never finished.                      | post-deploy runbook in `SECURITY.md`                                                |
| **INV-35** | **`claimRefund` credits the measured fee-token balance delta**, never the amount the refund manager reports — a protocol fee-token swap must not let refunds drain other creators' escrow. | `CrispVotingSpp.t.sol::test_claimRefundCreditsTheMeasuredDeltaNotTheReportedAmount` |
| **INV-36** | **The E3 program address is validated non-zero at initialize and is not updatable after install** — a wrong program bricks every tally read path and only a reinstall fixes it.            | `CrispVotingViews.t.sol::test_initializeRevertsOnZeroCrispProgram`                  |

INV-29 is **deliberately deferred** during the phased mainnet rollout (`DISARM_ADMIN=false`), from
phase 1 until phase 3. Treat the armed bootstrap as a dated exception with an intended disarm date,
not as a finding — but INV-31 applies for that whole window.

Three invariants are **not** enforceable by a test and need a human check: the foundation body must
be a **multisig, not an EOA** (`SECURITY.md` runbook), an Admin successor must be a multisig for the
same reason (`grantAdminTo()` guards this, but `ADMIN_SUCCESSOR_ALLOW_EOA` can bypass it), and the
CRISP server must be honest about the eligible-voter set (documented trust assumption).

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
- **The voting window is never per-proposal.** Both processes use their stage-configured window
  (the SPP calls the body with `endDate = start + stage.voteDuration`; 5 days on mainnet). CRISP
  used to accept a creator-chosen `votingDuration` in `_data`, but an unbounded window could
  outlive the stage's `maxAdvance` expiry — a validly tallied vote that could never execute, fee
  already burned — so `_data` now carries only the `allowFailureMap`.
- **`EXECUTOR_ADDRESS` is a stateless contract, NOT the foundation multisig.** It is
  `@aragon/osx-commons-contracts` `Executor` — no owner, no state, no permissions — and the bodies
  **delegatecall** into it (INV-5) so `reportProposalResult` reaches the SPP with the body as
  `msg.sender`. Pointing it at a Safe makes the Safe's code run in the plugin's storage context;
  every body execution then reverts. Verified by `make simulate-body-execution`.
- **`FOUNDATION_ADDRESS` and `ADMIN_DRIVER_ADDRESS` are different roles.** The first is the
  stage-1 approval body, baked into the SPP stage config. The second is who holds
  `EXECUTE_PROPOSAL_PERMISSION` on the Admin plugin, i.e. who must SIGN the emitted Safe files.
  They default to the same address and diverge during a rotation; emitting a file "from" the wrong
  Safe produces a transaction the intended signer cannot execute.
- **Advancing stage 0 has two paths, and only one uses the Executor.** `spp.advanceProposal` reads
  `hasSucceeded()` off the body and never makes it execute; `body.execute(subId)` runs the
  sub-proposal's `reportProposalResult` action through the target config. A simulation that only
  does the former passes with a completely wrong `EXECUTOR_ADDRESS` — cover both.
- **Foundation approval ARMS execution, it does not schedule it.** `advanceProposal` on the last
  stage checks `EXECUTE_PROPOSAL_PERMISSION` on the SPP, which the SPP's setup grants to
  `ANY_ADDR` — so once the foundation reports its Approval, **any address** may execute, at any
  moment up to `stage entry + maxAdvance` (5 days in the mainnet config). Approving early means a
  stranger can still execute at the very end of that window, against a DAO state that has moved on. The approval is withdrawable by
  re-reporting while unexecuted (`_processProposalResult` plainly overwrites
  `bodyResults[id][stage][sender]`), but that is a race against anyone's execute, not a veto.
  Measured by `make simulate-approval-window`.
- **Installing TokenVoting post-hoc opens a bypass window; never split the apply from the
  wiring.** `TokenVotingSetup.prepareInstallation` grants `CREATE_PROPOSAL_PERMISSION` to
  `ANY_ADDR` (behind a `VotingPowerCondition`) **and** `EXECUTE_PERMISSION` on the DAO to the body.
  Between an `applyInstallation` and a later wiring transaction, any qualifying token holder can
  propose on the body and execute straight onto the DAO — INV-2's exact failure. `createDao` has no
  such window because the factory installs atomically; the PSP path does.
  `InstallPublicProcess.emitApplyAndWire` bundles the ROOT grant, both applies, the ROOT revoke and
  the whole wiring into one `admin.executeProposal`.
- **Prepared permissions can carry a condition, and it is hashed into the setup id.** Both the
  TokenVoting and SPP installs return a `GrantWithCondition`. Rebuilding the permission list with
  `NO_CONDITION` yields a setup id `applyInstallation` rejects. `read-prepared.sh` emits
  `<PREFIX>_PERM_CONDITIONS` and `SafeActions._loadPrepared` reads it; guarded by
  `SafeActionsPrepared.t.sol`.
- **`vm.setEnv` is process-global and forge runs test functions concurrently.** Two tests that set
  the same env key race each other and fail only when the suite runs as a whole — passing in
  isolation under `--match-test`. Give each test its own key prefix.
- **Do not use `deal()` on FOLD in a fork.** `stdstore` probes for the balance slot and on this
  token writes into a total-supply checkpoint instead: `getPastTotalSupply` came back as 25x the
  real supply, silently moving the quorum bar. Prank real holders (`SIM_VOTERS`) instead.
- **`VoteOption` is `{None, Abstain, Yes, No}`** — Yes is **2**, not 1. Voting `1` registers an
  abstention, which still counts toward participation but never toward support, so a proposal
  reaches quorum and then fails.
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
- **One env file per network.** `.env.example` is Sepolia; `.env.mainnet.example` is the mainnet
  production set (OSx v1.4.0 factories, `spp.plugin.dao.eth`, production quorum/timings). Every
  target takes `ENV_FILE`, and the whole chain must use the same value:
  `make deploy ENV_FILE=.env.mainnet && make sync-env ENV_FILE=.env.mainnet && make wire-spp ENV_FILE=.env.mainnet`
  (`DEPLOY_LOG` / `APP_ENV_FILE` override the log and frontend env alongside it). Mainnet is
  **not deployable yet** — the template's four `TODO(mainnet)` entries (FOLD, foundation multisig,
  Interfold coordinator, CRISP program) have no mainnet deployment.

## Where things live

| Concern                                                    | Location                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Staged-governance mechanism                                | `docs/architecture.md`                                                          |
| Mainnet rollout runbook (phased public → private)          | `docs/mainnet-deployment.md`                                                    |
| CRISP fork (escrow, fixed stage window, SPP-body wiring)   | `contracts/src/crisp/CrispVoting.sol` + `setup/`                                |
| Deploy (5 plugins + Executor)                              | `contracts/script/DeployInterfoldDao.s.sol`                                     |
| Wiring (stages, grants, delegatecall, disarm, rotation)    | `contracts/script/WireSpp.s.sol`                                                |
| Phase-2 install of the private process into a live DAO     | `contracts/script/InstallPrivateProcess.s.sol`                                  |
| Public process into an existing Admin-only DAO (mainnet)   | `contracts/script/InstallPublicProcess.s.sol`                                   |
| Multisig-signable actions (Safe Transaction Builder files) | `contracts/script/SafeActions.s.sol` · `contracts/script/read-prepared.sh`      |
| Canonical-plugin install encoders                          | `contracts/script/{TokenVotingInstall,SppInstall}.sol`                          |
| SPP frontend module (stages, veto, advance)                | `app/plugins/spp/`                                                              |
| Private / public body UIs                                  | `app/plugins/crispVoting/` · `app/plugins/tokenVoting/`                         |
| Fee escrow UI                                              | `app/plugins/crispVoting/{hooks/useFeeCredits.ts,components/feeCreditCard.tsx}` |
| Unified list / detail shell                                | `app/plugins/governance/`                                                       |

## Production rules

- **No credential may carry a `NEXT_PUBLIC_` prefix.** Next inlines those into the client bundle.
  `PINATA_JWT` and `ETHERSCAN_API_KEY` are server-only and are read exclusively by
  `app/pages/api/ipfs/pin.ts` and `app/pages/api/etherscan.ts`; the browser calls those routes.
  CI's `secret-hygiene` job fails the build if this is violated. See [`SECURITY.md`](SECURITY.md).
- **The CRISP setup mints nothing.** The fresh-token and wrap paths were removed from
  `CrispVotingSetup`: only an existing IVotes token installs, anything else reverts, and no
  install shape may request a mint permission. Guarded by tests; do not reintroduce the paths.
- **Testnet scaffolding is env-gated.** The faucet button renders only when
  `NEXT_PUBLIC_ENABLE_FAUCET=true`. Anything testnet-only must be gated the same way.
- **CI lives at the repo root** (`.github/workflows/ci.yml`) and runs contracts + app + secret
  hygiene. A workflow under `app/.github/` is never executed by GitHub — that trap already cost
  this repo a silently-dead CI.
- **Verify permissions after every deploy.** The runbook is in [`SECURITY.md`](SECURITY.md):
  only the SPPs may hold `EXECUTE_PERMISSION`, Admin must be disarmed, the deployer must not
  retain `ROOT`. While the bootstrap is armed on purpose, also verify **who can drive it**
  (`EXECUTE_PROPOSAL_PERMISSION` on the Admin plugin) — the runbook has that check too.

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
