# Private process replacement runbook (mainnet)

This runbook replaces the **Interfold Protocol Proposal (IPP)** process in the live mainnet DAO
(`0x652a31c669f9AB37f6040f279139a75D04F2679e`). The process gives receipt-free secret-ballot voting
with CRISP. It has two stages, like the public process:

1. **5 days of FOLD-holder voting** with encrypted CRISP ballots. Quorum is 2%, and support must be
   more than 51%. Bonded and vesting-locked FOLD carry weight.
2. **A 5-day Interfold Foundation approval window.** Approved proposals execute on the DAO.

The DAO already has a private process from 2026-09-18. That pair (a CRISP build 2 body and its SPP)
cannot run on the Interfold v0.19 protocol. This runbook installs a new pair from CRISP build 3. The
same transaction removes the powers of the old pair.

All `make` commands run from `contracts/` with `ENV_FILE=.env.mainnet`. Make that file a fresh copy
of the committed `.env.mainnet.install` (Step 1). The Safe files go to `contracts/safe-actions/`.

---

## Current state, verified on chain 2026-10-09

| What                                                | Where                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DAO                                                 | `0x652a31c669f9AB37f6040f279139a75D04F2679e`                                                                                                                                                                                                                                            |
| Foundation Safe (Admin driver)                      | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593`                                                                                                                                                                                                                                            |
| Admin plugin                                        | `0xF21e25455988887EE797050080141eba67B33920`. It is armed: it holds `EXECUTE_PERMISSION` on the DAO (INV-29 deferred)                                                                                                                                                                   |
| CRISP PluginRepo (`interfold-crisp.plugin.dao.eth`) | `0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1`. Release 1 has builds 1 and 2. The Safe is the maintainer                                                                                                                                                                                  |
| Next CRISP build (not published)                    | Generate and check the publication batch from the frozen compiler artifacts. Use its CREATE2 addresses, not predictions from another build. See [publish-crisp-build.md](./publish-crisp-build.md)                                                                                      |
| Installed private process (this runbook retires it) | Body `0x197be4E09614285Abb4b74b672377c404FD44d54` (build 2, program `0x53FC…1BA3`, parameter set 1). SPP `0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`, which holds `EXECUTE_PERMISSION` on the DAO. Installed at block 26006243. 3 proposals, none executed. 35.4272 USDS of fee credit |
| Interfold coordinator                               | `0x28cF63B459e6218C69EA97ea7D90541cf648c715`. `feeToken()` is **USDS** (`0xdC03…384F`). `requestsPaused()` is `true`. `activeCryptoConfigId()` is `0xd9c8…fb4e`, the configuration before v0.19. `paramSetRegistry(2)` is empty                                                         |
| CRISP E3 program                                    | `0x53FC…1BA3` is registered. The OpenVM replacement `0x1EA4dBdec0F2F1E9235915847fc59EF4045EEe28` is deployed with deferred wiring. The v0.19 batch binds and registers it, and retires the RISC Zero program                                                                            |
| Process metadata (pinned)                           | `ipfs://QmSEYaoXRLu2ut2aBkCB527cLQV5ow1JUij4HxkRYXBd2Y`, "Interfold Protocol Proposal", key `IPP`                                                                                                                                                                                       |
| Prepare files                                       | None. Step 1 generates `safe-actions/22-prepare-crisp.json` and `23-prepare-spp-private.json`                                                                                                                                                                                           |

The Admin bootstrap stays armed on purpose (INV-29 deferred). The install is one
`admin.executeProposal` that the foundation Safe signs.

## What the replacement changes

The install transaction removes three permissions from the old pair:

- `EXECUTE_PERMISSION` on the DAO, from the old SPP. The old SPP cannot execute an action on the
  DAO.
- `CREATE_PROPOSAL_PERMISSION` on the old SPP, from `ANY_ADDR`. Nobody can create a proposal on it.
- `CREATE_PROPOSAL_PERMISSION` on the old body, from the old SPP. The old body gets no new
  sub-proposal.

All other items stay. Both old plugins stay installed, and their data stays readable. The `withdraw`
and `claimRefund` functions of the old body need no permission. Thus each payer can still get a fee
credit back:

- On 2026-10-09, the old body held a credit of 35.4272 USDS for one payer.
- The failed E3 of proposal 2 had a refund of 349.272 USDS that nobody had claimed. Anyone can call
  `claimRefund` for it. The refund goes to the credit of the payer of that proposal.

