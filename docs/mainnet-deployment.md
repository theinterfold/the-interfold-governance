# Mainnet deployment runbook

Operational instructions for taking the Interfold DAO to Ethereum mainnet in two phases:

- **Phase 1 — public governance.** DAO + mainnet FOLD + TokenVoting body + one SPP (public
  process) + Admin bootstrap. Live, usable governance with the foundation gate.
- **Phase 2 — private governance.** Add the CRISP body + a second SPP (private process) to the
  **live** DAO. No redeploy, same DAO, same token.
- **Disarm.** A separate, explicit step once you are done installing.

Read [`architecture.md`](architecture.md) for the mechanism and [`../SECURITY.md`](../SECURITY.md)
for the trust model. This document is the sequence; those two are the _why_.

---

## Why phase it

The private process depends on infrastructure that does not exist on mainnet yet: an Interfold E3
coordinator, a CRISP program, and a ciphernode set. The public process depends on none of it.
Splitting means public governance can go live on its own schedule instead of waiting on the CRISP
stack, and phase 2 becomes an ordinary install rather than a migration.

Phase 2 runs through the **Admin bootstrap**, so it needs no vote. That is the reason phase 1 leaves
the bootstrap armed (`DISARM_ADMIN=false`) — and the reason the gap between the phases carries real
risk. See [the Admin bootstrap](#the-admin-bootstrap-armed-between-the-phases).

---

## Decisions to make before you start

| Decision                       | Options                                | Note                                                                                                                       |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Foundation address             | Safe / other multisig                  | **Never an EOA.** In `approval` mode a lost key freezes governance permanently — every future proposal expires unapproved. |
| Stage-1 mode                   | `approval` (opt-in) / `veto` (opt-out) | Template defaults to `approval`. Changeable later by proposal, no redeploy.                                                |
| `TV_MIN_PROPOSER_VOTING_POWER` | `0` / non-zero                         | `0` = anyone can open a proposal. Left at `0` in the template and flagged; decide deliberately for mainnet.                |
| FOLD distribution at go-live   | —                                      | Quorum is 10% of **total supply**. If supply is minted but undistributed, quorum may be unreachable in practice.           |

### The Admin bootstrap, armed between the phases

The Admin plugin lets one EOA execute anything on the DAO with no vote. In the single-phase (Sepolia)
flow, `wire-spp` revokes it as its final action ([INV-29](../AGENTS.md#governance-structure)).

The phased mainnet flow sets `DISARM_ADMIN=false`, so phase 1 leaves it **armed** and phase 2 can
install plugins in one transaction. For the whole window between the phases, that key can re-grant
permissions, move treasury funds, or replace plugins. Concretely:

- **Keep the treasury empty until phase 2 is done.** An armed bootstrap over a funded DAO is a
  single point of total failure.
- **Hold the deployer key as carefully as the foundation multisig** for that window — it is
  strictly more powerful.
- **Disarm as soon as installation is finished**, and verify with the
  [runbook](../SECURITY.md#deployment-verification-runbook).

Disarming is never automatic: no deploy and no install performs it. It is its own command
(`make disarm-admin`), so it is always a deliberate, reviewed action — and so a failed install never
has to be untangled from an irreversible revoke.

If phase 2 is deferred or abandoned, run `make disarm-admin` anyway. Once disarmed, further installs
must go through a governance proposal instead (`make print-private-actions` emits the calldata).

---

## Phase 1 — public governance

### Preconditions

- [ ] FOLD deployed on mainnet, `ERC20Votes`/`IVotes`. Note its ERC-6372 clock mode — if
      `mode=timestamp`, snapshots are timestamps, not block numbers
      ([INV-19](../AGENTS.md#cross-boundary-sync-contract--server--app)).
- [ ] Foundation multisig deployed, signers confirmed, threshold set.
- [ ] Deployer funded. The `createDao` call installs three plugins in one transaction — budget
      generously and check gas prices.
- [ ] `make test` green.
- [ ] `contracts/.env.mainnet` created from `.env.mainnet.example`, with `FOLD_TOKEN_ADDRESS`,
      `FOUNDATION_ADDRESS`, `RPC_URL` and `PRIVATE_KEY` filled. The CRISP `TODO(mainnet)` entries
      stay empty — phase 1 does not read them.
- [ ] `DEPLOY_PRIVATE_PROCESS="false"` and `DISARM_ADMIN="false"` in that file (both are the
      template defaults).

### Re-verify the framework addresses

The template's Aragon addresses were verified on-chain, but Aragon can publish new builds. Confirm
before broadcasting:

```bash
export M=$RPC_URL   # mainnet
MGMT=0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA

# Both must be true — the factories must still be authorized on the registries.
cast call $MGMT "hasPermission(address,address,bytes32,bytes)(bool)" \
  0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e 0x246503df057A9a85E0144b6867a828c99676128B \
  $(cast keccak "REGISTER_DAO_PERMISSION") 0x --rpc-url $M
cast call $MGMT "hasPermission(address,address,bytes32,bytes)(bool)" \
  0x5B3B36BdC9470963A2734D6a0d2F6a64C21C159f 0xcf59C627b7a4052041C4F16B4c635a960e29554A \
  $(cast keccak "REGISTER_PLUGIN_REPO_PERMISSION") 0x --rpc-url $M

# Builds must still match the .env pins (TokenVoting 1/4, SPP 1/1, Admin 1/2).
cast call 0xb7401cD221ceAFC54093168B814Cc3d42579287f "buildCount(uint8)(uint16)" 1 --rpc-url $M
cast call 0x421FF506E4DC17356965565688D62b55Bf2bf0a5 "buildCount(uint8)(uint16)" 1 --rpc-url $M
cast call 0xA4371a239D08bfBA6E8894eccf8466C6323A52C3 "buildCount(uint8)(uint16)" 1 --rpc-url $M
```

If a build count has moved, the new build is **not** automatically safe — the pinned tag is what was
reviewed. Investigate before bumping.

### Steps

Strict order. Every step except `sync-env` broadcasts.

Both flags live in `.env.mainnet`, not on the command line — the recipes source the env file last,
so a file value overrides a `make VAR=...` override.

```bash
cd contracts

# 1. Simulate. Read the trace — confirm THREE plugin installations and no CRISP.
make predeploy ENV_FILE=.env.mainnet

# 2. Deploy.
make deploy ENV_FILE=.env.mainnet DEPLOY_LOG=deploy.mainnet.log

# 3. Write the addresses back into .env.mainnet and app/.env.
#    Prints a note that no private process was deployed — that is expected here.
make sync-env ENV_FILE=.env.mainnet DEPLOY_LOG=deploy.mainnet.log

# 4. Wire stages + permissions. With DISARM_ADMIN=false this does NOT disarm the bootstrap.
make wire-spp ENV_FILE=.env.mainnet
```

Between 3 and 4, **read the diff** to `.env.mainnet`. Step 4 emits 4 actions (public-only, no
disarm) and prints a warning that the bootstrap is still armed.

### Verification (do not announce before this passes)

Run the full runbook in [`../SECURITY.md`](../SECURITY.md#deployment-verification-runbook), plus:

```bash
EXEC=$(cast keccak "EXECUTE_PERMISSION"); ROOT=$(cast keccak "ROOT_PERMISSION")
has() { cast call $DAO "hasPermission(address,address,bytes32,bytes)(bool)" $DAO $1 $2 0x --rpc-url $M; }

has $SPP_PUBLIC_ADDRESS          $EXEC   # MUST be true  — the SPP is the only governance executor
has $TOKEN_VOTING_PLUGIN_ADDRESS $EXEC   # MUST be false — revoked by wire-spp (INV-2)
has $DEPLOYER_ADDRESS            $ROOT   # MUST be false

has $ADMIN_PLUGIN_ADDRESS        $EXEC   # true HERE — armed on purpose until phase 2 (INV-29
                                         # is deliberately deferred; re-check after disarming)

cast code $FOUNDATION_ADDRESS --rpc-url $M | wc -c   # 3 == EOA == STOP
```

Then a **live dry run** before any real proposal: create a throwaway signaling proposal on the
public SPP, vote it through, confirm it reaches stage 1, and confirm the foundation multisig can
report its result. Do it while the treasury is still empty — which, with the bootstrap armed, it
should be regardless.

### Frontend

`sync-env` writes `app/.env`. Confirm before deploying the app:

- [ ] `NEXT_PUBLIC_ENABLE_FAUCET` unset or `false` — testnet scaffolding
      ([INV-28](../AGENTS.md#operational)).
- [ ] No credential carries a `NEXT_PUBLIC_` prefix ([INV-27](../AGENTS.md#operational)); CI's
      `secret-hygiene` job enforces this.
- [ ] `PINATA_JWT` and `ETHERSCAN_API_KEY` set server-side only. If either was ever exposed,
      **rotate it** — removing it from code does not un-publish it.
- [ ] The app must tolerate a DAO with no private process: no CRISP plugin address is configured in
      phase 1. Verify the list and detail views render without it before go-live.

---

## Phase 2 — add the private process

Runs against the live DAO once the mainnet CRISP stack exists. The DAO, FOLD, public process and
all history are untouched.

### Preconditions

- [ ] Mainnet Interfold E3 coordinator deployed; `INTERFOLD_ADDRESS` set.
- [ ] Mainnet CRISP program deployed; `CRISP_PROGRAM_ADDRESS` set, and **confirmed to match the
      program the CRISP server requests E3s against**.
- [ ] Ciphernode set live; `COMMITTEE_SIZE` and `PARAM_SET` confirmed against that stack (the
      template's values are carried over from testnet).
- [ ] CRISP server configured for mainnet, and its vote-scaling factor matches
      `CrispVoting._tallyScale()` and the app — a three-way sync
      ([INV-16](../AGENTS.md#cross-boundary-sync-contract--server--app)).
- [ ] Fee token confirmed; decimals read on-chain, never assumed ([INV-20](../AGENTS.md#cross-boundary-sync-contract--server--app)).

### How the install works

`applyInstallation` authorizes on `msg.sender == dao` (`PluginSetupProcessor._canApply`), so the DAO
executing it needs no `APPLY_INSTALLATION_PERMISSION`. It does need the PluginSetupProcessor to hold
`ROOT_PERMISSION` on the DAO while the setup's permission changes are applied — so the batch grants
ROOT and **revokes it in the same transaction**.

`prepareInstallation` is permissionless and does not touch the DAO — an EOA calls it beforehand, and
it returns the plugin address the later `applyInstallation` will install. That address can therefore
be referenced by the wiring actions in the same batch.

Mainnet PluginSetupProcessor: `0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f`
(`PLUGIN_SETUP_PROCESSOR_ADDRESS` in the template).

### Steps

Each step prints values that must be written into `.env.mainnet` before the next one.

```bash
cd contracts

# 1. Deploy CrispVotingSetup + mint the CRISP PluginRepo (EOA; the DAO is not touched).
make publish-crisp-repo ENV_FILE=.env.mainnet
#    -> record the printed repo address as CRISP_PLUGIN_REPO

# 2. prepareInstallation for the CRISP body and the private SPP (EOA; DAO still untouched).
make prepare-private-process ENV_FILE=.env.mainnet
#    -> record ALL SIX printed values:
#       CRISP_VOTING_PLUGIN_ADDRESS  SPP_PRIVATE_ADDRESS
#       PREPARED_CRISP_HELPERS_HASH  PREPARED_SPP_HELPERS_HASH
#       PREPARED_CRISP_PERMISSIONS   PREPARED_SPP_PERMISSIONS

# 3. Admin applies both installs and wires the private process — one tx, no vote.
make install-private-process ENV_FILE=.env.mainnet
```

`applyInstallation` re-derives the prepared setup id from the permissions and helpers hash and
reverts on any mismatch, so paste step 2's values verbatim. They are round-tripped rather than
recomputed precisely so a hand-rolled copy cannot drift from the setup contracts.

Step 3 executes, in order:

| #   | Action                                                                   |
| --- | ------------------------------------------------------------------------ |
| 1   | `dao.grant(dao, PSP, ROOT_PERMISSION)` — temporary                       |
| 2   | `psp.applyInstallation(dao, <CRISP params>)`                             |
| 3   | `psp.applyInstallation(dao, <SPP-private params>)`                       |
| 4   | `dao.revoke(dao, PSP, ROOT_PERMISSION)` — **must not be omitted**        |
| 5   | `sppPrivate.updateStages(stagesFor(crisp, foundation, isPrivate: true))` |
| 6   | `dao.grant(crisp, sppPrivate, CREATE_PROPOSAL_PERMISSION)`               |
| 7   | `crisp.setTargetConfig({target: executor, operation: DelegateCall})`     |

The CRISP body installs with `grantExecuteOnDao: false`. **This is load-bearing**: a body holding
EXECUTE could execute straight from stage 0 and skip the foundation entirely
([INV-2](../AGENTS.md#governance-structure)).

Action 7 points the CRISP body at the **phase-1 Executor** (already deployed; `EXECUTOR_ADDRESS` in
`.env.mainnet`) so `reportProposalResult` reaches the SPP as the body
([INV-5](../AGENTS.md#governance-structure)). Never repoint it at the DAO.

There is **no disarm action in this batch** — see [Phase 3](#phase-3--disarm-the-bootstrap).

> **If the Admin bootstrap was already disarmed**, step 3 cannot run. Use
> `make print-private-actions ENV_FILE=.env.mainnet` to emit the same seven actions as calldata, and
> submit them as a proposal on the public SPP instead — voted through, then approved by the
> foundation at stage 1.

### Verification

```bash
has $SPP_PRIVATE_ADDRESS         $EXEC   # MUST be true  — new SPP is an executor
has $CRISP_VOTING_PLUGIN_ADDRESS $EXEC   # MUST be false — a body must never execute (INV-2)
has $PSP_ADDRESS                 $ROOT   # MUST be false — ROOT was temporary
```

Then confirm minting is DAO-only ([INV-6](../AGENTS.md#governance-structure)), and run one
throwaway private proposal end to end — create, encrypted vote, tally publication, stage-1
approval, execution — before opening it up.

Re-run `make sync-env` so `app/.env` picks up the new plugin addresses, and confirm the frontend
now renders the private path.

---

## Phase 3 — disarm the bootstrap

A separate, explicit step. Nothing else performs it.

```bash
make disarm-admin ENV_FILE=.env.mainnet
```

Run it as soon as you are done installing. Then re-run the full
[verification runbook](../SECURITY.md#deployment-verification-runbook) and confirm:

```bash
has $ADMIN_PLUGIN_ADDRESS $EXEC   # MUST now be false (INV-29)
```

Irreversible without a governance proposal re-granting EXECUTE. After this point every change —
including further plugin installs — goes through the SPP.

Only once this passes is the deployment complete. Announce the DAO address, and fund the treasury.

---

## Failure modes

| Symptom                                        | Cause                                                                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy reverts on `DaoUnauthorized`            | Wrong factory version. Mainnet accepts both v1.3.0 and v1.4.0; the template pins v1.4.0.                                                                                                                                  |
| Public sub-proposal creation reverts           | `SPP_PUBLIC_VOTE_DURATION` below TokenVoting's 1h `minDuration` ([INV-15](../AGENTS.md#stage-configuration-wiresppstagesfor)).                                                                                            |
| Parent proposal created, sub-proposal missing  | Gas estimation. The SPP wraps sub-proposal creation in try/catch, so an under-estimated limit silently swallows `SubProposalNotCreated` and leaves a dead parent. Both create hooks pass explicit gas limits — keep them. |
| Proposal passes stage 0 but never advances     | Approval mode with no foundation approval — silence _is_ the rejection. Check the multisig can actually reach threshold.                                                                                                  |
| Proposal reads `Expired` instead of `Vetoed`   | Expected at the chain level; the UI maps it. See `getSppStatusOverride`.                                                                                                                                                  |
| `install-private-process` reverts on the apply | The `PREPARED_*` values do not match the preparation. Re-run `prepare-private-process` and copy all six again; `applyInstallation` validates them by hash.                                                                |
| `PluginAlreadyInstalled`                       | The install already applied — check whether an earlier attempt partially succeeded before retrying.                                                                                                                       |
| `SetupApplicationUnauthorized`                 | The batch is not executing as the DAO, or the Admin bootstrap was already disarmed. Use `make print-private-actions` and go through a proposal.                                                                           |
| Admin still holds EXECUTE after `disarm-admin` | The tx reverted. Re-check before announcing — this is INV-29.                                                                                                                                                             |

## Rollback

The Admin bootstrap stays armed through phases 1 and 2, so corrections in that window are direct:
re-run a wiring step, or execute a fix through the Admin plugin. That is exactly the power that
makes the window risky — it cuts both ways.

After `make disarm-admin` there is no rollback. Every change, including further plugin installs,
becomes a governance proposal. Do not disarm until phase 2 verification passes.

If phase 1 is unrecoverable, the clean move is to deploy a fresh DAO and abandon the broken one —
plugins are immutable proxies pinned at install. Do not announce a DAO address, or fund it, until
verification passes and the bootstrap is disarmed.
