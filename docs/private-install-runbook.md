# Private process replacement runbook (mainnet)

This runbook replaces the **Interfold Protocol Proposal (IPP)** process in the live mainnet DAO
(`0x652a31c669f9AB37f6040f279139a75D04F2679e`). The process gives receipt-free secret-ballot voting
with CRISP. It has two stages, like the public process:

1. **5 days of FOLD-holder voting** with encrypted CRISP ballots. Quorum is 2%, and support must be
   more than 51%. Bonded and vesting-locked FOLD carry weight.
2. **A 5-day Interfold Foundation approval window.** Approved proposals execute on the DAO.

The DAO already has a private process from the v0.19 cutover (block 26176770). That pair (a CRISP
build 3 body and its SPP) cannot run on the Interfold v0.20 protocol: v0.20 binds the crypto config
id to the parameter set and the committee size, and build 3 sends the v0.19 id. This runbook
installs a new pair from the CRISP build that [publish-crisp-build.md](./publish-crisp-build.md)
publishes (expected build 4). The same transaction removes the powers of the old pair.

This runbook is one part of the mainnet cutover. Do it in the order of
[mainnet-v0.20-upgrade.md](./mainnet-v0.20-upgrade.md) (step B4).

All `make` commands run from `contracts/` with `ENV_FILE=.env.mainnet`. Make that file a fresh copy
of the committed `.env.mainnet.install` (Step 1). The Safe files go to `contracts/safe-actions/`.

---

## Current state, verified on chain 2026-11-27

| What                                                | Where                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DAO                                                 | `0x652a31c669f9AB37f6040f279139a75D04F2679e`                                                                                                                                                                                                                                            |
| Foundation Safe (Admin driver)                      | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593`                                                                                                                                                                                                                                            |
| Admin plugin                                        | `0xF21e25455988887EE797050080141eba67B33920`. It is armed: it holds `EXECUTE_PERMISSION` on the DAO (INV-29 deferred)                                                                                                                                                                   |
| CRISP PluginRepo (`interfold-crisp.plugin.dao.eth`) | `0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1`. Release 1 has builds 1 to 3. The Safe is the maintainer                                                                                                                                                                                   |
| Next CRISP build (not published)                    | Build 4, from `safe-actions/12-publish-crisp-build.json`. Use the CREATE2 addresses of the checked batch, not predictions from another build. See [publish-crisp-build.md](./publish-crisp-build.md)                                                                                    |
| Installed private process (this runbook retires it) | Body `0xf101fB197E38f6b3Ca110D619D845634CD88098c` (build 3, program `0x1EA4…EE28`, parameter set 2). SPP `0xc19635aD8De0a0D6430025fC5ed212CA8216bab3`, which holds `EXECUTE_PERMISSION` on the DAO. Installed at block 26176770. 2 proposals                                             |
| Earlier private process (retired by v0.19)          | Body `0x197be4E09614285Abb4b74b672377c404FD44d54`, SPP `0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`. No permissions. 3 proposals, still readable                                                                                                                                         |
| Interfold coordinator                               | `0x28cF63B459e6218C69EA97ea7D90541cf648c715`. `feeToken()` is **USDS** (`0xdC03…384F`). v0.19: protocol 8, generation 2, `activeCryptoConfigId()` is `0xa174…9baa` (parameter set 2). `paramSetRegistry(3)` is empty. `requestsPaused()` is `false`                                      |
| CRISP E3 program                                    | `0x1EA4dBdec0F2F1E9235915847fc59EF4045EEe28` (v0.19, OpenVM) is registered. The v0.20 cutover batch registers and binds the CRISP 0.29.0 program and retires this one                                                                                                                  |
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
credit or a refund back from the old body.

The new pair keeps the quorum, support, duration and voter-minimum rules. It uses parameter set 3,
the OpenVM compute provider and the CRISP 0.29.0 program.

## Voting rules being installed

- The voter minimum is **71 FOLD**, encoded as `71000000000000000000` in 18-decimal voting units.
  Governance controls this setting. Proposal creators cannot override it. Each proposal keeps its
  creation-time minimum. The E3 uses the larger of that minimum and the round's voting-power divisor.
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
- E3: the secure-8192 parameter set (`PARAM_SET=3` in Interfold v0.20) and the Small committee, 14
  of 19 (`COMMITTEE_SIZE=2`). Mainnet accepts no other values. The body sends the crypto config id
  of that pair, `0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891`. Each request
  names the OpenVM compute provider (`COMPUTE_PROVIDER_PARAMS`).

## Order of operations

The order of the whole cutover, across the three repositories, is in
[mainnet-v0.20-upgrade.md](./mainnet-v0.20-upgrade.md). This runbook is its step B4. Do it after
the cutover batch executes (step B3) and the build publication executes (step A2), and before the
unpause (step B7). Requests stay paused during this interval, so nobody can create a private
proposal. Update the servers and the app (Step 6) before requests resume.

---

## Remaining steps

### Step 0: confirm the protocol state

Do this step after steps A1, A2 and B3 of [mainnet-v0.20-upgrade.md](./mainnet-v0.20-upgrade.md).
Set `RPC_URL` and the new program address first.

```bash
I=0x28cF63B459e6218C69EA97ea7D90541cf648c715
PROGRAM=<CRISP 0.29.0 program>
cast call $I 'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
# expect 0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891
cast keccak "$(cast call $I 'paramSetRegistry(uint8)(bytes)' 3 --rpc-url "$RPC_URL")"
# expect 0x4f4025982214c2149028270dccc0ad45c24c2441a3496cdf1a29f5d1e1b908c3
cast call $I 'e3Programs(address)(bool)' $PROGRAM --rpc-url "$RPC_URL"   # expect true
cast call $I 'e3Programs(address)(bool)' 0x1EA4dBdec0F2F1E9235915847fc59EF4045EEe28 \
  --rpc-url "$RPC_URL"   # expect false
cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 'buildCount(uint8)(uint16)' 1 \
  --rpc-url "$RPC_URL"   # expect 4
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
   | `CRISP_PROGRAM_ADDRESS`               | The CRISP 0.29.0 OpenVM program (step A1 of the cutover)              |
   | `FOLD_TOKEN_ADDRESS`                  | `0x6Cd2976AD3d908E503c6D93A5E010392E25DcFB6`                          |
   | `CRISP_BUILD`                         | The build that step A2 published, from its `VersionCreated` event (expected `4`) |
   | `PARAM_SET`                           | `3`                                                                   |
   | `COMMITTEE_SIZE`                      | `2`                                                                   |
   | `MINIMUM_DURATION`                    | `432000`                                                              |
   | `MINIMUM_VOTER_VOTING_POWER`          | `71000000000000000000`                                                |
   | `COMPUTE_PROVIDER_PARAMS`             | The OpenVM value, `{"name":"OpenVM","parallel":false,"batch_size":4}` |
   | `RETIRED_CRISP_VOTING_PLUGIN_ADDRESS` | `0xf101fB197E38f6b3Ca110D619D845634CD88098c`                          |
   | `RETIRED_SPP_PRIVATE_ADDRESS`         | `0xc19635aD8De0a0D6430025fC5ed212CA8216bab3`                          |

2. Generate the install data and both prepare files:

   ```bash
   make safe-prepare-private ENV_FILE=.env.mainnet
   ```

   The command runs on chain 1, so the mainnet policy applies. It stops if the voter minimum,
   `PARAM_SET`, `COMMITTEE_SIZE` or `MINIMUM_DURATION` has a value that mainnet refuses.

3. Append the two printed `*_INSTALL_DATA` lines to `.env.mainnet` for the record.

4. Decode the CRISP prepare file. Make sure that the tag is `(1, 4)` (the build that step A2
   published):

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
   - Committee size `2` and parameter set `3`.
   - The CRISP 0.29.0 program.
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

Besides the helpers hash, each command writes `<PREFIX>_HELPERS`, the helper addresses behind it.
The next step needs two of them: `CRISP_HELPERS` holds the body's proposer condition
(`CrispProposerCondition`) and `SPP_PRIVATE_HELPERS` holds the SPP's rule condition. The generator
checks both lists against the hashes and stops if they do not match.

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
6. `updateRules` on the SPP's rule condition (`SPP_PRIVATE_HELPERS[0]`): one rule that defers to the
   body's `CrispProposerCondition` (`CRISP_HELPERS[0]`). The SPP is installed with no rules, which
   admit everyone, and the body does not re-check the proposer for an SPP caller. Without this
   action nothing restricts who creates a proposal by voting power.
7. Grant `CREATE_PROPOSAL` on the new body to the new SPP **only** (INV-3).
8. Point the new body at the delegatecall Executor `0x56ce4D8006292Abf418291FaE813C1E3769240A4`
   (INV-5).
