# Production install runbook — foundation multisig

Every transaction in this runbook is signed by the foundation multisig. Nothing is broadcast from
an EOA, and no hot key ever holds authority over the DAO.

This is the production path. The EOA flow in
[`mainnet-deployment.md`](./mainnet-deployment.md) — `publish-crisp-repo`, `prepare-private-process`,
`install-private-process` — stays as the **testing** path on Sepolia and local forks, where an
armed deployer key is an acceptable trade for speed. Do not mix them: an install prepared by an EOA
can be applied by the multisig, but then the record of who deployed what is split across two
authorities.

## What changes versus the EOA flow

The runbook in `mainnet-deployment.md` leaves the Admin bootstrap armed on a **deployer EOA**
between phases, and says plainly that the key is "strictly more powerful" than the multisig for
that window. This flow removes that window: the multisig is the bootstrap driver from the start, so
there is never a single key that can move treasury funds or replace plugins.

The cost is signing rounds. Each step below is one Safe transaction, gathered and executed
separately, and two of them must be executed in order because the second consumes the first's
output.

## Prerequisites

- `make grant-admin` has named the foundation Safe as the bootstrap driver
  (`ADMIN_SUCCESSOR_ADDRESS = <the Safe>`), and `make revoke-admin` has removed the deployer.
  Verify before starting: the Safe must hold `EXECUTE_PROPOSAL_PERMISSION` on the Admin plugin, and
  the deployer must hold nothing.
- `.env` (or `.env.mainnet`) carries `DAO_ADDRESS`, `ADMIN_PLUGIN_ADDRESS`,
  `PLUGIN_SETUP_PROCESSOR_ADDRESS`, `PLUGIN_REPO_FACTORY_ADDRESS`, `FOUNDATION_ADDRESS`, `RPC_URL`.
- `FOUNDATION_ADDRESS` is the Safe. It is used both as the repo maintainer and as
  `createdFromSafeAddress` in the generated files.

## How the generated files work

Each `make safe-*` target writes one Safe Transaction Builder file into `safe-actions/` and prints
the same call to the console, so a reviewer can check the file against the terminal without
trusting the JSON writer.

Every file targets the **Admin plugin**, not the DAO or the PluginSetupProcessor. The DAO must be
the `msg.sender` for `applyInstallation` and for its own permission changes, so each action is
wrapped in `adminPlugin.executeProposal(metadata, [action], 0)`. Executed straight from the Safe,
the inner call would arrive with the Safe as sender and revert.

Before signing, decode and confirm the inner action matches what the step claims:

```bash
cast decode-calldata "executeProposal(bytes,(address,uint256,bytes)[],uint256)" <data>
```

The metadata field decodes to the action's name, which is a cheap sanity check that you are
signing the file you think you are.

---

## Step 1 — deploy the plugin setup

```bash
make safe-deploy-setup                     # -> safe-actions/10-deploy-plugin-setup.json
```

A Safe cannot issue a raw contract creation: every Transaction Builder entry is a call to an
address. The setup is therefore deployed through the canonical CREATE2 deployer
(`0x4e59b448…`), called with `salt ++ initcode`.

Set `SETUP_SALT` and `SETUP_INITCODE` (the creation bytecode from the build artifact). The script
prints the **predicted address**, which depends only on those two inputs — not on the Safe's nonce.

**Verify before signing:** recompute the predicted address independently, and confirm the initcode
hash matches the artifact you reviewed.
**After execution:** confirm code exists at the predicted address, and set `CRISP_SETUP_ADDRESS`.

## Step 2 — create the plugin repo

```bash
make safe-create-repo                      # -> safe-actions/11-create-crisp-repo.json
```

Mints the `PluginRepo` with its first version pointing at the setup from step 1, and hands
maintainership to the Safe. The factory transfers ownership itself, so there is no intermediate
holder and no handover step to forget — publishing any future build is a multisig action from the
first block.

**After execution:** read the new repo address from the receipt and set `<PREFIX>_PLUGIN_REPO`.

## Step 3 — prepare each installation

```bash
make safe-prepare-install PLUGIN_PREFIX=SPP_PUBLIC   PLUGIN_SLUG=20-prepare-spp-public
make safe-prepare-install PLUGIN_PREFIX=TOKEN_VOTING PLUGIN_SLUG=21-prepare-token-voting
make safe-prepare-install PLUGIN_PREFIX=CRISP        PLUGIN_SLUG=22-prepare-crisp
```

Each needs `<PREFIX>_PLUGIN_REPO`, optionally `<PREFIX>_RELEASE` / `_BUILD` (default 1/1), and
`<PREFIX>_INSTALL_DATA` — the encoded install params. For TokenVoting that is
`TokenVotingInstall.encode(fold, votingSettings, minApprovals)`, where **`fold` is the
`BondedVotes` wrapper**, not the raw token, so bonded FOLD counts toward voting power.

