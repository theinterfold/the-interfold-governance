# Publishing a new CRISP build — foundation multisig

How to publish a new build of the CRISP plugin into the **existing** mainnet repo, as a Safe
transaction. Written for whoever holds the signing keys; it assumes no context from the work that
produced the batch.

The generated file is `contracts/safe-actions/12-publish-crisp-build.json`.

---

## What this does, and what it does not

Publishes a new **build** (release 1, build 3) of the CRISP plugin into the repo that already
exists at `interfold-crisp.plugin.dao.eth`. A build is a new `CrispVotingSetup` plus the
`CrispVoting` implementation it pins.

It does **not** install anything. Existing DAOs keep running their current build; their proxies
point at their own implementation and are untouched. Installing the new build into a DAO is a
separate, later step (see [After execution](#after-execution)).

It does **not** mint a repo. The repo exists — see the warning below.

## Why build 3

Build 3 contains the current `CrispVoting` source of this repository. Each E3 request carries the
crypto config id that the plugin expects. Build 3 calculates this id from the requested parameter
set and the circuit version that it pins:

```solidity
keccak256(abi.encode(
    keccak256("fhe.rs:BFV"),
    keccak256(interfold.paramSetRegistry(paramSet)),
    keccak256("interfold-bfv-v3")
))
```

Interfold accepts a request only when this id is the id of the requested parameter set. Build 3
therefore needs the Interfold v3 upgrade (see [Open items](#open-items-outside-this-batch)). If the
protocol changes its circuit version again, new requests stop until the DAO updates the plugin.

Build 2 sends `interfold.activeCryptoConfigId()`. After the v3 upgrade, that function returns the
secure id on every chain. On mainnet (`PARAM_SET=1`) the check therefore always passes, and it
cannot detect a circuit change. On the insecure set (`PARAM_SET=0`) every request reverts with
`CryptoConfigChanged`.

## Do not use `make safe-create-repo` for this

`createPluginRepoWithFirstVersion` mints an ENS subdomain. The subdomain
`interfold-crisp.plugin.dao.eth` is already registered, so that call reverts:

```
AlreadyRegistered(bytes32 node, address owner)
  node  0x326257885ab9f01950f2a8083b2a639eca18d552ff938dc46e2bf2b39541b85c
  owner 0x35B62715459cB60bf6dC17fF8cfe138EA305E7Ee   (the plugin.dao.eth registrar)
```

Because a Transaction Builder batch is atomic, that revert discards the two CREATE2 deploys in the
same batch as well — a wasted signing round, not a partial success. Use
`make safe-publish-crisp-build`, which calls `createVersion` on the repo instead.

## Addresses

| What | Address |
| --- | --- |
| CRISP plugin repo | `0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1` |
| Foundation Safe (signer) | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593` |
| CREATE2 deployer | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |
| New `CrispVoting` implementation (build 3) | `0x3fEa2cF187Eb48555FDBD699a7be754ED1b1f6E1` |
| New `CrispVotingSetup` (build 3) | `0x96C2CcAC29D6120b93Db2fBaaD7b6be360D69CaD` |
| Current `CrispVotingSetup` (build 2) | `0xEB4086d0Ce4dfB0E6110577CEDe45CFB53F1767B` |

The repo address is not in any receipt — it was resolved from ENS:

```bash
# node = namehash("interfold-crisp.plugin.dao.eth")
cast call 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e \
  'resolver(bytes32)(address)' \
  0x326257885ab9f01950f2a8083b2a639eca18d552ff938dc46e2bf2b39541b85c \
  --rpc-url "$RPC_URL"
# -> 0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41

cast call 0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41 \
  'addr(bytes32)(address)' \
  0x326257885ab9f01950f2a8083b2a639eca18d552ff938dc46e2bf2b39541b85c \
  --rpc-url "$RPC_URL"
# -> 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1
```

It is recorded as `CRISP_PLUGIN_REPO` in `contracts/.env.mainnet`.

## Prerequisites

- The Safe holds `MAINTAINER_PERMISSION_ID` on the repo. Confirm, expect `true`:

  ```bash
  cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
    'isGranted(address,address,bytes32,bytes)(bool)' \
    0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
    0x8B43b2852fc5031D01DDfCDF702973D93A2FF593 \
    0xa0885006fe6672eeafd1deca6c67bcdc6dd79cfe2b157a98539ddf73cd8c04ea \
    0x --rpc-url "$RPC_URL"
  ```

- `contracts/.env.mainnet` is populated (`RPC_URL`, `CRISP_PLUGIN_REPO`, `CRISP_RELEASE=1`).

---

## Generate

```bash
cd contracts
ENV_FILE=.env.mainnet make safe-publish-crisp-build   # -> safe-actions/12-publish-crisp-build.json
```

Regenerating is deterministic: the same salt and initcode produce the same two addresses, so a
re-run is safe and should print identical values.

## What is in the batch

Three calls, executed in order, atomically:

| # | To | Call |
| --- | --- | --- |
| 0 | CREATE2 deployer | `salt ++ initcode` → deploys `CrispVoting` |
| 1 | CREATE2 deployer | `salt ++ initcode` → deploys `CrispVotingSetup(impl)` |
| 2 | CRISP repo | `createVersion(1, setup, "ipfs://crisp-build", "ipfs://crisp-release")` |

A Safe cannot issue a raw contract creation — every Transaction Builder entry is a call to an
address — so the two deploys go through the canonical CREATE2 deployer.

Unlike the install steps in `production-multisig-install.md`, these calls are **direct**, not
wrapped in `adminPlugin.executeProposal`. `createVersion` authorises on `MAINTAINER_PERMISSION_ID`
against `msg.sender`, and the Safe holds it, so the Admin wrapper would break the auth check rather
than satisfy it.

## Verify before signing

The CREATE2 addresses depend only on salt and initcode, never on the Safe's nonce, so both are
checkable in advance.

1. **Both target addresses are empty.** If either already holds code the batch reverts:

   ```bash
   cast codesize 0x3fEa2cF187Eb48555FDBD699a7be754ED1b1f6E1 --rpc-url "$RPC_URL"   # expect 0
   cast codesize 0x96C2CcAC29D6120b93Db2fBaaD7b6be360D69CaD --rpc-url "$RPC_URL"   # expect 0
   ```

2. **tx2 decodes to the setup from tx1.** The setup address must appear in the `createVersion`
   calldata, and the `CrispVotingSetup` initcode in tx1 must embed the implementation from tx0 —
   the setup's constructor pins it:

   ```bash
   cast decode-calldata "createVersion(uint8,address,bytes,bytes)" <tx2 data>
   ```

3. **The release is 1** — publishing under a different release creates a parallel line rather than
   the next build.

4. **Current state is release 1, build 2**, so this publishes build 3:

   ```bash
   cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
     'buildCount(uint8)(uint16)' 1 --rpc-url "$RPC_URL"   # expect 2 before, 3 after
   ```

5. **The implementation pins circuit version `interfold-bfv-v3`.** tx0 carries the `CrispVoting`
   initcode, which contains `keccak256("interfold-bfv-v3")`:

   ```bash
   cast keccak interfold-bfv-v3
   # -> 0x40c214c1c8d701e4186f06e5dd97b31fe3f009e937df359826a4fc94f96387fe
   jq -r '.transactions[0].data' safe-actions/12-publish-crisp-build.json \
     | grep -c 40c214c1c8d701e4186f06e5dd97b31fe3f009e937df359826a4fc94f96387fe   # expect 1
   ```

This batch was simulated on a mainnet fork on 2026-10-05, executed as the Safe. All three calls
succeed, `buildCount(1)` goes `2 → 3`, and the new implementation contains the v3 constant.

---

## After execution

1. **Read the new build number** from the `VersionCreated` event in the receipt — expect
   `release 1, build 3`. Confirm on chain:

   ```bash
   cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
     'buildCount(uint8)(uint16)' 1 --rpc-url "$RPC_URL"
   ```

2. **Confirm code** at both CREATE2 addresses (non-zero).

3. **Set `CRISP_BUILD=3`** in `contracts/.env.mainnet`.

4. **Point the app at the new build**: `crispPlugin.installVersion` in the Aragon app config. The
   app and the published build must agree — `CrispVotingSetup` decodes the installation params, so
   an app pointing at a build whose setup decodes a different tuple will fail to install.

5. **Installing into a DAO is a separate step.** It needs `CRISP_INSTALL_DATA`, produced by
   `make print-crisp-install-data`, which requires `CRISP_PROGRAM_ADDRESS`. That address must be a
   new CRISP program (see [Open items](#open-items-outside-this-batch)). For the mainnet DAO, follow
   [`private-install-runbook.md`](./private-install-runbook.md).

## Open items outside this batch

Both items belong to a separate repository (`theinterfold/interfold`). Build 3 cannot request an E3
until both are done.

### Interfold v3 upgrade

Mainnet `Interfold` (`0x28cF63B459e6218C69EA97ea7D90541cf648c715`) still uses the crypto
configuration from before v3:

```bash
cast call 0x28cF63B459e6218C69EA97ea7D90541cf648c715 \
  'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
# -> 0xd9c86e581f8291ffb5b63595600e8d096ed30b16e2e0a6634a76c22b1f58fb4e  (secure, before v3)
```

Build 3 sends the v3 secure id, `0x3115e08eb5c87d6d245eda5dff0cf377c42e29b9741f94fc7a83efc3da7da920`.
Until the upgrade, each build 3 request reverts with `CryptoConfigChanged`. Requests are paused
(`requestsPaused()` is `true`), so no request fails today.

The upgrade goes through the `Interfold` ProxyAdmin (`0xB3985D7fF844FA0F5E0aaC5feb5DD8BE15e88580`,
owner `0x652a31c669f9AB37f6040f279139a75D04F2679e`). In the Interfold repository, generate the batch
with:

```bash
pnpm --dir packages/interfold-contracts upgrade:secure-crisp -- --network mainnet
```

The same batch registers and binds the CRISP program recorded for mainnet. The "Deploying" section
of `examples/CRISP/RELEASING.md` in that repository gives the validation and unpause steps.

### New CRISP program

Interfold registers `0x53FCdb21E73A461CfE6c64B19855204384B91BA3` as the CRISP program. Its vote-proof
verifiers come from an older circuit generation, so it cannot verify proofs from `@crisp-e3` 0.24.0.
Deploy a new CRISP program before you generate the upgrade batch. Record it for mainnet in
`examples/CRISP/packages/crisp-contracts/deployed_contracts.json`, because the batch registers the
address recorded there.
