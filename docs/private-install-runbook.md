# Private process install runbook (mainnet, phase 2)

Installs the **private CRISP process** (CrispVoting body + private SPP) into the live mainnet DAO
(`0x652a…679e`), driven entirely by the foundation Safe (`0x8B43…F593`). The Admin bootstrap is
still armed on purpose (INV-29 deferred); every DAO-touching step below is emitted as a Safe
Transaction Builder file that wraps `admin.executeProposal`.

Every `make` command takes `ENV_FILE=.env.mainnet` (your working copy of
`.env.mainnet.install`). Files land in `contracts/safe-actions/`.

## Already done — verified on chain 2026-08-22

- **The CRISP publish is live.** Safe tx
  `0xc3a6a5d11c1d74d68dd233d326f115f83c1ec59185175f67d996af289c19402b` (block 25804435) executed
  the atomic batch: `CrispVoting` implementation at
  `0x8eF90e60d2E7A176D05fc0E6329d00c224cc63a3`, `CrispVotingSetup` at
  `0x268ea81376dB1f25a44DD8ac4D97487e1DcE8244`, and the `interfold-crisp.plugin.dao.eth` repo at
  **`0x3C9F0abB016da5c1CCf944DDdfd2A04dd43415a1`** (Safe is maintainer; release 1 build 1
  verified to point at the setup).
- **The Interfold coordinator is live**:
  `INTERFOLD_ADDRESS = 0x28cF63B459e6218C69EA97ea7D90541cf648c715` — `feeToken()` is **USDS**
  (`0xdC035D45d973E3EC169d2276DDab16f1e407384F`, so the proposal-fee escrow holds USDS),
  `activeCryptoConfigId` is set, `e3RefundManager` is `0x1940eF168f4E0B3dA24BEca539856684793B0F6e`.
- All of the above, plus the Sepolia-proven E3 params (`COMMITTEE_SIZE`, `PARAM_SET`,
  `COMPUTE_PROVIDER_PARAMS` = RISC0) and the private-SPP repo refs, are **already committed in
  `.env.mainnet.install`**.

## The ONE remaining blocker

```bash
CRISP_PROGRAM_ADDRESS=""   # the REAL CRISP E3 program on mainnet — the ONLY missing value
```

The deployments manifest lists only `MockE3Program`
(`0x4976E5E47852eFCe6851d35B95A1A2E19456F3D7`, `mocks: true`). **Never point production at the
mock** — the program address is pinned at install and cannot be updated (INV-36); a wrong value
means a full reinstall. Also confirm with the Interfold team that the committed E3 params
(committee size 0, param set 0, RISC0 compute provider) are the intended mainnet values — the
install data embeds them.

### 1. Env additions (`.env.mainnet`)

```bash
CRISP_PROGRAM_ADDRESS="0x…"        # the real CRISP E3 program, once deployed
```