9. Revoke `EXECUTE` on the DAO from the old SPP.
10. Revoke `CREATE_PROPOSAL` on the old SPP from `ANY_ADDR`.
11. Revoke `CREATE_PROPOSAL` on the old body from the old SPP.

**This must stay one transaction.** If you split it, the new SPP can hold `EXECUTE` on the DAO with
no stage configuration. Also, two private processes can execute on the DAO at the same time. The
transaction does **not** disarm the Admin bootstrap.

A revoke of a permission that is not granted does nothing on chain. Thus the command checks the
old pair on chain before it writes the file. It stops if the old SPP does not hold `EXECUTE` on the
DAO, or `CREATE_PROPOSAL` on the old body. It also stops if only one `RETIRED_*` address is set.

Give the JSON to the foundation for the Safe Transaction Builder. The command also prints the same
`to` and `data` to the console, so the signers can compare the raw calldata with the file. To read
the eleven actions, decode the file:

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

Decode the rule in action 6 (index 5) the same way. Its target must be `SPP_PRIVATE_HELPERS[0]`, and
the single rule must be `(202, 1, <CRISP_HELPERS[0] as a number>, 0x00…00)`: a condition rule, the
`EQ` operation, the body's condition address and no permission override:

```bash
A5=$(cast decode-calldata 'executeProposal(bytes,(address,uint256,bytes)[],uint256)' "$D" --json \
  | jq -r '.[1][5][2]')
cast decode-calldata 'updateRules((uint8,uint8,uint240,bytes32)[])' "$A5"
```

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
OLD_BODY=0xf101fB197E38f6b3Ca110D619D845634CD88098c
OLD_SPP=0xc19635aD8De0a0D6430025fC5ed212CA8216bab3
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
- New body: `getE3Settings()` is `(2, 3, <OpenVM parameters>)` (committee size, parameter set,
  provider), and `getTargetConfig()` is (`0x56ce…40A4`, DelegateCall).
- New SPP: the rule condition (`SPP_PRIVATE_HELPERS[0]`) has exactly one rule, set in action 6 of
  Step 4. Read it with `cast call <rule condition> 'getRules()((uint8,uint8,uint240,bytes32)[])'`.
  Expect `(202, 1, <body condition>, 0x00…00)`, where the body condition is `CRISP_HELPERS[0]`.
  Then check the body condition with `isGranted(<new SPP>, <account>, $CREATE, 0x)`
  (`cast call <body condition> 'isGranted(address,address,bytes32,bytes)(bool)' ...`). With
  `minProposerVotingPower` at 0, as in this install, it is `true` for every account. Above 0, it is
  `false` for an account with no voting power and `true` for a holder at or above
  `minProposerVotingPower`. With no rules, anyone could create a proposal.
- New SPP: stage 0 has `minAdvance` 0 (INV-9). Stage 1 has `vetoThreshold` 0, which is approval
  mode (INV-10).
- Old body: `getProposal` still answers for its 2 proposals.

### Step 6: servers and app

Do this step before the unpause batch (step B7 of
[mainnet-v0.20-upgrade.md](./mainnet-v0.20-upgrade.md)).

**CRISP server.** The settings live in AWS SSM under `/interfold/mainnet/crisp-server/env/`. The
infrastructure repository does not record the live mainnet host or the image tag. Get both from the
operator.

1. Use a `crisp-server` image built from CRISP 0.29.0 whose `deployed_contracts.json` records the
   new program. Set `versions.crisp_server` in `ansible/inventories/mainnet/group_vars/all.yml`.
2. Set `E3_PROGRAM_ADDRESS` to the new program.
3. Set `E3_PARAM_SET=3` and `E3_COMMITTEE_SIZE=2`. In Interfold v0.20, set 3 is secure-8192. A
   CRISP server before 0.29.0 accepts only `E3_PARAM_SET` 0 or 2, so it cannot serve v0.20.
4. Set the `E3_COMPUTE_PROVIDER_*` values to the OpenVM provider.
5. Make sure that `PRIVATE_KEY` is the key of `INPUT_AVAILABILITY_SIGNER` of the new program.
6. If the server indexes for the app, add the new body, the new SPP and the new program to
   `INDEX_CONTRACTS` and `INDEX_LOG_CONTRACTS`. Keep both old pairs in both lists. Then the server
   also serves the old proposals to the app. Without them, the app reads the old proposals from the
   RPC, which is slower.
