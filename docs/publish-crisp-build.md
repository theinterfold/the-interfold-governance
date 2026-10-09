# Publishing a new CRISP build (foundation multisig)

This document tells the holders of the signing keys how to publish a new build of the CRISP plugin
into the **existing** mainnet repo. The foundation Safe signs one transaction. The document does not
assume knowledge of the work that produced the batch.

The generated file is `contracts/safe-actions/12-publish-crisp-build.json`.

---

## What this does and what it does not do

The batch publishes the next build of **release 1** into the repo at
`interfold-crisp.plugin.dao.eth`. A build is a new `CrispVotingSetup` and the `CrispVoting`
implementation that it pins.
Build 3 is expected next, not reserved. Read the actual build number from the publication receipt.

The batch does **not** install anything. Each installed plugin is a proxy that points at its own
implementation, so the installed private process stays on build 2. The DAO installs build 3 in a
separate step (see [After execution](#after-execution)).

The batch does **not** mint a repo. The repo exists (see the warning below).

## Why build 3

Build 3 contains the current `CrispVoting` source of this repository. Build 2 cannot run on the
Interfold v0.19 protocol, for two reasons.

1. **Circuit version.** Each E3 request carries the crypto config id that the plugin expects. Build 3
   calculates this id from the requested parameter set and the circuit version that it pins:

   ```solidity
   keccak256(abi.encode(
       keccak256("fhe.rs:BFV"),
       keccak256(interfold.paramSetRegistry(paramSet)),
       keccak256("interfold-bfv-v5")
   ))
   ```

   Interfold accepts a request only when this id is the id of the requested parameter set. Build 2
   sends `interfold.activeCryptoConfigId()`, which reports one fixed configuration. Thus build 2
   cannot detect a circuit change.

2. **Vote scale.** Build 3 divides each tally by the divisor that the CRISP program records for the
   round, `votingPowerDivisorOf(e3Id)`
   ([INV-16](../AGENTS.md#cross-boundary-sync-contract--server--app)). Build 2 uses a fixed unit of
   0.1 FOLD. On parameter set 2, one vote unit is approximately 70.59 FOLD. Thus build 2 would report
   participation approximately 706 times too low, and no proposal could reach quorum.

Build 3 needs the Interfold v0.19 cutover (see [Open items](#open-items-outside-this-batch)). If the
protocol changes its circuit version again, new requests stop until the DAO installs a new build.

## Do not use `make safe-create-repo` for this

`createPluginRepoWithFirstVersion` mints an ENS subdomain. The subdomain
`interfold-crisp.plugin.dao.eth` is already registered, so that call reverts:

```
AlreadyRegistered(bytes32 node, address owner)
  node  0x326257885ab9f01950f2a8083b2a639eca18d552ff938dc46e2bf2b39541b85c
  owner 0x35B62715459cB60bf6dC17fF8cfe138EA305E7Ee   (the plugin.dao.eth registrar)
```

A Transaction Builder batch is atomic. The revert therefore also cancels the two CREATE2 deploys in
the same batch, and the signing round has no result. Use `make safe-publish-crisp-build`, which
calls `createVersion` on the repo.

## Addresses

| What                                       | Address                                      |
| ------------------------------------------ | -------------------------------------------- |
| CRISP plugin repo                          | `0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1` |
| Foundation Safe (signer)                   | `0x8B43b2852fc5031D01DDfCDF702973D93A2FF593` |
| CREATE2 deployer                           | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |
| New `CrispVoting` implementation (build 3) | `0xE9173750958F9f1545bfcBf0b88fE71acE908518` |
| New `CrispVotingSetup` (build 3)           | `0xCc83E1936BA14F8F81Da21c1Df606033249ef29e` |
| Current `CrispVotingSetup` (build 2)       | `0xEB4086d0Ce4dfB0E6110577CEDe45CFB53F1767B` |

The repo address is not in a receipt. It was resolved from ENS:

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

- `contracts/.env.mainnet` contains `RPC_URL`, `CRISP_PLUGIN_REPO` and `CRISP_RELEASE=1`.
- Set published metadata URIs with `CRISP_BUILD_METADATA_URI` and `CRISP_RELEASE_METADATA_URI`.
  Leave release metadata empty to preserve the existing release entry. Do not use placeholder IPFS URIs.
  A new release requires real, non-empty release metadata.

---

## Generate

```bash
cd contracts
ENV_FILE=.env.mainnet make safe-publish-crisp-build   # -> safe-actions/12-publish-crisp-build.json
```

The generator is deterministic. The same salt and initcode give the same two addresses, so you can
run it again safely. Only `createdAt` changes.

## What is in the batch

Three calls, executed in order, atomically:

| #   | To               | Call                                                                    |
| --- | ---------------- | ----------------------------------------------------------------------- |
| 0   | CREATE2 deployer | `salt ++ initcode` → deploys `CrispVoting`                              |
| 1   | CREATE2 deployer | `salt ++ initcode` → deploys `CrispVotingSetup(impl)`                   |
| 2   | CRISP repo       | `createVersion(1, setup, buildMetadata, releaseMetadata)`               |

A Safe cannot send a raw contract creation. Each Transaction Builder entry is a call to an address,
so the two deploys go through the canonical CREATE2 deployer.

These calls are **direct**. They are not wrapped in `adminPlugin.executeProposal`, unlike the
install steps. `createVersion` checks `MAINTAINER_PERMISSION_ID` against `msg.sender`, and the Safe
holds that permission. The Admin wrapper would make the DAO the sender, and the check would fail.

## Verify before signing

The CREATE2 addresses depend only on the salt and the initcode, not on the Safe nonce. Thus you can
check both before you sign.

1. **Both target addresses are empty.** If one of them already holds code, the batch reverts:

   ```bash
   cast codesize 0xE9173750958F9f1545bfcBf0b88fE71acE908518 --rpc-url "$RPC_URL"   # expect 0
   cast codesize 0xCc83E1936BA14F8F81Da21c1Df606033249ef29e --rpc-url "$RPC_URL"   # expect 0
   ```

2. **tx2 points at the setup from tx1.** The setup address must be in the `createVersion` calldata.
   The `CrispVotingSetup` initcode in tx1 must contain the implementation from tx0, because the
   setup constructor pins it:

   ```bash
   cast decode-calldata "createVersion(uint8,address,bytes,bytes)" <tx2 data>
   ```

3. **The release is 1.** A different release starts a parallel line instead of the next build.

4. **The current state is release 1, build 2.** Thus this batch publishes build 3:

   ```bash
   cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
     'buildCount(uint8)(uint16)' 1 --rpc-url "$RPC_URL"   # expect 2 before, 3 after
   ```

5. **The implementation pins circuit version `interfold-bfv-v5`.** tx0 carries the `CrispVoting`
   initcode, which contains `keccak256("interfold-bfv-v5")`:

   ```bash
   cast keccak interfold-bfv-v5
   # -> 0x9ae5be6a352cd245259ba1cc07b57c755ecd466f62ff9b95d3ec77f05b8c24b0
   jq -r '.transactions[0].data' safe-actions/12-publish-crisp-build.json \
     | grep -c 9ae5be6a352cd245259ba1cc07b57c755ecd466f62ff9b95d3ec77f05b8c24b0   # expect 1
   ```

On 2026-10-09, the Safe executed this batch on a mainnet fork at block 26156057. All three calls
succeeded, and `buildCount(1)` changed from 2 to 3. The same rehearsal then installed build 3 with
[`private-install-runbook.md`](./private-install-runbook.md#rehearsal-record).

---

## After execution

1. **Read the new build number** from the `VersionCreated` event in the receipt. Expect
   `release 1, build 3`. Confirm on chain:

   ```bash
   cast call 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1 \
     'buildCount(uint8)(uint16)' 1 --rpc-url "$RPC_URL"
   ```

2. **Confirm the code** at both CREATE2 addresses. Expect a size that is not zero.

3. **Set `CRISP_BUILD` to the actual published build** in `contracts/.env.mainnet`.

4. **Install build 3 into the DAO** with [`private-install-runbook.md`](./private-install-runbook.md).
   The install needs `CRISP_PROGRAM_ADDRESS`, which must be the new CRISP program (see
   [Open items](#open-items-outside-this-batch)).

   Set the mainnet voter minimum to `71000000000000000000` (71 FOLD) before preparation.

### Reproduce the compiled bytecode

Keep the compiler artifacts and source revision with the checked batch. Verify these three links:

1. Compare each creation payload with the artifact's `bytecode.object`.
2. Check that its CBOR metadata digest commits to the artifact's `rawMetadata`.
3. Compare the metadata's source hashes with the frozen repository and dependency sources.

These checks establish artifact consistency, not independent compilation correctness.
For independent compilation, use the exact Solidity standard-JSON input and recorded compiler.
Preserve source names, contents and settings, including all remapping strings.
The v0.19 build uses Solidity `0.8.29`, Cancun, optimizer runs `200` and IPFS metadata hashing.
Absolute remapping contexts affect metadata. An ordinary build from another directory can produce different CREATE2 addresses.
Exact standard-JSON input can reproduce the bytecode on another machine.
Do not normalize remappings or disable metadata hashing for an already-checked batch.

## Open items outside this batch

Both items belong to a different repository (`theinterfold/interfold`). Build 3 cannot request an E3
until both are done. The source of truth for the sequence is the "v0.19 cutover on mainnet" section
of `agent/flow-trace/07_UPGRADES.md` in that repository.

### Interfold v0.19 cutover

Mainnet `Interfold` (`0x28cF63B459e6218C69EA97ea7D90541cf648c715`) still uses the crypto
configuration from before v0.19:

```bash
cast call 0x28cF63B459e6218C69EA97ea7D90541cf648c715 \
  'activeCryptoConfigId()(bytes32)' --rpc-url "$RPC_URL"
# -> 0xd9c86e581f8291ffb5b63595600e8d096ed30b16e2e0a6634a76c22b1f58fb4e  (before v0.19)
```

Build 3 sends the id of secure parameter set 2 with `interfold-bfv-v5`,
`0xa174862efd4487031d423ca96516807775ade0191c714e513aab93d0cc289baa`. Until the cutover, each
build 3 request reverts. Requests are paused (`requestsPaused()` is `true`), so no request fails
today.

The cutover goes through the `Interfold` ProxyAdmin (`0xB3985D7fF844FA0F5E0aaC5feb5DD8BE15e88580`,
owner `0x652a31c669f9AB37f6040f279139a75D04F2679e`). In the Interfold repository, generate the batch
with:

```bash
pnpm --dir packages/interfold-contracts upgrade:v19 -- --network mainnet \
  --openvm-identity <identity.json>
```

`<identity.json>` holds the `appExeCommit`, `appVmCommit` and `halo2RuntimeCodeHash` of the
release. The batch upgrades `Interfold`, registers parameter set 2 and installs the new verifiers. It
also registers and binds the new CRISP program, retires the earlier programs and keeps requests
paused. Do not use `upgrade:secure-crisp`. That command reads the RISC Zero program and cannot
prepare this cutover.

### New CRISP program

Interfold registers `0x53FCdb21E73A461CfE6c64B19855204384B91BA3` as the CRISP program. It is a
RISC Zero program, and the v0.19 cutover retires it. Deploy the OpenVM CRISP program before you
generate the cutover batch. In `examples/CRISP` of the Interfold repository, run
`pnpm deploy:contracts` with these settings:

- `CRISP_INITIAL_OWNER` is the DAO, `0x652a31c669f9AB37f6040f279139a75D04F2679e`.
- `INPUT_AVAILABILITY_SIGNER` is the key of the mainnet CRISP server.
- `DEFER_PROTOCOL_WIRING=true` and `ALLOW_MAINNET_DEFERRED_WIRING=true`. The DAO batch does the
  wiring.
- The `OPENVM_*` settings of the release. Mainnet refuses every mock verifier.

The deploy records the program in `examples/CRISP/packages/crisp-contracts/deployed_contracts.json`
under `mainnet`. The cutover batch registers the address recorded there.