Already present and correct in the committed snapshot — do not change: `MINIMUM_PARTICIPATION="2"`
(2% quorum), `SUPPORT_THRESHOLD="51"` (>51% of yes+no, public-body parity),
`MINIMUM_DURATION="432000"` and `SPP_PRIVATE_VOTE_DURATION="432000"` (equal on purpose — INV-37:
the wiring refuses a stage window below the plugin floor), `MINIMUM_PROPOSER_VOTING_POWER="0"`
(the SPP's condition gates creators), `CRISP_SETUP_ADDRESS`, `CRISP_REPO_SUBDOMAIN`.

Sanity check before proceeding (any RPC):

```bash
cast code $CRISP_PROGRAM_ADDRESS   # must have code, and must NOT be the MockE3Program address
```

### 2. Metadata — already pinned

`contracts/metadata/private-process.json` is pinned and committed in the env:
`SPP_PRIVATE_METADATA_URI="ipfs://QmanRRpanrAZ79LDjZDHoSKz4RXYFu3CyUeNh1egN89n9T"`
("Interfold Governance Proposal: Confidential", key `IGPC` — verified retrievable). Re-pin and
regenerate only if the JSON changes.

There is no CRISP body metadata at install time (unlike TokenVoting, the setup takes none). The
body carries the same DAO-governed `setMetadata` surface as the SPP, so it can be named later by
a governance action if the Aragon app should display one.

### 3. Generate the install data + both prepare files — one command

```bash
cd contracts
make safe-prepare-private ENV_FILE=.env.mainnet
```

This refuses to run until `CRISP_PROGRAM_ADDRESS` and `SPP_PRIVATE_METADATA_URI` are set, then
generates the install data (the CRISP blob embeds the coordinator, program, E3 params and voting
settings — regenerate if any change) and emits `22-prepare-crisp.json` +
`23-prepare-spp-private.json`. Append the two printed `*_INSTALL_DATA=` lines to `.env.mainnet`
for the record.

### 4. Broadcast the prepares yourself — the foundation is NOT involved

The prepare files are DIRECT, permissionless `psp.prepareInstallation` calls that touch nothing
the DAO owns, so any funded EOA sends them — no Safe signatures, no round-trip:

```bash
make broadcast-prepares ENV_FILE=.env.mainnet   # sends both from PRIVATE_KEY, prints the tx hashes
make read-prepared ENV_FILE=.env.mainnet TX=0x<prepare-crisp-tx>       PLUGIN_PREFIX=CRISP        >> .env.mainnet
make read-prepared ENV_FILE=.env.mainnet TX=0x<prepare-spp-private-tx> PLUGIN_PREFIX=SPP_PRIVATE  >> .env.mainnet
```

(`read-prepared` parses the `InstallationPrepared` events, so the values `applyInstallation`
re-derives its setup id from are never transcribed by hand.)

### 5. ONE atomic apply + wire

```bash
make safe-install-private ENV_FILE=.env.mainnet
```

Emits `safe-actions/24-install-and-wire-private-process.json` — **the ONE thing the foundation
receives.** A single `admin.executeProposal` containing, in order: temporary ROOT to the PSP →
`applyInstallation` (CRISP body) → `applyInstallation` (private SPP) → ROOT revoked → private
stage config → `CREATE_PROPOSAL` on the body granted to the SPP only (INV-3) → body pointed at
the delegatecall Executor (INV-5). **Never split these across transactions**: an
applied-but-unwired SPP holds `EXECUTE` on the DAO with no stage configuration.

Hand them the JSON to load into the Safe Transaction Builder — or, if they prefer raw calldata,
the command also prints the exact `to` (the Admin plugin) and `data` to the console; the file
carries the same bytes, so either channel can be verified against the other.

It does **not** disarm the Admin bootstrap.

### 6. Verify (SECURITY.md runbook)

- `EXECUTE_PERMISSION` on the DAO: **both SPPs true; CRISP body, TokenVoting, Admin plugin,
  every EOA false.**
- CRISP body: `getVotingToken()` = BondedVotes (`0x028d…b43E`), `supportThreshold()` = 51,
  `minParticipation()` = 2, `getTargetConfig()` = (Executor `0x56ce…40A4`, DelegateCall).
- Private SPP stage 0: `voteDuration` 432000, `minAdvance` 0 (INV-9); stage 1 approval mode
  (`vetoThreshold` 0, INV-10).
- **Before real use**: fork-simulate a full private proposal (create → vote → tally → execute)
  against the live coordinator, the way `simulate-public-governance` covers the public path —
  the CRISP fee/refund flow has only ever run against mocks and testnet.

### 7. Afterwards (separate, deliberate steps)

- App env: `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS`, `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS` (from
  the read-prepared values), `NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS`, the CRISP server URL, and the
  fee-token address — the create flow also needs the CRISP server tracking this deployment.
- `make disarm-admin ENV_FILE=.env.mainnet` — INV-29's deferred disarm, only once everything is
  confirmed working. Rotation state first: exactly one driver on the Admin plugin (INV-31).
