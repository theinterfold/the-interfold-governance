// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";

import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginSetupRef} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {IAdmin, WireSppScript} from "./WireSpp.s.sol";

/// @dev The DAO permission surface this script touches. Declared locally rather than imported so
///      the file does not depend on the full DAO interface.
interface IDAOPermissions {
    function grant(address where, address who, bytes32 permissionId) external;
    function revoke(address where, address who, bytes32 permissionId) external;
}

/**
 * @title SafeActions
 * @notice Emits the DAO-authorised steps of a plugin installation as Safe Transaction Builder
 *         files — one file per action — for a DAO whose execute rights sit with the foundation
 *         multisig.
 *
 * @dev Splits cleanly along an authority line:
 *
 *        EOA (no multisig, nothing owned by the DAO changes)
 *          - deploy the plugin setup, create the repo
 *          - `psp.prepareInstallation` per plugin: deploys the plugin proxy and RECORDS a prepared
 *            setup. The DAO is untouched until it is applied.
 *
 *        MULTISIG (this script)
 *          - `psp.applyInstallation` per plugin, which is what actually installs it
 *          - the wiring that follows: stages, CREATE_PROPOSAL grants, target config
 *
 *      `applyInstallation` re-derives the prepared setup id from the plugin address, the
 *      permissions and the helpers hash, and reverts on any mismatch. The values below therefore
 *      have to be the exact ones `prepareInstallation` emitted — this script cannot invent them,
 *      and a mistyped permission is caught on chain rather than silently installing something
 *      else.
 *
 *      Assumes the PSP already holds ROOT on the DAO. `applyInstallation` authorises on
 *      `msg.sender == dao`, but the PSP needs ROOT to apply the setup's own permission changes.
 *      `grantRootToPsp()` / `revokeRootFromPsp()` emit those as their own files for when you want
 *      to open and close that window explicitly.
 */