`prepareInstallation` deploys the plugin proxy and records a prepared setup. **The DAO is unchanged
until the matching apply.** Nothing here is irreversible: a prepared setup that is never applied
simply expires unused.

**After execution — this is the sequencing constraint.** `applyInstallation` re-derives the prepared
setup id from values only the `InstallationPrepared` event carries. Read them straight from the
receipt rather than transcribing by hand:

```bash
make read-prepared TX=<prepare-tx-hash> PLUGIN_PREFIX=CRISP >> .env
```

That derives the helpers hash the way `hashHelpers` does — `keccak256(abi.encode(address[]))` —
and preserves permission order exactly as emitted, because the setup id hashes the sequence. It
refuses outright if any permission carries a condition: the generator encodes `NO_CONDITION`, and
the condition is hashed into the setup id, so such an action would be rejected on chain with
nothing naming the field.

The values it writes are

- `<PREFIX>_PLUGIN_ADDRESS` — the deployed plugin
- `<PREFIX>_HELPERS_HASH` — `keccak256` of the helpers
- `<PREFIX>_PERM_OPS`, `_PERM_WHERE`, `_PERM_WHO`, `_PERM_IDS` — the permission set, as four
  comma-separated lists **in the order the event emitted them**

If you do read them by hand instead, order matters: the prepared setup id hashes the sequence, and
`applyInstallation` re-derives it and reverts on any mismatch. That is a feature — a mistyped
permission fails on chain rather than silently installing something else — but it is the step most
worth automating, which is why `read-prepared` exists.

## Step 4 — open the installation window

```bash
make safe-grant-root                       # -> safe-actions/00-grant-root-to-psp.json
```

Grants `ROOT` on the DAO to the PluginSetupProcessor. `applyInstallation` authorises on
`msg.sender == dao`, but the PSP needs ROOT to apply each setup's own permission changes.

ROOT on the PSP is a standing capability, not an open door: `applyInstallation` still requires the
caller to be the DAO, so it can only be used through this same Admin-plugin path. It is
nevertheless the widest permission in the system — keep the window as short as the signing schedule
allows, and close it in step 6.

## Step 5 — apply each installation

```bash
make safe-apply-install PLUGIN_PREFIX=SPP_PUBLIC   PLUGIN_SLUG=01-install-spp-public
make safe-apply-install PLUGIN_PREFIX=TOKEN_VOTING PLUGIN_SLUG=02-install-token-voting
make safe-apply-install PLUGIN_PREFIX=CRISP        PLUGIN_SLUG=03-install-crisp
```

This is where each plugin actually becomes installed. Sign them one at a time and verify on chain
between each: the plugin appears in the DAO's plugin list, and its permissions match the set you
recorded in step 3.

## Step 6 — close the window

```bash
make safe-revoke-root                      # -> safe-actions/99-revoke-root-from-psp.json
```

Revokes ROOT from the PSP. Nothing can be installed until it is granted again — which is the point.

Run this even if an installation failed or was abandoned. A failed install is never a reason to
leave ROOT outstanding.

## Step 7 — wire the process

```bash
make safe-wire                             # -> safe-actions/30-wire-spp.json
```

Stages, `CREATE_PROPOSAL` grants and `setTargetConfig`, emitted as **one** file rather than one per
action. A process wired halfway is broken in a way chain state does not make obvious: stages with
no grant means nobody can create proposals, a grant with no stages means proposals go nowhere.
Bundling them into a single `executeProposal` makes the wiring all-or-nothing.

Set `WITH_PRIVATE=false` to wire only the public process.

This never disarms the Admin bootstrap. That stays its own deliberate action, so a wiring that
needs a retry is not entangled with an irreversible revoke.

---

## Verification

Do not announce a deployment before all of these pass:

- The Safe holds `EXECUTE_PROPOSAL_PERMISSION` on the Admin plugin; no EOA does.
- The PSP holds no ROOT on the DAO.
- Each installed plugin's permission set matches what step 3 recorded.
- The CRISP repo's maintainer is the Safe.
- TokenVoting's token is the `BondedVotes` wrapper, so bonded operators carry voting power.

The broader post-deployment checks in
[`SECURITY.md`](../SECURITY.md#deployment-verification-runbook) still apply.

## Keeping the generated files

`safe-actions/` is not gitignored. Committing the files gives an audit trail of exactly what was
signed; leaving them out keeps generated artefacts from the history. Either is defensible — decide
once, because a half-committed directory is worse than neither.