The new pair keeps the quorum, support and duration rules. It raises the voter minimum to 71 FOLD.
It uses parameter set 2, the OpenVM compute provider and the new CRISP program.

## Voting rules being installed

- The voter minimum is **71 FOLD**, encoded as `71000000000000000000` in 18-decimal voting units.
  Governance controls this setting. Proposal creators cannot override it. Each proposal keeps its
  creation-time minimum, which is also passed to its E3.
- Quorum is **2%** of the total FOLD supply at the snapshot (`MINIMUM_PARTICIPATION=2`, RATIO_BASE
  100).
- Support: yes must be **more than 51%** of yes+no (`SUPPORT_THRESHOLD=51`). Abstain counts toward
  quorum, but not toward support. This is the same as the public body (TokenVoting uses 510000
  ppm).
- Stage 0 has **5 days** of encrypted voting (`SPP_PRIVATE_VOTE_DURATION=432000`). This is equal to
  the `MINIMUM_DURATION` floor of the plugin (INV-37). A passed vote then has 10 more days to
  advance (`SPP_PRIVATE_ADVANCE_WINDOW=864000`). That window covers Avail finalization, compute and
  decryption after the ballots close.
- Stage 1 is a **5-day** foundation approval (approval mode: 2 days and 3 days, added into
  `maxAdvance`). If the foundation does not approve in this window, the proposal expires. Quorum
  and support are frozen for each proposal when it is created (INV-33).
- E3: the secure-8192 parameter set (`PARAM_SET=2`) and the Small committee, 14 of 19
  (`COMMITTEE_SIZE=2`). Mainnet accepts no other values. Each request names the OpenVM compute
  provider (`COMPUTE_PROVIDER_PARAMS`).

## Order of operations

Three repositories take part. Do the steps in this order. For the protocol steps, the source of
truth is the "v0.19 cutover on mainnet" section of `agent/flow-trace/07_UPGRADES.md` in the
Interfold repository.
Complete stable v0.19.0 CI and software publication before the Safe executes the protocol cutover.

