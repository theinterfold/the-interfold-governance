# Public-process install — operator runbook (foundation Safe)

Step-by-step instructions for the Safe owners to install the public governance process
(TokenVoting + SPP) into the live mainnet DAO, **entirely from this repo**. No EOA and no private
key is involved: every transaction is signed and executed by the foundation Safe.

Background reading (not required to execute): [`architecture.md`](architecture.md) for the
mechanism, [`mainnet-deployment.md`](mainnet-deployment.md) §"Phase 1-alt" for why the steps are
shaped this way.

## What gets installed

| What                | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| DAO                 | `0x652a31c669f9AB37f6040f279139a75D04F2679e`                          |
| Signing Safe        | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593` (foundation, 3-of-5)     |
| Voting token        | `0x028deEA644258c78b1B5B2eacF469F5D781Fb43E` — **BondedVotes** (bonded + vesting-locked + escrow-locked FOLD vote) |
| Stage 0             | TokenVoting: 51% support, 2% participation of total FOLD supply, 5-day window, VoteReplacement |
| Stage 1             | Foundation Safe, **approval mode** (must explicitly approve; silence = expiry), 5-day approve-and-execute deadline |
| Executor (INV-5)    | `0x56ce4D8006292Abf418291FaE813C1E3769240A4` — Aragon's canonical v1.4.0 Executor, already on chain; nothing to deploy |
| Process metadata    | `ipfs://QmVJVnRwZbpXBkkXWMqtih9wnCowPNNeBuYE5zviyGLgTC` ("Public Token Voting", key `PUB`) |
| Body metadata       | `ipfs://QmW1i5kfZg3ZkjLbJCrZ8joF5k5vrtcd1GmA22hh7Ya44C` ("FOLD Public Voting") |

The install is **two signing rounds**. Round 2's calldata cannot exist before round 1 executes:
`prepareInstallation` deploys the plugin proxies, and their fresh addresses are inputs to the
apply-and-wire batch (the PluginSetupProcessor re-derives a setup id from them and reverts on any
mismatch — a transcription error can only ever revert, never install something else).

## Setup (once)

```bash
git clone <this repo> && cd the-interfold-governance/contracts
make setup            # git submodules + pnpm install
forge build
cp .env.mainnet.install .env.mainnet
```

