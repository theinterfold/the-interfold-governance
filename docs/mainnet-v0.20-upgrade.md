# Mainnet cutover to Interfold v0.20.0 (runbook)

This runbook moves the mainnet Interfold protocol and the private governance process of the
Interfold DAO from Interfold v0.19 to Interfold v0.20.0 and CRISP 0.29.0. It gives the complete
order across three repositories. Each step names the detailed document when one exists.

The work has three parts:

1. **Protocol.** Upgrade the Interfold contracts in place, through the DAO. The DAO owns every
   proxy, so the foundation Safe signs one cutover batch through the Admin plugin.
2. **CRISP plugin.** Publish build 4 of the CRISP plugin into the existing plugin repo.
3. **DAO install.** Install a new private pair (CRISP body and private SPP) from build 4, and
   remove the powers of the v0.19 pair, in one transaction.

Mainnet does not use Aztec. The public process (TokenVoting and its SPP) does not change.

Requests are paused from step B1 to step B7. During that time nobody can create a private
proposal, and no E3 runs.

---

## Current state, verified on chain 2026-11-27

| What | Value |
|---|---|
| DAO (protocol owner, owner of every ProxyAdmin) | `0x652a31c669f9AB37f6040f279139a75D04F2679e` |
| Foundation Safe (drives the Admin plugin) | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593` |
| Admin plugin (holds `EXECUTE_PERMISSION` on the DAO) | `0xF21e25455988887EE797050080141eba67B33920` |
| Interfold (proxy) | `0x28cF63B459e6218C69EA97ea7D90541cf648c715`, ProxyAdmin `0xB3985D7fF844FA0F5E0aaC5feb5DD8BE15e88580`, implementation `0xA1FAB087d7315d2220910C6e0dEcaf659F3f4d2d` |
| CiphernodeRegistry (proxy) | `0xC927A5B2d8F68697bC28C0670df05178c93df2d7` |
| BondingRegistry (proxy) | `0x0ec90465095C21830BEcED07e032809A2Bd2915F` |
| Release policy | protocol 8, generation 2 |
| Parameter sets | index 2 (v0.19 secure-8192) is active. Index 3 is empty |
| Requests | open (`requestsPaused()` is `false`). `activeE3Count()` is 0. `unreleasedCommitteeCount()` is 1 |
| Timing windows | randomness 3600 s, sortition 600 s, DKG 21600 s, compute 604800 s, decryption 21600 s |
| Active operators | 46 (`numActiveOperators()`). The Small committee needs 19 |
| CRISP program | `0x1EA4dBdec0F2F1E9235915847fc59EF4045EEe28` (v0.19, OpenVM) |
| CRISP plugin repo | `0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1`, release 1, builds 1 to 3 |
| Private pair (v0.19) | body `0xf101fB197E38f6b3Ca110D619D845634CD88098c` (build 3), SPP `0xc19635aD8De0a0D6430025fC5ed212CA8216bab3`. 2 proposals |
| Earlier private pair | body `0x197be4E09614285Abb4b74b672377c404FD44d54`, SPP `0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`. No permissions. 3 proposals |

Read these values again on the day of the cutover. A value that differs changes the steps.

## Target state

| What | Value |
|---|---|
| Interfold | the v0.20.0 implementation, behind the same proxy |
| CiphernodeRegistry | the v0.20.0 implementation, behind the same proxy |
| Release policy | protocol 10, generation 2 |
| Parameter set | index 3, secure-8192. `keccak256(paramSetRegistry(3))` is `0x4f4025982214c2149028270dccc0ad45c24c2441a3496cdf1a29f5d1e1b908c3`. Indices 0 to 2 keep their bytes |
| Crypto config id (secure-8192, Small) | `0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891` |
| CRISP program | a new CRISP 0.29.0 OpenVM program, registered and bound. `0x1EA4…EE28` is retired |
| CRISP plugin | build 4: implementation `0x5a2C6560F9Fc908f78F39091cbcD793F797c7f3b`, setup `0x5F6Cba5Cb75680B31066DD3932EbcB22fb5c4349` |
| Private pair | a new body and SPP from build 4. Parameter set 3, Small committee, 71 FOLD voter minimum |
| Nodes | Interfold v0.20.0 (storage schema 9). Each node resets its state before the first start |

The cutover does not change the timing windows. Voting on a new private proposal starts about
7 h 10 min (25800 s) after the proposal, as it does today.

---

## Before you start (go / no-go)

Do not start step B1 until each item is true.

- [ ] **Sepolia passed a full round with votes.** A governance proposal on the testnet DAO got
      ballots, a decrypted tally and an execution on Interfold v0.20.0. Until then, compute,
      decryption and the tally have no evidence on v0.20.0. This check is partial: the testnet DAO
      votes on Aztec with insecure-64 and a mock compute verifier. Mainnet uses the L1 CRISP
      program, secure-8192 and a real OpenVM prover, which no testnet runs. Only the first real
      mainnet private proposal proves that path (Phase C).
- [ ] **The node release is published.** The Interfold v0.20.0 binaries, the circuit archive and
      the DAppNode package are public. `pnpm -w store:circuits verify-release` passes in the v0.20.0
      checkout.
- [ ] **This branch is merged** into `main` of this repository: the plugin change
      (`InterfoldCryptoConfig`), the mainnet env template, the build 4 publication batch and the
      app on `@crisp-e3/sdk` 0.29.0 and `@interfold/sdk` 0.20.0.
- [ ] **The services are ready.** A CRISP server image built from CRISP 0.29.0, and a program
      server that proves the CRISP 0.29.0 guest (private-install-runbook.md, Step 6).
      [NEEDS TECHNICAL INPUT: the owner and the hosts of the mainnet CRISP server and program
      server.]
- [ ] **The operators know the date.** Each operator must stop its node, back up the data, and
      reset the state with the v0.20.0 binary. At least 19 eligible bond owners must run v0.20.0
      before step B7 can resume requests.
- [ ] **The deployer EOA has ETH.** Steps A1 and B3 deploy contracts from an operator key, not from
      the Safe.
- [ ] **The rehearsals of step A3 passed** on a mainnet fork, with the exact files that the Safe
      signs. They are mandatory: Sepolia was redeployed for v0.20.0, so no live network ran the
      in-place cutover.

Checkouts:

| Repository | Revision | Path in this runbook |
|---|---|---|
| `theinterfold/interfold` | tag `v0.20.0` | `$INTERFOLD` |
| `theinterfold/CRISP` | release 0.29.0 (`main` after PR #25) | `$CRISP` |
| `theinterfold/the-interfold-governance` | `main` after this branch | `$GOV` |

Run `pnpm install` in `$INTERFOLD` and `$CRISP`. Set `RPC_URL` to a mainnet RPC.

---

## Phase A: preparation (requests stay open)

### A1. Deploy the CRISP 0.29.0 program (CRISP repository)

The cutover batch registers the program that `$CRISP/packages/crisp-contracts/deployed_contracts.json`
records under `mainnet`. Deploy it first, with deferred wiring: the DAO batch registers and binds
it.

1. Compile the OpenVM guest at the release and keep its identity (`appExeCommit`, `appVmCommit`
   and `halo2RuntimeCodeHash`) in a file, for example `openvm-identity.json`. Step B3 checks the
   chain against it.
2. Deploy:

   ```bash
   cd "$CRISP/packages/crisp-contracts"
   CRISP_INITIAL_OWNER=0x652a31c669f9AB37f6040f279139a75D04F2679e \
   INPUT_AVAILABILITY_SIGNER=<address of the mainnet CRISP server key> \
   DEFER_PROTOCOL_WIRING=true ALLOW_MAINNET_DEFERRED_WIRING=true \
   PRIVATE_KEY=<deployer key> \
   pnpm deploy:contracts --network mainnet
   ```

   Mainnet refuses every mock verifier and mock data availability. The OpenVM settings come from
   the guest that step 1 compiled, unless `OPENVM_*` settings name an existing verifier.
3. Commit the new `mainnet` records of `deployed_contracts.json` in a CRISP pull request.
4. Check the program. Expect the DAO as owner, no Interfold yet, and the image ID of the compiled
   guest:

   ```bash
   P=<new CRISP program>
   cast call $P 'owner()(address)' --rpc-url "$RPC_URL"
   cast call $P 'interfold()(address)' --rpc-url "$RPC_URL"   # expect 0x000…000
   cast call $P 'imageId()(bytes32)' --rpc-url "$RPC_URL"
   ```

### A2. Publish CRISP plugin build 4 (this repository)

Follow [publish-crisp-build.md](./publish-crisp-build.md). In short:

1. In `$GOV/contracts`, regenerate the batch from `main`:

   ```bash
   cp .env.mainnet.install .env.mainnet   # then add RPC_URL
   make safe-publish-crisp-build ENV_FILE=.env.mainnet
   ```

   Compare the printed implementation and setup with the table of publish-crisp-build.md. If they
   differ, stop and find the cause.
2. Do the checks of "Verify before signing" and "Reproduce the compiled bytecode".
3. The foundation Safe executes `safe-actions/12-publish-crisp-build.json` (3 direct calls, not
   through the Admin plugin).
4. Read `VersionCreated` from the receipt. Expect release 1, build 4. Set `CRISP_BUILD` in
   `.env.mainnet` to that build.

The publication changes no installed plugin. It can run any time before step B4.

### A3. Rehearse on a mainnet fork

1. **Protocol cutover.** The simulation temporarily overwrites the `mainnet` entry of the CRISP
   checkout's `deployed_contracts.json`, which step A1 just recorded. Give it a throwaway copy:

   ```bash
   git -C "$CRISP" worktree add --detach /tmp/crisp-sim HEAD
   (cd /tmp/crisp-sim && pnpm install)
   cd "$INTERFOLD/packages/interfold-contracts"
   FORK_URL="$RPC_URL" LOG_RPC_URL=<mainnet RPCs with log history> \
     pnpm upgrade:v19:simulate -- --crisp-dir /tmp/crisp-sim
   ```

   It releases ended committees, prepares and executes the cutover batch as the protocol owner,
   refreshes the operators, writes and executes the resume batch, and validates each stage. Read
   the plan that it prints: protocol 10 and generation 2, parameter set 3, the two upgraded
   implementations and the retired program `0x1EA4…EE28`. It uses a stub Halo2 verifier, so it
   proves the wiring, not the proofs.
2. **The Safe path.** The simulation calls the contracts as the protocol owner directly, so it does
   not test the Safe → Admin plugin → DAO path. On an `anvil --fork-url "$RPC_URL"` fork,
   impersonate the foundation Safe and send the B1 data to the Admin plugin
   `0xF21e25455988887EE797050080141eba67B33920`. Expect `requestsPaused()` to be `true`. Then import
   the Aragon Safe Builder file of the cutover batch and the unpause file the same way, and expect
   each to execute.
3. **Plugin publication and install.** On the same kind of fork, impersonate the foundation Safe.
   Execute the files of step A2 and of private-install-runbook.md, Steps 1 to 4. Then do the checks
   of its Step 5. Use the CRISP program of the protocol rehearsal, or a stand-in address. Record
   the result in the "Rehearsal record" of
   [private-install-runbook.md](./private-install-runbook.md).

---

## Phase B: cutover (requests paused)

### B1. Pause requests

The Safe calls the Admin plugin, which makes the DAO call `Interfold.setRequestsPaused(true)`.
Build the call:

```bash
IFOLD=0x28cF63B459e6218C69EA97ea7D90541cf648c715   # the coordinator; the other runbooks use I for other values
PAUSE=$(cast calldata 'setRequestsPaused(bool)' true)
cast calldata 'executeProposal(bytes,(address,uint256,bytes)[],uint256)' \
  0x "[($IFOLD,0,$PAUSE)]" 0
