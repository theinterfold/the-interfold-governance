# Private process install runbook (mainnet, phase 2)

Installs the **Interfold Protocol Proposal (IPP)** process — receipt-free secret-ballot voting
using CRISP — into the live mainnet DAO (`0x652a31c669f9AB37f6040f279139a75D04F2679e`). Two
stages, mirroring the public process: **5 days of FOLD-holder voting** (encrypted CRISP ballots,
2% quorum, >51% support, bonded and vesting-locked FOLD carry weight) followed by a **5-day
Interfold Foundation approval window**. Approved proposals execute on the DAO.

Everything in this file is self-contained: current on-chain state, what remains, who signs what,
and how to verify. All `make` commands run from `contracts/` with `ENV_FILE=.env.mainnet` (your
copy of the committed `.env.mainnet.install`); emitted Safe files land in
`contracts/safe-actions/`.

> **The 2026-08-22 prepare files were removed.** They pinned CRISP build 1, the retired program
> `0x847A…169f` and the insecure test parameters (`PARAM_SET=0`, `COMMITTEE_SIZE=0`). Generate both
> files again in [Step 0](#step-0--prerequisites-and-prepare-files).

---

## Current state — verified on chain 2026-10-05

| What                                                | Where                                                                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DAO                                                 | `0x652a31c669f9AB37f6040f279139a75D04F2679e`                                                                                                                                                                                |
| Foundation Safe (Admin driver)                      | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593`                                                                                                                                                                                |
| CRISP PluginRepo (`interfold-crisp.plugin.dao.eth`) | `0x3C9F0abB016da5c1CCf944DDdfd2A04dd43415a1` — release 1 has builds 1 and 2; Safe is maintainer. Minted in tx `0xc3a6a5d11c1d74d68dd233d326f115f83c1ec59185175f67d996af289c19402b`                                          |
| CRISP builds (release 1)                            | Build 1: setup `0x268e…8244`, implementation `0x8eF9…63a3`. Build 2: setup `0xEB40…767B`, implementation `0xb3d5…97DA`. Neither is used here                                                                                |
| CRISP build 3 (not published)                       | Setup `0x96C2CcAC29D6120b93Db2fBaaD7b6be360D69CaD`, implementation `0x3fEa2cF187Eb48555FDBD699a7be754ED1b1f6E1` — `safe-actions/12-publish-crisp-build.json`, see [publish-crisp-build.md](./publish-crisp-build.md)        |
| Interfold coordinator                               | `0x28cF63B459e6218C69EA97ea7D90541cf648c715` — `feeToken()` = **USDS** (`0xdC03…384F`), so the proposal-fee escrow holds USDS; refund manager `0x1940…0F6e`; `requestsPaused()` = `true`; pre-v3 crypto config (see Step 0) |
| CRISP E3 program                                    | **None usable.** `0x847A…169f` is retired (`e3Programs` = `false`). `0x53FC…1BA3` is registered, but its vote-proof verifiers predate `@crisp-e3` 0.24.0. Pinned at install, not updatable                                  |
| Process metadata (pinned)                           | `ipfs://QmSEYaoXRLu2ut2aBkCB527cLQV5ow1JUij4HxkRYXBd2Y` — "Interfold Protocol Proposal", key `IPP`                                                                                                                          |
| Prepare files                                       | None. Step 0 generates `safe-actions/22-prepare-crisp.json` and `23-prepare-spp-private.json`                                                                                                                               |

`.env.mainnet.install` holds every input except `CRISP_PROGRAM_ADDRESS`. Step 0 generates the
install data and the prepare files from it. The Admin bootstrap is still armed on purpose (INV-29
deferred); the final install is one `admin.executeProposal` signed by the foundation Safe.

## Voting rules being installed

- Quorum **2%** of total FOLD supply at the snapshot (`MINIMUM_PARTICIPATION=2`, RATIO_BASE 100).
- Support: yes must **strictly exceed 51%** of yes+no (`SUPPORT_THRESHOLD=51`); abstain counts
  toward quorum, never toward support. Public-body parity (TokenVoting runs 510000 ppm).
- Stage 0: **5 days** of encrypted voting (`SPP_PRIVATE_VOTE_DURATION=432000`, equal to the
  plugin's own `MINIMUM_DURATION` floor — INV-37), +10 days to advance a passed vote
  (`SPP_PRIVATE_ADVANCE_WINDOW=864000`). That window covers Avail finalization, compute and
  decryption after the ballots close.
- Stage 1: **5 days** foundation approval (approval mode: 2d + 3d summed into `maxAdvance`;
  silence past it = expiry = rejection). Both quorum and support are frozen per proposal at
  creation (INV-33).
- E3: the secure-8192 parameter set (`PARAM_SET=2`) and the Small committee, 14 of 19
  (`COMMITTEE_SIZE=2`). Mainnet accepts no other values.

---

## Remaining steps

### Step 0 — prerequisites and prepare files

Do these items in order. Items 1 and 2 are in the Interfold repository (`theinterfold/interfold`).

1. Deploy a new CRISP program from the source that published `@crisp-e3` 0.24.0. Record it for
   mainnet in `examples/CRISP/packages/crisp-contracts/deployed_contracts.json`.
2. Run `upgrade:secure-crisp` as the "Deploying" section of `examples/CRISP/RELEASING.md` describes.
   Governance executes the batch. It upgrades Interfold to the v3 crypto configuration, then
   registers and binds the recorded CRISP program. Private proposals revert until the follow-up
   unpause transaction executes.
3. Execute `safe-actions/12-publish-crisp-build.json` to publish CRISP build 3
   ([publish-crisp-build.md](./publish-crisp-build.md)). This item does not depend on items 1 and 2.
4. Confirm the on-chain state:

   ```bash
   cast call 0x28cF63B459e6218C69EA97ea7D90541cf648c715 'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
   # expect 0x3115e08eb5c87d6d245eda5dff0cf377c42e29b9741f94fc7a83efc3da7da920
   cast call 0x28cF63B459e6218C69EA97ea7D90541cf648c715 'e3Programs(address)(bool)' <new program> --rpc-url "$RPC_URL"
   # expect true
   cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 'buildCount(uint8)(uint16)' 1 --rpc-url "$RPC_URL"
   # expect 3
   ```

5. Set `CRISP_PROGRAM_ADDRESS` in `.env.mainnet` to the new program. Make sure that `CRISP_BUILD`
   is `3`.
6. Generate the install data and both prepare files:

   ```bash
   make safe-prepare-private ENV_FILE=.env.mainnet
   ```

7. Append the two printed `*_INSTALL_DATA` lines to `.env.mainnet` for the record.
8. Verify the values that the two files embed: the program, the coordinator, BondedVotes, the repo
   and build 3, the IPP metadata URI, 2% / 51% / 5 days, `PARAM_SET=2`, `COMMITTEE_SIZE=2` and the
   RISC0 params.

### Step 1 — execute the two prepare transactions

`22-prepare-crisp.json` and `23-prepare-spp-private.json` are **direct, permissionless**
`prepareInstallation` calls to the PluginSetupProcessor (`0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f`).
They deploy the two plugin proxies and record prepared setups; **the DAO is untouched** until the
apply in step 3, so nothing here needs DAO authority.

Either channel works — pick one:

- **Foundation Safe** (uniform "everything from the Safe" story): load each JSON into the Safe
  Transaction Builder and execute. No particular order, no bundling needed.
- **Any funded EOA** (fewer signing ceremonies): `make broadcast-prepares ENV_FILE=.env.mainnet`
  sends both and prints the tx hashes.

### Step 2 — read the receipts back into the env

The apply re-derives each prepared setup id from the plugin address, permission set and helpers
hash carried by the `InstallationPrepared` events — these are parsed from the receipts, never
transcribed by hand:

```bash
make read-prepared ENV_FILE=.env.mainnet TX=0x<tx-of-22> PLUGIN_PREFIX=CRISP        >> .env.mainnet
make read-prepared ENV_FILE=.env.mainnet TX=0x<tx-of-23> PLUGIN_PREFIX=SPP_PRIVATE  >> .env.mainnet
```

(The prepare txs are public; whoever runs this step can take the hashes straight off the block
explorer.)

### Step 3 — generate the ONE transaction the foundation signs

```bash
make safe-install-private ENV_FILE=.env.mainnet
```

Emits **`safe-actions/24-install-and-wire-private-process.json`** — a single
`admin.executeProposal` on the Admin plugin (`0xf21E25455988887ee797050080141EBa67b33920`)
containing, atomically and in order:

1. grant ROOT on the DAO → PluginSetupProcessor (opens the install window)
2. `applyInstallation` — CRISP body
3. `applyInstallation` — private SPP (the SPP holds `EXECUTE` on the DAO from this instant)
4. revoke ROOT from the PSP (closes the install window)
5. `updateStages` on the private SPP — the 5-day vote + 5-day approval config
6. grant `CREATE_PROPOSAL` on the body to the SPP **only** (INV-3)
7. point the body at the delegatecall Executor `0x56ce4D8006292Abf418291FaE813C1E3769240A4` (INV-5)

**This must stay one transaction.** Split apart, there is a window where the applied SPP holds
`EXECUTE` on the DAO with no stage configuration. It does **not** disarm the Admin bootstrap.

Hand the foundation the JSON for the Safe Transaction Builder — the command also prints the
identical `to` + `data` to the console, so raw calldata can be cross-checked against the file.

### Step 4 — verify (SECURITY.md runbook)

After execution, confirm on chain:

- `EXECUTE_PERMISSION` on the DAO: **both SPPs true; CRISP body, TokenVoting, Admin plugin, and
  every EOA false** (INV-2).
- CRISP body: `getVotingToken()` = BondedVotes `0x028deEA644258c78b1B5B2eacF469F5D781Fb43E`,
  `supportThreshold()` = 51, `minParticipation()` = 2, `getTargetConfig()` =
  (`0x56ce…40A4`, DelegateCall).
- Private SPP stage 0: `voteDuration` 432000, `minAdvance` 0 (INV-9); stage 1:
  `vetoThreshold` 0 ⇒ approval mode (INV-10), 5-day window.
- **Before announcing**: fork-simulate one full private proposal (create → vote → tally →
  execute) against the live coordinator — the USDS fee escrow and refund path have only ever run
  against mocks and testnet.

### Step 5 — afterwards (separate, deliberate steps)

- **App env**: `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` and `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS`
  (the read-prepared values), `NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS` (the new program, the same value
  as `CRISP_PROGRAM_ADDRESS`), `NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS` (USDS), and the
  production CRISP server URL — the create flow also needs the CRISP server tracking this
  deployment and the new program.
- **Disarm**: `make disarm-admin ENV_FILE=.env.mainnet` — INV-29's deferred disarm, only once
  everything is confirmed working. Check rotation state first: exactly one address may hold
  `EXECUTE_PROPOSAL_PERMISSION` on the armed Admin plugin (INV-31).