| #   | Where                        | Step                                                                                                                          |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Interfold repository         | Deploy the new OpenVM CRISP program with deferred wiring ([details](./publish-crisp-build.md#new-crisp-program))              |
| 2   | Interfold repository         | Run `upgrade:v19`. The foundation Safe executes the cutover batch. Then run `upgrade:v19:validate`                            |
| 3   | This repository              | The foundation Safe executes `safe-actions/12-publish-crisp-build.json` (build 3). This step does not depend on steps 1 and 2 |
| 4   | This repository              | Steps 0 to 5 of this runbook: prepare, install the new pair, retire the old pair, verify                                      |
| 5   | Infrastructure and app       | Point the CRISP server, the program server and the app at the new contracts ([Step 6](#step-6-servers-and-app))               |
| 6   | Operators and Interfold repo | Ciphernodes restart on the release. Run `upgrade:v19:refresh`, then `upgrade:v19:resume -- --ciphernodes-restarted`           |
| 7   | Foundation Safe              | Execute the unpause batch that `upgrade:v19:resume` writes                                                                    |
| 8   | This repository              | Simulate one full private proposal and disarm later ([Step 7](#step-7-before-the-announcement))                               |

Requests stay paused from operation 2 until operation 7. During this interval, nobody can create a
private proposal. The protocol flow trace requires operation 5 before operation 7: "update the
server and DAO application address before requests resume".

---

## Remaining steps

### Step 0: confirm the protocol state

Do this step after operations 1 to 3. Set `RPC_URL` and the new program address first.

```bash
I=0x28cF63B459e6218C69EA97ea7D90541cf648c715
PROGRAM=<new CRISP program>
cast call $I 'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
# expect 0xa174862efd4487031d423ca96516807775ade0191c714e513aab93d0cc289baa
cast keccak "$(cast call $I 'paramSetRegistry(uint8)(bytes)' 2 --rpc-url "$RPC_URL")"
# expect 0x1b2620f6a5919d5ee19a51f34026369816f479efd0404b56585ad37d31c52317
cast call $I 'e3Programs(address)(bool)' $PROGRAM --rpc-url "$RPC_URL"   # expect true
cast call $I 'e3Programs(address)(bool)' 0x53FCdb21E73A461CfE6c64B19855204384B91BA3 \
  --rpc-url "$RPC_URL"   # expect false
cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 'buildCount(uint8)(uint16)' 1 \
  --rpc-url "$RPC_URL"   # expect 3
```

### Step 1: set the env and generate the prepare files

1. Make `.env.mainnet` a fresh copy of the template. Then add `RPC_URL` and
   `CRISP_PROGRAM_ADDRESS`. Add `PRIVATE_KEY` only if an EOA sends the prepares in Step 2.

   ```bash
   cp .env.mainnet.install .env.mainnet
   ```

   Do not reuse an older `.env.mainnet`. forge also loads `contracts/.env`, which holds the Sepolia
   settings. A key that `.env.mainnet` does not have gets its Sepolia value, and no error shows.
   Items 5 and 6 find such a value in the prepare files. Step 4 finds it in the stages.

   Make sure that `.env.mainnet` has these values:

   | Variable                              | Value                                                                 |
   | ------------------------------------- | --------------------------------------------------------------------- |
   | `CRISP_PROGRAM_ADDRESS`               | The new OpenVM CRISP program                                          |
   | `FOLD_TOKEN_ADDRESS`                  | `0x6Cd2976AD3d908E503c6D93A5E010392E25DcFB6`                          |
   | `CRISP_BUILD`                         | `3`                                                                   |
   | `PARAM_SET`                           | `2`                                                                   |
   | `COMMITTEE_SIZE`                      | `2`                                                                   |
   | `MINIMUM_DURATION`                    | `432000`                                                              |
   | `MINIMUM_VOTER_VOTING_POWER`          | `71000000000000000000`                                                |
   | `COMPUTE_PROVIDER_PARAMS`             | The OpenVM value, `{"name":"OpenVM","parallel":false,"batch_size":4}` |
   | `RETIRED_CRISP_VOTING_PLUGIN_ADDRESS` | `0x197be4E09614285Abb4b74b672377c404FD44d54`                          |
   | `RETIRED_SPP_PRIVATE_ADDRESS`         | `0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`                          |

2. Generate the install data and both prepare files:

   ```bash
   make safe-prepare-private ENV_FILE=.env.mainnet
   ```

   The command runs on chain 1, so the mainnet policy applies. It stops if the voter minimum,
   `PARAM_SET`, `COMMITTEE_SIZE` or `MINIMUM_DURATION` has a value that mainnet refuses.

3. Append the two printed `*_INSTALL_DATA` lines to `.env.mainnet` for the record.

4. Decode the CRISP prepare file. Make sure that the tag is `(1, 3)`:

   ```bash
   D=$(jq -r '.transactions[0].data' safe-actions/22-prepare-crisp.json)
   cast decode-calldata 'prepareInstallation(address,(((uint8,uint16),address),bytes))' "$D"
   ```

5. Decode the install data in the same file:

   ```bash
   DATA=$(cast decode-calldata 'prepareInstallation(address,(((uint8,uint16),address),bytes))' \
     "$D" --json | jq -r '.[1][1]')
   cast decode-abi \
     'x()((address,address,address,uint8,uint8,address,bytes,(uint256,uint256,uint32,uint32,uint64)),address,bool)' \
     "$DATA"
   ```

   Expect these values, in this order:
   - DAO and token `0x0000…0000`. The setup fills them in at install.
   - Interfold `0x28cF63B459e6218C69EA97ea7D90541cf648c715`.
   - Committee size `2` and parameter set `2`.
   - The new CRISP program.
   - The OpenVM compute provider parameters.
   - Voting settings `(0, 71000000000000000000, 2, 51, 432000)`.
   - BondedVotes `0x6Cd2976AD3d908E503c6D93A5E010392E25DcFB6`, then `false` (no `EXECUTE` for the
     body).

6. Make sure that the SPP prepare file contains the IPP metadata URI. Expect `1`:

   ```bash
   jq -r '.transactions[0].data' safe-actions/23-prepare-spp-private.json \
     | grep -c "$(cast from-utf8 ipfs://QmSEYaoXRLu2ut2aBkCB527cLQV5ow1JUij4HxkRYXBd2Y | cut -c3-)"
   ```

### Step 2: execute the two prepare transactions

`22-prepare-crisp.json` and `23-prepare-spp-private.json` are **direct, permissionless**
`prepareInstallation` calls to the PluginSetupProcessor (`0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f`).
They deploy the two plugin proxies and record the prepared setups. The DAO does not change until
the apply in Step 4. Thus this step needs no DAO authority.

Use one of these two channels:

- **Foundation Safe.** Load each JSON into the Safe Transaction Builder and execute it. The order
  is not important.
- **Any funded EOA.** Run `make broadcast-prepares ENV_FILE=.env.mainnet`. It sends both and prints
  the transaction hashes.

### Step 3: read the receipts back into the env

The apply calculates each prepared setup id again from the plugin address, the permission set and
the helpers hash. These values come from the `InstallationPrepared` events. The command reads them
from the receipts, so you do not copy them by hand:

```bash
make read-prepared ENV_FILE=.env.mainnet TX=0x<tx-of-22> PLUGIN_PREFIX=CRISP        >> .env.mainnet
make read-prepared ENV_FILE=.env.mainnet TX=0x<tx-of-23> PLUGIN_PREFIX=SPP_PRIVATE  >> .env.mainnet
```

The prepare transactions are public. You can also get the hashes from a block explorer.

### Step 4: generate the ONE transaction that the foundation signs

```bash
make safe-install-private ENV_FILE=.env.mainnet
```

The command writes **`safe-actions/24-install-and-wire-private-process.json`**. Its name is
"Replace the private process (CRISP + SPP)". It is one `admin.executeProposal` on the Admin plugin
(`0xF21e25455988887EE797050080141eba67B33920`). It contains these actions, atomically and in order:

1. Grant ROOT on the DAO to the PluginSetupProcessor. This opens the install window.
2. `applyInstallation` for the new CRISP body.
3. `applyInstallation` for the new private SPP. From this action, the new SPP holds `EXECUTE` on the
   DAO.
4. Revoke ROOT from the PSP. This closes the install window.
5. `updateStages` on the new SPP, with the 5-day vote and the 5-day approval.
6. Grant `CREATE_PROPOSAL` on the new body to the new SPP **only** (INV-3).
7. Point the new body at the delegatecall Executor `0x56ce4D8006292Abf418291FaE813C1E3769240A4`
   (INV-5).
8. Revoke `EXECUTE` on the DAO from the old SPP.
9. Revoke `CREATE_PROPOSAL` on the old SPP from `ANY_ADDR`.
10. Revoke `CREATE_PROPOSAL` on the old body from the old SPP.

**This must stay one transaction.** If you split it, the new SPP can hold `EXECUTE` on the DAO with
no stage configuration. Also, two private processes can execute on the DAO at the same time. The
transaction does **not** disarm the Admin bootstrap.

A revoke of a permission that is not granted does nothing on chain. Thus the command checks the
old pair on chain before it writes the file. It stops if the old SPP does not hold `EXECUTE` on the
DAO, or `CREATE_PROPOSAL` on the old body. It also stops if only one `RETIRED_*` address is set.

Give the JSON to the foundation for the Safe Transaction Builder. The command also prints the same
`to` and `data` to the console, so the signers can compare the raw calldata with the file. To read
the ten actions, decode the file:

```bash
cast decode-calldata 'executeProposal(bytes,(address,uint256,bytes)[],uint256)' \
  "$(jq -r '.transactions[0].data' safe-actions/24-install-and-wire-private-process.json)"
```

Before you sign, decode the stages in action 5 (index 4):

```bash
D=$(jq -r '.transactions[0].data' safe-actions/24-install-and-wire-private-process.json)
A4=$(cast decode-calldata 'executeProposal(bytes,(address,uint256,bytes)[],uint256)' "$D" --json \
  | jq -r '.[1][4][2]')
cast decode-calldata \
  'updateStages(((address,bool,bool,uint8)[],uint64,uint64,uint64,uint16,uint16,bool,bool)[])' "$A4"
```

Each stage is `(bodies, maxAdvance, minAdvance, voteDuration, approvalThreshold, vetoThreshold,
cancelable, editable)`. Each body is `(addr, isManual, tryAdvance, resultType)`. Expect:

- Stage 0: `([(<new body>, false, true, 1)], 1296000, 0, 432000, 1, 0, false, false)`.
- Stage 1: `([(0x8B43b2852fc5031D01DDfCDF702973D93A2FF593, true, false, 1)], 432000, 0, 0, 1, 0, false, false)`.

Do not sign if a value is different.

Each revoke decodes with `cast decode-calldata 'revoke(address,address,bytes32)' <data>`. The
permission ids are:

| Permission                   | Id                                                                   |
| ---------------------------- | -------------------------------------------------------------------- |
| `ROOT_PERMISSION`            | `0x815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33` |
| `EXECUTE_PERMISSION`         | `0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d` |
| `CREATE_PROPOSAL_PERMISSION` | `0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90` |

### Step 5: verify (SECURITY.md runbook)

After the execution, do these checks on chain. `NEW_BODY` and `NEW_SPP` are `CRISP_PLUGIN_ADDRESS`
and `SPP_PRIVATE_PLUGIN_ADDRESS` from Step 3.

```bash
DAO=0x652a31c669f9AB37f6040f279139a75D04F2679e
OLD_BODY=0x197be4E09614285Abb4b74b672377c404FD44d54
OLD_SPP=0x364686f83d7cCEdf88B881B23d4437D1652A8FfB
EXEC=0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d
CREATE=0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90
has() { cast call $DAO 'hasPermission(address,address,bytes32,bytes)(bool)' "$1" "$2" "$3" 0x --rpc-url "$RPC_URL"; }
has $DAO $NEW_SPP $EXEC             # expect true
has $DAO $OLD_SPP $EXEC             # expect false
has $NEW_BODY $NEW_SPP $CREATE      # expect true
has $OLD_BODY $OLD_SPP $CREATE      # expect false
has $OLD_SPP 0xffffffffffffffffffffffffffffffffffffffff $CREATE   # expect false
I=$(cast call $NEW_SPP 'getCurrentConfigIndex()(uint16)' --rpc-url "$RPC_URL")
cast call $NEW_SPP \
  'getStages(uint256)(((address,bool,bool,uint8)[],uint64,uint64,uint64,uint16,uint16,bool,bool)[])' \
  "$I" --rpc-url "$RPC_URL"   # expect the stages of Step 4
```

Also make sure of these items:

- `EXECUTE_PERMISSION` on the DAO: the new SPP and the public SPP hold it. The Admin plugin holds
  it until the disarm. The bodies, TokenVoting and each EOA do not hold it (INV-2).
- The receipt has four `Revoked` events from the DAO. They remove ROOT from the PSP and `EXECUTE`
  from the old SPP. They also remove the two `CREATE_PROPOSAL` grants of the old pair. The DAO
  emits `Revoked` only for a permission that was granted.
- New body: `implementation()` matches the checked publication receipt. `getVotingToken()`
  is BondedVotes `0x6Cd2976AD3d908E503c6D93A5E010392E25DcFB6`. `supportThreshold()` is 51, and
  `minParticipation()` is 2.
- New body: `minVoterVotingPower()` is `71000000000000000000` (71 FOLD).
- New body: `getE3Settings()` is `(2, 2, <OpenVM parameters>)`, and `getTargetConfig()` is
  (`0x56ce…40A4`, DelegateCall).
- New SPP: stage 0 has `minAdvance` 0 (INV-9). Stage 1 has `vetoThreshold` 0, which is approval
  mode (INV-10).
- Old body: `getProposal` still answers for its 3 proposals.

### Step 6: servers and app

Do this step before the unpause batch (operation 7).

**CRISP server.** The settings live in AWS SSM under `/interfold/mainnet/crisp-server/env/`. The
infrastructure repository does not record the live mainnet host or the image tag. Get both from the
operator.

1. Use a `crisp-server` image whose `deployed_contracts.json` records the new program. Set
   `versions.crisp_server` in `ansible/inventories/mainnet/group_vars/all.yml`.
2. Set `E3_PROGRAM_ADDRESS` to the new program.
3. Set `E3_PARAM_SET=2` and `E3_COMMITTEE_SIZE=2`. In the v0.19 enum, set 2 is secure-8192.
4. Set the `E3_COMPUTE_PROVIDER_*` values to the OpenVM provider.
5. Make sure that `PRIVATE_KEY` is the key of `INPUT_AVAILABILITY_SIGNER` of the new program.
6. If the server indexes for the app, add the new body, the new SPP and the new program to
   `INDEX_CONTRACTS` and `INDEX_LOG_CONTRACTS`. Keep the old body and the old SPP in both lists.
   Then the server also serves the old proposals to the app. Without them, the app reads the old
   proposals from the RPC, which is slower.
7. Write each value with `printf '%s' '<value>' | ./scripts/put-secret.sh mainnet crisp-server env/<NAME>`.
8. If no round is open, move the server database aside. The server serves one program, and a new
   database gives a complete index of the new contracts.
9. Restart the server:

   ```bash
   ansible-playbook -i ansible/inventories/mainnet ansible/playbooks/restart.yml --limit crisp_server
   ```

**Program server.** The program server must prove the OpenVM compute of the new program. For
mainnet, `versions.e3_support` is `0.12.1`, which carries the RISC Zero guest. In production mode,
the program-server config template of the infrastructure repository renders only a RISC Zero
Boundless block. Thus that repository cannot deploy a mainnet OpenVM prover yet. Get the prover
settings of the v0.19 release before the unpause. Without a prover, no private proposal can get a
tally.

**App.** In the production deployment (`governance.theinterfold.com`), set these values:

- `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS`: the new body (`CRISP_PLUGIN_ADDRESS` from Step 3).
- `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS`: the new SPP (`SPP_PRIVATE_PLUGIN_ADDRESS` from Step 3).
- `NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS`: the new program, the same value as `CRISP_PROGRAM_ADDRESS`.
- `NEXT_PUBLIC_CRISP_SERVER_URL`: the CRISP server that tracks the new program.
- `NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS`: USDS, `0xdC035D45d973E3EC169d2276DDab16f1e407384F`.
- `NEXT_PUBLIC_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS`: the old body,
  `0x197be4E09614285Abb4b74b672377c404FD44d54`.
- `NEXT_PUBLIC_RETIRED_SPP_PRIVATE_ADDRESS`: the old SPP,
  `0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`.

The two `RETIRED` values keep the 3 old proposals in the proposal list and on their pages. Copy
each address exactly as it shows here. The app ignores an address with an incorrect checksum and
shows no error. Do not set `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK` to the block of the new install.
The app starts its scan of all SPPs at that block. The old SPP has proposals from block 26006243.
The build includes each `NEXT_PUBLIC_` value. Thus redeploy the app after you change a value.

Then set `CRISP_VOTING_PLUGIN_ADDRESS` and `SPP_PRIVATE_ADDRESS` in `.env.mainnet` to the new pair.
Later scripts, for example `printUpdateStages()`, read these two values.

### Step 7: before the announcement

- After the unpause batch, fork-simulate one full private proposal against the live coordinator:
  create, vote, tally and execute. The USDS fee escrow and the refund path ran only against mocks
  and testnet.
- **Disarm** with `make disarm-admin ENV_FILE=.env.mainnet` (the deferred disarm of INV-29). Do this
  only when all items work. First, check the rotation state: only one address can hold
  `EXECUTE_PROPOSAL_PERMISSION` on the armed Admin plugin (INV-31).

## Rehearsal record

This record predates the 71 FOLD voter-minimum change. It is not qualification of that new policy.

On 2026-10-09, the publish batch and Steps 1 to 5 ran on a mainnet fork at block 26156057. The fork
used a stand-in program address, because the new program does not exist yet. `.env.mainnet` was a
fresh copy of `.env.mainnet.install`. These results were observed:

- `12-publish-crisp-build.json`: the Safe executed the three calls. `buildCount(1)` changed from 2 to
  3, and both CREATE2 addresses hold code.
- `make safe-prepare-private` ran on chain 1. The checks of Step 1 gave tag `(1, 3)`, parameter set
  2, committee size 2, the OpenVM parameters, `(0, 1, 2, 51, 432000)` and the IPP metadata URI.
- `make broadcast-prepares` and `make read-prepared` gave the prepared values of both plugins.
- `make safe-install-private` wrote the 10 actions of Step 4. The Safe executed the batch. Each
  check of Step 5 gave the expected value, and the receipt had the four `Revoked` events.
- After the batch, `createProposal` on the old SPP reverted with `DaoUnauthorized` for a random
  address. The new SPP accepted the same call.
- The 3 old proposals stayed readable. The payer withdrew the 35.4272 USDS credit of the old body.
- With the two `RETIRED` values set, the app on the fork showed the 3 old proposals. One shows
  under "All statuses", and the two failed ones show under "Failed". The page of the old proposal
  with a tally showed that tally and no vote action.
- The generator stopped and wrote no file in three cases. These were one `RETIRED_*` address only,
  the public SPP as the old SPP, and an old SPP with no `EXECUTE`.
- With both `RETIRED_*` values empty, the generator wrote the 7 actions of a first install.
- An older `.env.mainnet` gave the settings `(1, 1, 2, 50, 432000)` and no IPP metadata URI. The
  checks of Step 1 found both errors.