```

In the Safe Transaction Builder, send this data to the Admin plugin
`0xF21e25455988887EE797050080141eba67B33920` with value 0. Then check:

```bash
cast call $IFOLD 'requestsPaused()(bool)' --rpc-url "$RPC_URL"   # expect true
```

### B2. Drain the protocol

The cutover needs no active E3 and no unreleased committee.

```bash
R=0xC927A5B2d8F68697bC28C0670df05178c93df2d7
cast call $IFOLD 'activeE3Count()(uint256)' --rpc-url "$RPC_URL"           # need 0
cast call $R 'unreleasedCommitteeCount()(uint256)' --rpc-url "$RPC_URL" # need 0
```

An E3 that is still running must end (complete, or fail at its deadline) first. For each ended E3
whose committee is not released, anyone can call `releaseCommittee(e3Id)` on the registry:

```bash
cast send $R 'releaseCommittee(uint256)' <e3Id> --rpc-url "$RPC_URL" --private-key <any funded key>
```

On 2026-11-27 one committee was not released: E3
`18458939420885977824981152629962741023865184457287647280899939019117062782980` (round 4, stage
5, Complete). An `eth_call` of `releaseCommittee` for it from an arbitrary address succeeded, so
anyone can release it now:

```bash
cast send $R 'releaseCommittee(uint256)' \
  18458939420885977824981152629962741023865184457287647280899939019117062782980 \
  --rpc-url "$RPC_URL" --private-key <any funded key>