contract SafeActionsScript is WireSppScript {
    bytes32 internal constant ROOT_PERMISSION_ID = keccak256("ROOT_PERMISSION");

    struct Prepared {
        address plugin;
        PluginSetupRef setupRef;
        PermissionLib.MultiTargetPermission[] permissions;
        bytes32 helpersHash;
    }

    /// @dev Deliberately not under `out/`: that is forge's build directory, so `forge clean`
    ///      would delete signed-but-unexecuted actions.
    string internal constant OUT_DIR = "safe-actions";

    // --- entrypoints ---------------------------------------------------------------

    /// @notice Emit `grant(ROOT)` to the PSP as its own action.
    function grantRootToPsp() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");

        _emit(
            "00-grant-root-to-psp",
            "Grant ROOT on the DAO to the PluginSetupProcessor",
            "Required before any applyInstallation: the PSP applies the setup's permission changes "
            "as the DAO. Revoke it with 01-revoke-root-from-psp once installing is finished.",
            dao,
            abi.encodeCall(IDAOPermissions.grant, (dao, psp, ROOT_PERMISSION_ID))
        );
    }

    /// @notice Emit `revoke(ROOT)` from the PSP as its own action.
    function revokeRootFromPsp() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");

        _emit(
            "99-revoke-root-from-psp",
            "Revoke ROOT on the DAO from the PluginSetupProcessor",
            "Closes the installation window. Nothing can be installed until ROOT is granted again.",
            dao,
            abi.encodeCall(IDAOPermissions.revoke, (dao, psp, ROOT_PERMISSION_ID))
        );
    }

    /// @notice Emit `applyInstallation` for one prepared plugin.
    /// @dev Reads the prepared values from env under `<PREFIX>_` so the same entrypoint serves
    ///      every plugin, rather than a near-duplicate function per plugin that can drift.
    function applyInstall() external {
        string memory prefix = vm.envString("PLUGIN_PREFIX");
        string memory slug = vm.envString("PLUGIN_SLUG");

        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");

        Prepared memory p = _loadPrepared(prefix);

        _emit(
            slug,
            string.concat("Install ", prefix, " plugin ", vm.toString(p.plugin)),
            "psp.applyInstallation for a setup prepared by an EOA. The PSP re-derives the setup id "
            "from the plugin, permissions and helpers hash below and reverts on any mismatch, so "
            "this cannot install a different plugin than the one that was prepared.",
            psp,
            abi.encodeCall(
                PluginSetupProcessor.applyInstallation,
                (dao, PluginSetupProcessor.ApplyInstallationParams(p.setupRef, p.plugin, p.permissions, p.helpersHash))
            )
        );
    }

    /// @notice Emit the deployment of a plugin setup contract, through the canonical CREATE2
    ///         deployer.
    /// @dev A Safe cannot issue a raw contract creation from the Transaction Builder — every entry
    ///      is a call to an address. Deploying therefore goes through the deterministic deployer
    ///      at 0x4e59b448..., which the Safe calls with `salt ++ initcode`. The resulting address
    ///      depends only on the salt and the initcode, so it can be computed and checked before
    ///      the transaction is signed.
    ///
    ///      SETUP_INITCODE is the creation bytecode of the setup contract, taken from the build
    ///      artifact. It is not derived here: the file this is generated from is the audited
    ///      artifact, and re-deriving it inside the script would let a source change alter what
    ///      gets deployed without the reviewer seeing a different hex string.
    function deploySetupViaCreate2() external {
        address deployer = vm.envOr("CREATE2_DEPLOYER", address(0x4e59b44847b379578588920cA78FbF26c0B4956C));
        bytes32 salt = vm.envBytes32("SETUP_SALT");
        bytes memory initcode = vm.envBytes("SETUP_INITCODE");

        address predicted = vm.computeCreate2Address(salt, keccak256(initcode), deployer);
        console2.log("  predicted setup address: %s", predicted);
        console2.log("  (verify this on chain after execution before preparing an install)");

        _emit(
            "10-deploy-plugin-setup",
            string.concat("Deploy plugin setup via CREATE2 to ", vm.toString(predicted)),
            "Safe calls the deterministic deployer with salt ++ initcode. The address is fixed by "
            "those two inputs, so it can be verified before signing and does not depend on the " "Safe's nonce.",
            deployer,
            bytes.concat(salt, initcode)
        );
    }

    /// @notice Emit `createPluginRepoWithFirstVersion`, minting the repo with the Safe as
    ///         maintainer.
    /// @dev Ownership is transferred to the maintainer by the factory itself, so the Safe owns the
    ///      repo from the first block — there is no intermediate holder and no handover step.
    function createRepo() external {
        address factory = vm.envAddress("PLUGIN_REPO_FACTORY_ADDRESS");
        address safe = vm.envAddress("FOUNDATION_ADDRESS");
        string memory subdomain = vm.envString("CRISP_REPO_SUBDOMAIN");
        address setup = vm.envAddress("CRISP_SETUP_ADDRESS");

        _emit(
            "11-create-crisp-repo",
            string.concat("Create the CRISP plugin repo '", subdomain, "'"),
            "Mints the PluginRepo with its first version pointing at the setup deployed in the "
            "previous action, and hands maintainership to this Safe.",
            factory,
            abi.encodeWithSignature(
                "createPluginRepoWithFirstVersion(string,address,address,bytes,bytes)",
                subdomain,
                setup,
                safe,
                bytes("1"),
                bytes("1")
            )
        );
    }

    /// @notice Emit `prepareInstallation` for one plugin.
    /// @dev Permissionless on chain, but emitted here because production runs every transaction
    ///      through the Safe.
    ///
    ///      SEQUENCING: this action's OUTPUT is what the matching `applyInstall` needs — the
    ///      plugin address, the permission set and the helpers hash, carried by the
    ///      `InstallationPrepared` event. They cannot be predicted, so the apply action can only
    ///      be generated after this one has executed and its receipt has been read.
    function prepareInstall() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");
        string memory prefix = vm.envString("PLUGIN_PREFIX");
        string memory slug = vm.envString("PLUGIN_SLUG");

        address repo = vm.envAddress(string.concat(prefix, "_PLUGIN_REPO"));
        uint8 release = uint8(vm.envOr(string.concat(prefix, "_RELEASE"), uint256(1)));
        uint16 build = uint16(vm.envOr(string.concat(prefix, "_BUILD"), uint256(1)));
        bytes memory installData = vm.envBytes(string.concat(prefix, "_INSTALL_DATA"));

        _emit(
            slug,
            string.concat("Prepare installation of ", prefix),
            "Deploys the plugin proxy and records a prepared setup. The DAO is unchanged until the "
            "matching applyInstallation. Read the InstallationPrepared event from this receipt to "
            "obtain the values the apply action needs.",
            psp,
            // Typed encodeCall, not encodeWithSignature: `PrepareInstallationParams` nests a
            // tuple and a dynamic `bytes`, so passing the members flattened produces a different
            // layout than the ABI expects — calldata that looks plausible and decodes to the
            // wrong thing. The compiler builds this from the real signature.
            abi.encodeCall(
                PluginSetupProcessor.prepareInstallation,
                (
                    dao,
                    PluginSetupProcessor.PrepareInstallationParams(
                        PluginSetupRef(PluginRepo.Tag(release, build), PluginRepo(repo)), installData
                    )
                )
            )
        );
    }

    /// @notice Emit the SPP wiring — stages, CREATE_PROPOSAL grants, target config — as ONE file.
    /// @dev Deliberately not split per action, unlike the installs. A process wired halfway is
    ///      broken in a way that is not obvious from chain state: stages set but no grant means
    ///      proposals cannot be created, a grant with no stages means they go nowhere. Bundling
    ///      them into a single `executeProposal` makes the wiring all-or-nothing.
    ///
    ///      Never disarms the Admin bootstrap (`shouldDisarmAdmin = false`). Disarming stays its
    ///      own deliberate action, so a wiring that needs a retry is not entangled with an
    ///      irreversible revoke.
    function wireProcess() external {
        bool withPrivate = vm.envOr("WITH_PRIVATE", true);

        Action[] memory actions = buildWiringActions(withPrivate, false);

        _emitActions(
            "30-wire-spp",
            withPrivate ? "Wire the private and public SPP processes" : "Wire the public SPP process",
            "Stages, CREATE_PROPOSAL grants and target config, as one atomic execution. Does NOT "
            "disarm the Admin bootstrap - run that separately once installation is finished.",
            actions
        );
    }

    // --- internals -----------------------------------------------------------------

    /// @dev Rebuilds a prepared installation from `<PREFIX>_*` env vars, exactly as
    ///      `prepareInstallation` reported them.
    function _loadPrepared(string memory prefix) internal view returns (Prepared memory p) {
        p.plugin = vm.envAddress(string.concat(prefix, "_PLUGIN_ADDRESS"));
        p.setupRef = PluginSetupRef(
            PluginRepo.Tag(
                uint8(vm.envOr(string.concat(prefix, "_RELEASE"), uint256(1))),
                uint16(vm.envOr(string.concat(prefix, "_BUILD"), uint256(1)))
            ),
            PluginRepo(vm.envAddress(string.concat(prefix, "_PLUGIN_REPO")))
        );
        p.helpersHash = vm.envBytes32(string.concat(prefix, "_HELPERS_HASH"));

        // Permissions come back as five parallel arrays, because forge's env readers cannot
        // decode an array of structs. They must be in the SAME order prepareInstallation
        // emitted: the setup id hashes the sequence, so a reordering fails on chain.
        uint256[] memory ops = vm.envUint(string.concat(prefix, "_PERM_OPS"), ",");
        address[] memory wheres = vm.envAddress(string.concat(prefix, "_PERM_WHERE"), ",");
        address[] memory whos = vm.envAddress(string.concat(prefix, "_PERM_WHO"), ",");
        bytes32[] memory ids = vm.envBytes32(string.concat(prefix, "_PERM_IDS"), ",");
        // Conditions are part of the hashed setup id too. TokenVoting's install grants
        // CREATE_PROPOSAL to ANY_ADDR behind a VotingPowerCondition, so assuming NO_CONDITION
        // here produced a setup id the PSP rejects. Optional: setups whose permissions are all
        // unconditioned may omit the var entirely.
        address[] memory conditions = vm.envOr(string.concat(prefix, "_PERM_CONDITIONS"), ",", new address[](0));
        if (conditions.length == 0) conditions = new address[](ops.length); // all NO_CONDITION

        require(
            ops.length == wheres.length && ops.length == whos.length && ops.length == ids.length
                && ops.length == conditions.length,
            "permission arrays differ in length"
        );

        p.permissions = new PermissionLib.MultiTargetPermission[](ops.length);
        for (uint256 i = 0; i < ops.length; i++) {
            p.permissions[i] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation(uint8(ops[i])),
                where: wheres[i],
                who: whos[i],
                condition: conditions[i],
                permissionId: ids[i]
            });
        }
    }

    /// @dev `to`/`data` describe what the DAO must do; the Safe cannot perform it directly.
    ///      `applyInstallation` authorises on `msg.sender == dao`, and permission changes must come
    ///      from the DAO itself, so every action is wrapped in `adminPlugin.executeProposal` —
    ///      which the Safe is entitled to call once `grant-admin` names it as the bootstrap driver.
    ///      Executed straight from the Safe, the inner call would arrive with the Safe as sender
    ///      and revert.
    function _emit(string memory slug, string memory name, string memory description, address to, bytes memory data)
        internal
    {
        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: to, value: 0, data: data});

        _emitActions(slug, name, description, actions);
    }

    /// @dev Wraps one or more DAO actions into a single `executeProposal` and writes the file.
    ///      Several actions in one entry execute atomically, which is what makes a multi-step
    ///      change like the SPP wiring safe to sign as a unit.
    function _emitActions(string memory slug, string memory name, string memory description, Action[] memory actions)
        internal
    {
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");

        for (uint256 i = 0; i < actions.length; i++) {
            console2.log("  inner action %s -> %s", i + 1, actions[i].to);
            console2.logBytes(actions[i].data);
        }

        _writeSafeFile(
            slug, name, description, adminPlugin, abi.encodeCall(IAdmin.executeProposal, (bytes(name), actions, 0))
        );
    }

    /// @dev Writes a call the Safe makes DIRECTLY, with no Admin wrapper. Correct only for
    ///      functions that do not authorise on `msg.sender == dao` — `prepareInstallation` is
    ///      permissionless and touches nothing the DAO owns, so routing it through the bootstrap
    ///      would spend the Admin plugin for no benefit.
    function _emitDirect(
        string memory slug,
        string memory name,
        string memory description,
        address to,
        bytes memory data
    ) internal {
        _writeSafeFile(slug, name, description, to, data);
    }

    /// @dev The Safe Transaction Builder writer, shared by the wrapped and direct emitters.
    ///      The printed `to`/`data` is the same bytes the file carries, so a reviewer can check
    ///      the file against the console without trusting the JSON writer.
    /// @notice Emits the CRISP plugin stack — the `CrispVoting` implementation and
    ///         `CrispVotingSetup` — as ONE Safe file of two CREATE2 deployments, for the
    ///         no-EOA flow. The lean setup installs only against an existing IVotes token, so
    ///         there are no governance-token base contracts to deploy alongside them.
    /// @dev A Safe cannot issue raw contract creations, so each deployment is a call to the
    ///      deterministic deployer at 0x4e59b448... with `salt ++ initcode`. Both addresses —
    ///      including the setup's, whose constructor arg embeds the implementation — depend
    ///      only on salt and initcode, never on the Safe's nonce, so they are printed here and
    ///      can be written into the env and independently verified BEFORE anything is signed.
    ///
    ///      One file on purpose: the setup's initcode hardcodes the implementation address, so
    ///      a batch that partially executed would strand a setup pointing at code that never
    ///      landed. The Transaction Builder executes the two in order and atomically.
    function deployCrispStack() external {
        address deployer = vm.envOr("CREATE2_DEPLOYER", address(0x4e59b44847b379578588920cA78FbF26c0B4956C));
        bytes32 salt = vm.envOr("CRISP_STACK_SALT", bytes32("interfold-crisp-v1"));

        bytes memory implCode = type(CrispVoting).creationCode;
        address impl = vm.computeCreate2Address(salt, keccak256(implCode), deployer);

        bytes memory setupCode = bytes.concat(type(CrispVotingSetup).creationCode, abi.encode(impl));
        address setup = vm.computeCreate2Address(salt, keccak256(setupCode), deployer);

        address[] memory tos = new address[](2);
        bytes[] memory datas = new bytes[](2);
        tos[0] = deployer;
        tos[1] = deployer;
        datas[0] = bytes.concat(salt, implCode);
        datas[1] = bytes.concat(salt, setupCode);

        console2.log("=== CRISP stack via CREATE2 (Safe-signed, one atomic batch) ===");
        console2.log("CrispVoting implementation:  %s", impl);
        console2.log("CRISP_SETUP_ADDRESS=%s", setup);
        console2.log("Write CRISP_SETUP_ADDRESS into the env now; verify code exists at both");
        console2.log("after execution, then run `make safe-create-repo`.");

        _writeSafeBatchFile(
            "10-deploy-crisp-stack",
            "Deploy the CRISP plugin stack via CREATE2",
            "Two deterministic deployments in one atomic batch: the CrispVoting implementation "
            "and CrispVotingSetup (whose constructor pins it). Addresses depend only on salt and "
            "initcode, so they were verifiable before signing. Neither contract holds any "
            "permission or authority, and the lean setup deploys no token contracts.",
            tos,
            datas
        );
    }

    /// @notice The whole CRISP publish — implementation, setup, and the PluginRepo mint — as ONE
    ///         atomic Safe batch. The CREATE2 addresses are known before signing, so the repo
    ///         mint can reference the setup that does not exist yet: by the time the third call
    ///         runs, the first two have deployed it or the batch has reverted.
    /// @dev The repo mint is a DIRECT call from the Safe, not wrapped in the Admin bootstrap:
    ///      `createPluginRepoWithFirstVersion` is permissionless and takes the maintainer
    ///      explicitly, so the caller carries no authority. Only the repo's own address remains
    ///      unpredictable (the factory deploys it from its nonce) — read CRISP_PLUGIN_REPO from
    ///      the PluginRepoRegistered event in the receipt.
    function deployCrispStackAndRepo() external {
        address deployer = vm.envOr("CREATE2_DEPLOYER", address(0x4e59b44847b379578588920cA78FbF26c0B4956C));
        bytes32 salt = vm.envOr("CRISP_STACK_SALT", bytes32("interfold-crisp-v1"));
        address factory = vm.envAddress("PLUGIN_REPO_FACTORY_ADDRESS");
        address safe = vm.envAddress("FOUNDATION_ADDRESS");
        string memory subdomain = vm.envString("CRISP_REPO_SUBDOMAIN");

        bytes memory implCode = type(CrispVoting).creationCode;
        address impl = vm.computeCreate2Address(salt, keccak256(implCode), deployer);

        bytes memory setupCode = bytes.concat(type(CrispVotingSetup).creationCode, abi.encode(impl));
        address setup = vm.computeCreate2Address(salt, keccak256(setupCode), deployer);

        address[] memory tos = new address[](3);
        bytes[] memory datas = new bytes[](3);
        tos[0] = deployer;
        tos[1] = deployer;
        tos[2] = factory;
        datas[0] = bytes.concat(salt, implCode);
        datas[1] = bytes.concat(salt, setupCode);
        datas[2] = abi.encodeWithSignature(
            "createPluginRepoWithFirstVersion(string,address,address,bytes,bytes)",
            subdomain,
            setup,
            safe,
            bytes("1"),
            bytes("1")
        );

        console2.log("=== CRISP stack + repo via CREATE2 (Safe-signed, one atomic batch) ===");
        console2.log("CrispVoting implementation:  %s", impl);
        console2.log("CRISP_SETUP_ADDRESS=%s", setup);
        console2.log("Repo subdomain:              %s", subdomain);
        console2.log("After execution, read CRISP_PLUGIN_REPO from the PluginRepoRegistered event.");

        _writeSafeBatchFile(
            "10-deploy-crisp-stack-and-repo",
            string.concat("Deploy the CRISP plugin stack and mint the repo '", subdomain, "'"),
            "Three calls in one atomic batch: CREATE2-deploy the CrispVoting implementation and "
            "CrispVotingSetup (whose constructor pins it), then mint the PluginRepo with its "
            "first version pointing at that setup, maintained by this Safe. The CREATE2 "
            "addresses depend only on salt and initcode, so they were verifiable before signing; "
            "the mint reverts if the deploys did not land.",
            tos,
            datas
        );
    }

    /// @dev The multi-transaction sibling of `_writeSafeFile`: one Transaction Builder file whose
    ///      `transactions` array the Safe executes in order, atomically.
    function _writeSafeBatchFile(
        string memory slug,
        string memory name,
        string memory description,
        address[] memory tos,
        bytes[] memory datas
    ) internal {
        address safe = adminDriver();
        string memory path = string.concat(OUT_DIR, "/", slug, ".json");

        string memory txs = "";
        for (uint256 i = 0; i < tos.length; i++) {
            txs = string.concat(
                txs,
                i == 0 ? "" : ",\n    ",
                '{\n      "to": "',
                vm.toString(tos[i]),
                '",\n      "value": "0",\n      "data": "',
                vm.toString(datas[i]),
                '"\n    }'
            );
        }

        string memory json = string.concat(
            '{\n  "version": "1.0",\n  "chainId": "',
            vm.toString(block.chainid),
            '",\n  "createdAt": ',
            vm.toString(block.timestamp * 1000),
            ',\n  "meta": {\n    "name": "',
            name,
            '",\n    "description": "',
            description,
            '",\n    "txBuilderVersion": "1.18.0",\n    "createdFromSafeAddress": "',
            vm.toString(safe),
            '"\n  },\n  "transactions": [\n    ',
            txs,
            "\n  ]\n}\n"
        );

        vm.writeFile(path, json);

        console2.log("=== %s", name);
        console2.log("  file: %s (%s transactions)", path, tos.length);
    }

    function _writeSafeFile(
        string memory slug,
        string memory name,
        string memory description,
        address to,
        bytes memory data
    ) internal {
        // The Safe that will SIGN this file - the bootstrap driver, not the stage-1 body.
        address safe = adminDriver();
        string memory path = string.concat(OUT_DIR, "/", slug, ".json");

        string memory json = string.concat(
            '{\n  "version": "1.0",\n  "chainId": "',
            vm.toString(block.chainid),
            '",\n  "createdAt": ',
            vm.toString(block.timestamp * 1000),
            ',\n  "meta": {\n    "name": "',
            name,
            '",\n    "description": "',
            description,
            '",\n    "txBuilderVersion": "1.18.0",\n    "createdFromSafeAddress": "',
            vm.toString(safe),
            '"\n  },\n  "transactions": [\n    {\n      "to": "',
            vm.toString(to),
            '",\n      "value": "0",\n      "data": "',
            vm.toString(data),
            '"\n    }\n  ]\n}\n'
        );

        vm.writeFile(path, json);

        console2.log("=== %s", name);
        console2.log("  file: %s", path);
        console2.log("  to:   %s", to);
        console2.log("  data:");
        console2.logBytes(data);
        console2.log("");
    }
}