Requires [Foundry](https://getfoundry.sh) and pnpm. `.env.mainnet.install` is a committed,
secrets-free snapshot — every address in it was verified on chain; re-verify freely, all of it is
public state.

## Round 1 — the two prepares

The files are already generated and committed:

- `contracts/safe-actions/20-prepare-token-voting.json`
- `contracts/safe-actions/21-prepare-spp-public.json`

Both call `prepareInstallation` on the PluginSetupProcessor (`0xE978…B13f`). They are
**permissionless and touch nothing the DAO owns** — a prepared setup that is never applied simply
expires unused. Order between them does not matter.

**Verify before signing** (do not trust the files — reproduce them):

```bash
# 1. Regenerate from source and diff: identical output proves file == repo == env.
#    (-I ignores the embedded creation timestamp, the only line allowed to differ)
make safe-prepare-public ENV_FILE=.env.mainnet
git diff -I '"createdAt"' --exit-code safe-actions/   # must print nothing

# 2. Decode what you are about to sign.
DATA=$(python3 -c "import json; print(json.load(open('safe-actions/20-prepare-token-voting.json'))['transactions'][0]['data'])")
cast decode-calldata "prepareInstallation(address,(((uint8,uint16),address),bytes))" $DATA
# Check: DAO address, TokenVoting repo 0xb7401cD2… release 1 build 4, and inside the inner bytes:
# mode 2, 510000, 20000, 432000, token 0x028deEA6…, empty mint settings.

# 3. Simulate the entire install on a mainnet fork, including the end-state permissions:
make simulate-public-install ENV_FILE=.env.mainnet
```

Then, in the Safe web app: **New transaction → Transaction Builder → drag the JSON file in**,
review, sign, execute. One file at a time. Record **both transaction hashes**.

## Round 2 — the atomic apply-and-wire

With the two hashes from round 1:

```bash
# Read the InstallationPrepared events straight from the receipts. NEVER transcribe by hand —
# these values are hashed into the setup id that applyInstallation checks.
make read-prepared TX=<hash-of-20> PLUGIN_PREFIX=TOKEN_VOTING ENV_FILE=.env.mainnet >> .env.mainnet
make read-prepared TX=<hash-of-21> PLUGIN_PREFIX=SPP_PUBLIC   ENV_FILE=.env.mainnet >> .env.mainnet

# Re-run both simulations now that the real plugin addresses are known:
make simulate-public-install    ENV_FILE=.env.mainnet
make simulate-public-governance ENV_FILE=.env.mainnet   # full proposal: create→vote→advance→approve→execute

# Emit the single Safe file:
make safe-install-public ENV_FILE=.env.mainnet
#   -> safe-actions/22-install-and-wire-public-process.json
```

This one targets the **Admin plugin** (`0xf21E…3920`), wrapping everything in one
`admin.executeProposal`, because the DAO itself must be the sender of `applyInstallation` and of
its own permission changes. **It is one transaction on purpose.** Between an apply and a separate
wiring, TokenVoting would hold EXECUTE on the DAO while proposal creation is open to any FOLD
holder — a live bypass of the foundation stage. **Never split this file. Never sign the apply on
its own.**

**Verify before signing:**

```bash
DATA=$(python3 -c "import json; print(json.load(open('safe-actions/22-install-and-wire-public-process.json'))['transactions'][0]['data'])")
cast decode-calldata "executeProposal(bytes,(address,uint256,bytes)[],uint256)" $DATA
```

Confirm the action list is exactly, in order:

1. `dao.grant(dao, PSP, ROOT_PERMISSION)` — temporary
2. `psp.applyInstallation(dao, <TokenVoting>)` — plugin address **must match** the one in
   receipt 20's `InstallationPrepared` event
3. `psp.applyInstallation(dao, <SPP>)` — must match receipt 21
4. `dao.revoke(dao, PSP, ROOT_PERMISSION)` — must not be missing
5. `spp.updateStages(...)` — stage 0 = the TokenVoting body (`minAdvance == voteDuration ==
   432000`), stage 1 = the foundation Safe (`isManual, approvalThreshold 1, vetoThreshold 0`)
6. `dao.grant(tokenVoting, spp, CREATE_PROPOSAL_PERMISSION)`
7. `tokenVoting.setTargetConfig(0x56ce4D80…40A4, DelegateCall)` — the canonical Executor
8. `dao.revoke(dao, tokenVoting, EXECUTE_PERMISSION)` — closes the bypass (INV-2)

Sign and execute from the Safe.

## Post-install verification (before announcing anything)

```bash
set -a; . ./.env.mainnet; set +a
EXEC=$(cast keccak "EXECUTE_PERMISSION"); ROOT=$(cast keccak "ROOT_PERMISSION")
has() { cast call $DAO_ADDRESS "hasPermission(address,address,bytes32,bytes)(bool)" $DAO_ADDRESS $1 $2 0x --rpc-url $RPC_URL; }

has $SPP_PUBLIC_PLUGIN_ADDRESS         $EXEC   # MUST be true  — the SPP is the only governance executor
has $TOKEN_VOTING_PLUGIN_ADDRESS       $EXEC   # MUST be false (INV-2)
has $PLUGIN_SETUP_PROCESSOR_ADDRESS    $ROOT   # MUST be false — ROOT was temporary
has $ADMIN_PLUGIN_ADDRESS              $EXEC   # true for now — armed on purpose until the private
                                               # phase lands (INV-29 deliberately deferred)

# The body must read BondedVotes itself, not a silently-cloned wrapper:
cast call $TOKEN_VOTING_PLUGIN_ADDRESS "getVotingToken()(address)" --rpc-url $RPC_URL
# MUST equal 0x028deEA644258c78b1B5B2eacF469F5D781Fb43E
```

Then run one **throwaway signaling proposal** end to end — create on the SPP, vote it through
(note: until FOLD is transferable, only accounts with vesting-lock/bond-derived voting power can
vote), advance, approve from this Safe at stage 1, execute — before opening the process up.

## Known state / open items

- **Both** this Safe and `0x5429D8C7…fC018` currently hold `EXECUTE_PROPOSAL_PERMISSION` on the
  Admin plugin — a rotation was started and not finished (INV-31). Finishing it
  (`make revoke-admin`, revoking `0x5429…`) is a separate decision; it does not block this
  install.
- The Admin bootstrap stays **armed** after this install (`DISARM_ADMIN=false`) so the private
  CRISP process can be added later without a vote. Keep the treasury empty until it is disarmed.
- Quorum is 2% of **total** FOLD supply (1.2B → 24M FOLD-worth of votes), while only bonded,
  vesting-locked, or escrow-locked FOLD carries voting power. Until locking/bonding is live at
  scale, reachable turnout is limited — deliberate, revisit via `updateVotingSettings` proposal
  if needed.