```

### B3. Prepare and execute the cutover batch (Interfold repository)

The v0.20.0 release keeps the `upgrade:v19` command names. From
`$INTERFOLD/packages/interfold-contracts`, with the deployer key in `PRIVATE_KEY`:

```bash
pnpm upgrade:v19 -- --network mainnet \
  --crisp-deployments "$CRISP/packages/crisp-contracts/deployed_contracts.json" \
  --openvm-identity openvm-identity.json \
  --input-availability-signer <address of the mainnet CRISP server key>
```

The command stops when requests are open or the protocol is not drained. It deploys the new
Interfold implementation with its libraries, the CiphernodeRegistry implementation and the BFV
verifier routes. Then it writes a plan (`deploy/protocol/mainnet.v19-cutover.json`) and one
governance batch. In execution order, the batch:

1. upgrades Interfold and CiphernodeRegistryOwnable in place;
2. registers parameter set 3 and each committee threshold that differs;
3. installs the PK and decryption verifier routers (and the ciphertext verifier when it differs);
4. registers the CRISP 0.29.0 program, retires `0x1EA4…EE28` and binds the new program to
   Interfold;
5. requires protocol 10 and generation 2;
6. keeps requests paused.

The foundation Safe imports the Aragon Safe Builder file that the command names (the batch wrapped
in one `admin.executeProposal`). Decode it and compare each action with the list above. Execute it
with a gas limit well above the estimate.

After execution:

```bash
pnpm upgrade:v19:validate -- --network mainnet
pnpm upgrade:v19:validate -- --network mainnet --write-records
cast call $IFOLD 'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
# expect 0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891
cast keccak "$(cast call $IFOLD 'paramSetRegistry(uint8)(bytes)' 3 --rpc-url "$RPC_URL")"
# expect 0x4f4025982214c2149028270dccc0ad45c24c2441a3496cdf1a29f5d1e1b908c3
```

`validate` only reads and can run again. Commit the records that `--write-records` changes in an
Interfold pull request.

### B4. Install the new private pair (this repository)

Follow [private-install-runbook.md](./private-install-runbook.md), Steps 0 to 5. Its values are
already the v0.20 values: parameter set 3, build 4, and the v0.19 pair as the pair to retire. The
foundation Safe signs one `admin.executeProposal`. It installs the new body and SPP, wires the
stages and the creation rule, and removes the powers of the v0.19 pair.

### B5. Update the services and the app

Follow [private-install-runbook.md](./private-install-runbook.md), Step 6:

- CRISP server: the CRISP 0.29.0 image, the new program, `E3_PARAM_SET=3`, `E3_COMMITTEE_SIZE=2`.
- Program server: a prover for the CRISP 0.29.0 guest.
- App (`governance.theinterfold.com`): the new body, SPP and program, and both retired pairs. Then
  redeploy the app.

Do this before step B7. An old CRISP server cannot make valid rounds against the new program.

### B6. Bring the nodes back

1. Each operator stops its node, backs up the data, resets the state with the v0.20.0 binary and
   starts it ([Reset node state](https://docs.theinterfold.com/operate/upgrades#reset-node-state)).
   On its first start the node acknowledges the release on chain.
2. Refresh the operators that did not refresh themselves:

   ```bash
   pnpm upgrade:v19:refresh -- --network mainnet
   ```

3. Wait for a later block. Confirm with the operators that their nodes run v0.20.0 and reach each
   other. The command does not check running processes.

### B7. Resume requests

```bash
pnpm upgrade:v19:resume -- --network mainnet --ciphernodes-restarted
```

The command validates the cutover again, checks that the refreshed owner capacity covers the Small
committee (19), and writes the unpause batch. The foundation Safe executes it. Then check:

```bash
cast call $IFOLD 'requestsPaused()(bool)' --rpc-url "$RPC_URL"   # expect false
```

---

## Phase C: after resume

1. Fork-simulate a private proposal against the live coordinator: create and vote
   (private-install-runbook.md, Step 7). A fork gives no tally.
2. Set `CRISP_VOTING_PLUGIN_ADDRESS` and `SPP_PRIVATE_ADDRESS` in `.env.mainnet` to the new pair,
   and update `.env.mainnet.install` in a pull request.
3. Run the first real private proposal on mainnet to its end: ballots, compute with the real OpenVM
   prover, threshold decryption, tally and execution. It is the only end-to-end proof of the
   mainnet path (L1 CRISP program, secure-8192). It is the gate for the announcement.
4. Keep the Admin bootstrap armed until that proposal completes. Then announce the cutover and
   disarm the bootstrap (private-install-runbook.md, Step 7).

---

## Changing the committee size later

The DAO holds `MANAGER_PERMISSION` on the new body. A DAO proposal with one action changes the E3
settings of new private proposals, without a new plugin build:

```bash
cast calldata 'updateE3Settings(uint8,uint8,bytes)' <committee size> 3 <compute provider params>
# target: the new body (CRISP_VOTING_PLUGIN_ADDRESS), value 0
```

| Committee size | Ordinal | Mainnet threshold | Crypto config id (parameter set 3) |
|---|---|---|---|
| Minimum | 0 | 2 of 3 | `0x0acc89be9b1f39b0c1ee06493af3bad6f5685bf60e0f1cec7a733e95caaab87a` |
| Micro | 1 | 5 of 9 | `0xebe75e3c1ada2079e5a06e5853d710b67ac296959c6b67f7d82b44312574dd0b` |
| Small (installed) | 2 | 14 of 19 | `0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891` |
| Large | 3 | none (see below) | `0xf8ddf924e1ef60bf63d14a2bb39c7c259b4b054e75f6e2baf07bb268462d13ed` |

- Proposals that exist keep the settings of their creation: each one requested its E3 then.
- `updateE3Settings` does not check the values. The install-time mainnet policy (Small, parameter
  set 3) does not apply to it. With a pair that Interfold does not support, the body's
  `createProposal` reverts at `Interfold.request`. The SPP catches that revert: the SPP proposal
  exists, but its private stage gets no vote and cannot advance. This continues until a second
  update fixes the pair. Read the current compute provider params with `getE3Settings()` and pass
  them again unchanged.
- Before the DAO votes on the change, rehearse it on a mainnet fork: impersonate the DAO, call
  `updateE3Settings`, then create a private proposal on the SPP and check that the body has its
  sub-proposal (`SubProposalCreated`). `getE3Quote` on Interfold is not enough: it checks the
  parameter set and the pricing, not the crypto config id.
- A smaller committee needs fewer operators and gives less security: fewer nodes must collude to
  decrypt.
- **Large (34 of 45).** Build 4 knows the Large id, so no new plugin build is needed. The Interfold
  v0.20.0 contracts admit Large on mainnet once governance sets its threshold
  (`setCommitteeThresholds(3, [34, 45])`) and the secure-8192/large verifier routes are installed.
  The v0.20.0 mainnet tooling does neither: `MAINNET_BFV_CONFIGS` and
  `mainnet-protocol.config.json` list Minimum, Micro and Small only, so step B3 routes and
  thresholds those three. Mainnet Large therefore needs a protocol batch that adds both, before the
  DAO switches the body to Large. It also needs at least 45 eligible bond owners, and each node at
  least 28 GiB of memory for the secure-8192 Large key aggregation.

## If a step fails

- **Before B3 executes:** nothing has changed except the paused requests and the published build.
  A published build changes no installed plugin. To go back, unpause with
  `setRequestsPaused(false)` through the Admin plugin.
- **After B3 executes:** there is no rollback to v0.19. The Interfold release policy is
  forward-only: required counters never decrease, and a fix ships as a later release under a
  higher protocol version ("Releases, protocol cutovers, and rollback",
  `docs/architecture/upgrades.md` in the Interfold repository). These B3 changes cannot be undone:
  - parameter set 3 stays registered (registration is append-only);
  - the release policy stays at protocol 10, so v0.19 nodes cannot rejoin;
  - the v0.19 program `0x1EA4…EE28` stays retired, and the BFV verifier routes stay the v0.20
    routes. Pointing the proxies back to v0.19 alone would not let v0.19 private proposals request
    an E3 again.

  Keep requests paused, find the cause, and fix it forward. Each node keeps the backup that it made
  in step B6 for a controlled reset, not to return to v0.19.
- **B4 reverts:** the batch is atomic, so the DAO does not change. Fix the cause, generate the file
  again, and sign again.

## Not in this cutover

- **Bond-owner identity gate** (`upgrade:identity`). The v0.20.0 nodes read eligibility with
  `eligibilityAt`, which the v0.19 BondingRegistry has. The gate is a separate governance decision.
- **BondingRegistry upgrade.** The cutover batch upgrades Interfold and CiphernodeRegistry only. The
  BondingRegistry, which holds every bond, keeps its v0.19 implementation. v0.20.0 adds two views
  to it (`unresolvedCommitteesOf`, `committeeObligationAt`). No contract calls them, and the node
  falls back to the `CommitteeObligationUpdated` events when a registry does not have them.
- **Timing windows.** `upgrade:v19` does not change them, and `validate` compares them with
  `mainnet-protocol.config.json`. Both hold the same values today.