7. Write each value with `printf '%s' '<value>' | ./scripts/put-secret.sh mainnet crisp-server env/<NAME>`.
8. If no round is open, move the server database aside. The server serves one program, and a new
   database gives a complete index of the new contracts.
9. Restart the server:

   ```bash
   ansible-playbook -i ansible/inventories/mainnet ansible/playbooks/restart.yml --limit crisp_server
   ```

**Program server.** The program server must prove the OpenVM compute of the new program: its guest
must give the image ID that the new program's receipt verifier accepts (`imageId()`). Update it to
the prover of the v0.20.0 release before the unpause. Without a prover that matches, no private
proposal can get a tally. [NEEDS TECHNICAL INPUT: the live mainnet program-server host and how it
is deployed. The infrastructure repository does not record it.]

**App.** In the production deployment (`governance.theinterfold.com`), set these values:

- `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS`: the new body (`CRISP_PLUGIN_ADDRESS` from Step 3).
- `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS`: the new SPP (`SPP_PRIVATE_PLUGIN_ADDRESS` from Step 3).
- `NEXT_PUBLIC_CRISP_SERVER_URL`: the CRISP server that tracks the new program.
- `NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS`: USDS, `0xdC035D45d973E3EC169d2276DDab16f1e407384F`.
- `NEXT_PUBLIC_BONDED_VOTES_ADDRESS`: the new private-process adapter,
  `0x6Cd2976AD3d908E503c6D93A5E010392E25DcFB6`.
- `NEXT_PUBLIC_BONDED_VOTES_DEPLOYMENT_BLOCK`: `26155854`.
- `NEXT_PUBLIC_RETIRED_SPP_PRIVATE_ADDRESS`: both old SPPs, comma-separated, in this order:
  `0xc19635aD8De0a0D6430025fC5ed212CA8216bab3,0x364686f83d7cCEdf88B881B23d4437D1652A8FfB`.
- `NEXT_PUBLIC_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS`: both old bodies, in the same order:
  `0xf101fB197E38f6b3Ca110D619D845634CD88098c,0x197be4E09614285Abb4b74b672377c404FD44d54`.

The global delegation and voting-power screens follow the configured adapter. The public body
still uses `0x028deEA644258c78b1B5B2eacF469F5D781Fb43E`; delegation to the new adapter does not
migrate that body. Proposal voting-power reads use each body's own token. Verify both processes
before changing the live app. This runbook does not implement a body-specific delegation screen.

The two `RETIRED` lists keep the 5 old proposals (2 of the v0.19 pair, 3 of the earlier pair) in the
proposal list and on their pages. Item `i` of one list pairs with item `i` of the other. Copy each
address exactly as it shows here: the app stops at startup on a bad checksum, on lists of different
length, or on one list without the other. The app reads each old round with the program that its
E3 names, so it needs no program address. The CRISP server does not index the retired SPPs, so the
app scans their logs from `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK`. Keep that value at or before block
26006243, where the oldest retired SPP has its first proposal. Do not set it to the block of the
new install. The build includes each `NEXT_PUBLIC_` value. Thus redeploy the app after you change a
value.

Then set `CRISP_VOTING_PLUGIN_ADDRESS` and `SPP_PRIVATE_ADDRESS` in `.env.mainnet` to the new pair.
Later scripts, for example `printUpdateStages()`, read these two values.

### Step 7: before the announcement

- After the unpause batch, fork-simulate a private proposal against the live coordinator: create
  it, check that the body got its sub-proposal and E3, and vote. A fork has no ciphernodes, so it
  gives no tally. The tally and the execution come from the first real proposal. The USDS fee
  escrow and the refund path ran only against mocks and testnet.
- **Disarm** with `make disarm-admin ENV_FILE=.env.mainnet` (the deferred disarm of INV-29). Do this
  only when all items work. First, check the rotation state: only one address can hold
  `EXECUTE_PROPOSAL_PERMISSION` on the armed Admin plugin (INV-31).

## Rehearsal record

This record is the rehearsal of the **v0.19** replacement (build 3, parameter set 2). It does not
qualify the v0.20 replacement. Rehearse the v0.20 batch on a mainnet fork before the Safe signs it
(step A3 of [mainnet-v0.20-upgrade.md](./mainnet-v0.20-upgrade.md)), and record the result here.

This record predates the 71 FOLD voter-minimum change. It is not qualification of that new policy.
It also predates the creation rule (action 6 of Step 4) and the `CrispProposerCondition` helper, so
the batch it describes had 10 actions (7 for a first install). The current batch has 11 (8).

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
