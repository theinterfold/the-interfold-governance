// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

/* solhint-disable no-console */

import {Script, console2} from "forge-std/Script.sol";

import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {PluginRepoFactory} from "@aragon/osx/framework/plugin/repo/PluginRepoFactory.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginSetupRef, hashHelpers} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "@aragon/token-voting-plugin/erc20/GovernanceWrappedERC20.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {Utils} from "./Utils.sol";
import {SppInstall} from "./SppInstall.sol";
import {WireSppScript, IDAOPermissions, ISpp, IPluginTarget, IAdmin} from "./WireSpp.s.sol";

/**
 * @title InstallPrivateProcess
 * @notice PHASE 2 of the phased mainnet rollout (docs/mainnet-deployment.md): installs the
 *         PRIVATE process — the CRISP body + a second SPP — into a DAO that was deployed
 *         public-only (DEPLOY_PRIVATE_PROCESS=false). It installs and wires ONLY; disarming
 *         the Admin bootstrap is a separate, explicit step.
 *
 *         Requires the Admin plugin to still be armed, i.e. phase 1 ran `wire-spp` with
 *         DISARM_ADMIN=false. If it was already disarmed, this cannot run: the same actions
 *         must instead go through a governance proposal on the public SPP (the calldata is
 *         printed by `printProposalActions()` for exactly that case).
 *
 *         Sequence — three broadcasts:
 *           1. publishCrispRepo()  EOA. Deploys CrispVotingSetup + creates the CRISP PluginRepo.
 *                                  Permissionless; touches nothing on the DAO.
 *           2. prepare()           EOA. `psp.prepareInstallation` for the CRISP body and the SPP.
 *                                  Permissionless, and does NOT alter the DAO — it only records a
 *                                  prepared setup and returns the plugin addresses.
 *           3. run()               Admin executes, in ONE tx:
 *                                    1. grant  ROOT on DAO -> PSP        (temporary!)
 *                                    2. psp.applyInstallation(CRISP body)
 *                                    3. psp.applyInstallation(SPP private)
 *                                    4. revoke ROOT on DAO from PSP
 *                                    5. sppPrivate.updateStages([crisp approval, foundation])
 *                                    6. grant  CREATE_PROPOSAL on crisp -> sppPrivate
 *                                    7. crisp.setTargetConfig(executor, DelegateCall)
 *
 *         `applyInstallation` authorizes on `msg.sender == dao` (PluginSetupProcessor._canApply),
 *         so the DAO executing it needs no APPLY_INSTALLATION_PERMISSION. It does need the PSP to
 *         hold ROOT while the setup's permissions are applied — hence 1 and 4, which MUST stay
 *         paired.
 *
 *         This script NEVER disarms the Admin bootstrap. That is a separate, deliberate step
 *         (`make disarm-admin` / WireSpp's `disarmAdmin()`), so installing a plugin can never
 *         silently close the bootstrap, and an install that needs a retry is not entangled with
 *         an irreversible revoke. Disarm explicitly once installation is finished.
 *
 *         Steps 1 and 2 write their outputs to the log; feed them back in via env
 *         (CRISP_PLUGIN_REPO, and the PREPARED_* vars) before running the next step.
 */
contract InstallPrivateProcessScript is WireSppScript {
    bytes32 internal constant ROOT_PERMISSION_ID = keccak256("ROOT_PERMISSION");

    /// @dev Everything `run()` needs that `prepare()` produced.
    struct Prepared {
        address plugin;
        PluginSetupRef setupRef;
        bytes32 helpersHash;
        PermissionLib.MultiTargetPermission[] permissions;
    }

    // ---------------------------------------------------------------------------------
    // STEP 1 — publish the CRISP plugin repo on this network (EOA, no DAO interaction)
    // ---------------------------------------------------------------------------------

    /// @notice Deploys `CrispVotingSetup` and mints a fresh CRISP `PluginRepo` (release 1,
    ///         build 1). Phase 1 skipped this, so no CRISP repo exists on mainnet.
    ///         Record the printed repo address as CRISP_PLUGIN_REPO before running `prepare()`;
    ///         later builds then go through `make publish-crisp-build` rather than minting a
    ///         second repo for the same plugin.
    ///         Usage: forge script ... --sig "publishCrispRepo()" --broadcast
    function publishCrispRepo() external {
        address pluginRepoFactory = vm.envAddress("PLUGIN_REPO_FACTORY_ADDRESS");
        string memory subdomain = string.concat("interfold-crisp-", vm.toString(block.timestamp));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // The lean setup: only an existing IVotes token installs, so there are no token base
        // contracts to deploy alongside the implementation.
        CrispVotingSetup crispSetup = new CrispVotingSetup(address(new CrispVoting()));

        PluginRepo crispRepo = PluginRepoFactory(pluginRepoFactory).
            // Maintainer is the foundation multisig, not the broadcasting EOA. The EOA pays the
            // gas but keeps no authority: publishing a future CRISP build is a multisig action
            // from the start, so there is never a window where a hot key can publish a build the
            // DAO would then install. Falls back to the sender only if unset, which keeps a local
            // or fork run working without a Safe.
            createPluginRepoWithFirstVersion(
                subdomain, address(crispSetup), vm.envOr("FOUNDATION_ADDRESS", msg.sender), "1", "1"
            );

        vm.stopBroadcast();

        console2.log("=== CRISP plugin repo published ===");
        console2.log("CRISP PluginRepo:    ", address(crispRepo));
        console2.log("CRISP setup:         ", address(crispSetup));
        console2.log("NEXT: set CRISP_PLUGIN_REPO to the repo address above, then run `prepare()`.");
    }

    // ---------------------------------------------------------------------------------
    // STEP 2 — prepare both installations (EOA, permissionless, DAO state untouched)
    // ---------------------------------------------------------------------------------

    /// @notice Calls `psp.prepareInstallation` for the CRISP body and for the private SPP.
    ///         Neither call changes the DAO — they deploy the plugin proxies and record a
    ///         prepared setup that `applyInstallation` later validates against.
    ///         Usage: forge script ... --sig "prepare()" --broadcast
    function prepare() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        PluginSetupProcessor psp = PluginSetupProcessor(vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS"));
        require(dao != address(0) && fold != address(0), "missing address env");

        PluginSetupRef memory crispRef = PluginSetupRef(
            PluginRepo.Tag(uint8(vm.envOr("CRISP_RELEASE", uint256(1))), uint16(vm.envOr("CRISP_BUILD", uint256(1)))),
            PluginRepo(vm.envAddress("CRISP_PLUGIN_REPO"))
        );
        PluginSetupRef memory sppRef = PluginSetupRef(
            PluginRepo.Tag(uint8(vm.envOr("SPP_RELEASE", uint256(1))), uint16(vm.envOr("SPP_BUILD", uint256(1)))),
            PluginRepo(vm.envAddress("SPP_PLUGIN_REPO"))
        );

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        (address crispPlugin, IPluginSetup.PreparedSetupData memory crispSetupData) = psp.prepareInstallation(
            dao, PluginSetupProcessor.PrepareInstallationParams(crispRef, crispInstallData(fold))
        );

        (address sppPlugin, IPluginSetup.PreparedSetupData memory sppSetupData) =
            psp.prepareInstallation(dao, PluginSetupProcessor.PrepareInstallationParams(sppRef, SppInstall.encode()));

        vm.stopBroadcast();

        console2.log("=== Prepared installations (nothing applied to the DAO yet) ===");
        console2.log("CRISP plugin (PRIVATE body):  ", crispPlugin);
        console2.log("SPP plugin (PRIVATE process): ", sppPlugin);
        console2.log("");
        console2.log("Copy ALL SIX values into the env, then run the apply step.");
        console2.log("applyInstallation re-derives the setup id from the permissions and helpers");
        console2.log("and reverts on any mismatch, so paste these verbatim.");
        console2.log("");
        console2.log("CRISP_VOTING_PLUGIN_ADDRESS=", crispPlugin);
        console2.log("SPP_PRIVATE_ADDRESS=        ", sppPlugin);
        console2.log("PREPARED_CRISP_HELPERS_HASH=");
        console2.logBytes32(hashHelpers(crispSetupData.helpers));
        console2.log("PREPARED_SPP_HELPERS_HASH=");
        console2.logBytes32(hashHelpers(sppSetupData.helpers));
        console2.log("PREPARED_CRISP_PERMISSIONS=");
        console2.logBytes(abi.encode(crispSetupData.permissions));
        console2.log("PREPARED_SPP_PERMISSIONS=");
        console2.logBytes(abi.encode(sppSetupData.permissions));
    }

    // ---------------------------------------------------------------------------------
    // STEP 3 — apply + wire + disarm, in one Admin transaction
    // ---------------------------------------------------------------------------------

    function run() external override {
        (Prepared memory crisp, Prepared memory spp, address dao, address adminPlugin) = loadPrepared();
        Action[] memory actions = buildActions(crisp, spp, dao);

        bytes memory metadata = bytes(vm.envOr("PROPOSAL_METADATA_URI", string("ipfs://install-private-process")));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        uint256 proposalId = IAdmin(adminPlugin).executeProposal(metadata, actions, 0);
        vm.stopBroadcast();

        console2.log("=== Private process installed ===");
        console2.log("admin proposalId:  ", proposalId);
        console2.log("CRISP plugin (PRIVATE body):  ", crisp.plugin);
        console2.log("SPP plugin (PRIVATE process): ", spp.plugin);
        console2.log("");
        console2.log("The Admin bootstrap is STILL ARMED - disarming is a separate step.");
        console2.log("VERIFY (SECURITY.md runbook): only the two SPPs hold EXECUTE on the DAO and");
        console2.log("the PSP no longer holds ROOT. Then run `make disarm-admin`.");
    }

    /// @notice Prints the ABI-encoded install params for the Safe-only prepare flow, where
    ///         `make safe-prepare-install` reads them from `<PREFIX>_INSTALL_DATA`. Byte-identical
    ///         to what `prepare()` submits, so both flows produce the same prepared setup — and a
    ///         reviewer can regenerate the hex to check a Safe file against the env.
    ///         Usage: forge script ... --sig "printInstallData()"
    function printInstallData() external view {
        console2.log("CRISP_INSTALL_DATA=%s", vm.toString(crispInstallData(vm.envAddress("FOLD_TOKEN_ADDRESS"))));
        console2.log(
            "SPP_PRIVATE_INSTALL_DATA=%s",
            vm.toString(SppInstall.encode(bytes(vm.envOr("SPP_PRIVATE_METADATA_URI", string("")))))
        );
    }

    /// @notice Prints the same actions as `run()` WITHOUT broadcasting, for the case where the
    ///         Admin plugin was already disarmed and the install must go through a governance
    ///         proposal on the public SPP instead. Paste each blob as a proposal action.
    ///         Usage: forge script ... --sig "printProposalActions()"
    function printProposalActions() external view {
        (Prepared memory crisp, Prepared memory spp, address dao,) = loadPrepared();
        Action[] memory actions = buildActions(crisp, spp, dao);

        console2.log("=== Proposal actions (submit on the PUBLIC SPP) ===");
        for (uint256 i = 0; i < actions.length; i++) {
            console2.log("Action", i + 1, "- to:", actions[i].to);
            console2.logBytes(actions[i].data);
        }
        console2.log("");
        console2.log("These actions install and wire only. Disarming the Admin bootstrap is a");
        console2.log("separate step and is deliberately not included here.");
    }

    // --- internals ---

    /// @dev Rebuilds both `Prepared` structs from the env written after `prepare()`.
    function loadPrepared()
        internal
        view
        returns (Prepared memory crisp, Prepared memory spp, address dao, address adminPlugin)
    {
        dao = vm.envAddress("DAO_ADDRESS");
        adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        require(dao != address(0) && adminPlugin != address(0), "missing address env");

        crisp.plugin = vm.envAddress("CRISP_VOTING_PLUGIN_ADDRESS");
        crisp.setupRef = PluginSetupRef(
            PluginRepo.Tag(uint8(vm.envOr("CRISP_RELEASE", uint256(1))), uint16(vm.envOr("CRISP_BUILD", uint256(1)))),
            PluginRepo(vm.envAddress("CRISP_PLUGIN_REPO"))
        );
        crisp.helpersHash = vm.envBytes32("PREPARED_CRISP_HELPERS_HASH");

        spp.plugin = vm.envAddress("SPP_PRIVATE_ADDRESS");
        spp.setupRef = PluginSetupRef(
            PluginRepo.Tag(uint8(vm.envOr("SPP_RELEASE", uint256(1))), uint16(vm.envOr("SPP_BUILD", uint256(1)))),
            PluginRepo(vm.envAddress("SPP_PLUGIN_REPO"))
        );
        spp.helpersHash = vm.envBytes32("PREPARED_SPP_HELPERS_HASH");

        require(
            crisp.plugin != address(0) && spp.plugin != address(0),
            "run prepare() first and set CRISP_VOTING_PLUGIN_ADDRESS / SPP_PRIVATE_ADDRESS"
        );

        // `applyInstallation` re-derives the prepared setup id from these permissions and
        // reverts on any mismatch, so they must be EXACTLY what `prepareInstallation` returned.
        // They are round-tripped verbatim as abi-encoded bytes rather than reimplemented here:
        // a hand-rolled copy would silently drift from the setup contracts.
        crisp.permissions =
            abi.decode(vm.envBytes("PREPARED_CRISP_PERMISSIONS"), (PermissionLib.MultiTargetPermission[]));
        spp.permissions = abi.decode(vm.envBytes("PREPARED_SPP_PERMISSIONS"), (PermissionLib.MultiTargetPermission[]));
    }

    function buildActions(Prepared memory crisp, Prepared memory spp, address dao)
        internal
        view
        returns (Action[] memory actions)
    {
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");
        require(executor != address(0) && foundation != address(0) && psp != address(0), "missing address env");

        IPlugin.TargetConfig memory delegateExecutor =
            IPlugin.TargetConfig({target: executor, operation: IPlugin.Operation.DelegateCall});

        actions = new Action[](7);

        // 1. Temporary ROOT for the PSP so it can apply the setups' permission changes.
        actions[0] =
            Action({to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.grant, (dao, psp, ROOT_PERMISSION_ID))});
        // 2/3. Apply both installations. Authorized because msg.sender == dao.
        actions[1] = Action({
            to: psp,
            value: 0,
            data: abi.encodeCall(
                PluginSetupProcessor.applyInstallation,
                (
                    dao,
                    PluginSetupProcessor.ApplyInstallationParams(
                        crisp.setupRef, crisp.plugin, crisp.permissions, crisp.helpersHash
                    )
                )
            )
        });
        actions[2] = Action({
            to: psp,
            value: 0,
            data: abi.encodeCall(
                PluginSetupProcessor.applyInstallation,
                (
                    dao,
                    PluginSetupProcessor.ApplyInstallationParams(
                        spp.setupRef, spp.plugin, spp.permissions, spp.helpersHash
                    )
                )
            )
        });
        // 4. Hand ROOT back immediately. MUST stay paired with action 1.
        actions[3] =
            Action({to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, psp, ROOT_PERMISSION_ID))});
        // 5-7. The same wiring wire-spp applies to the private process (INV-1, INV-3, INV-5).
        actions[4] = Action({
            to: spp.plugin,
            value: 0,
            data: abi.encodeCall(ISpp.updateStages, (stagesFor(crisp.plugin, foundation, true)))
        });
        actions[5] = Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.grant, (crisp.plugin, spp.plugin, CREATE_PROPOSAL_PERMISSION_ID))
        });
        actions[6] = Action({
            to: crisp.plugin, value: 0, data: abi.encodeCall(IPluginTarget.setTargetConfig, (delegateExecutor))
        });
        // NOTE: disarming the Admin bootstrap is deliberately NOT part of this batch. It is a
        // separate, explicit step (`make disarm-admin`) so that installing a plugin never
        // silently removes the bootstrap — and so a failed install does not have to be
        // untangled from an irreversible permission revoke. Disarm once you are done
        // installing, and verify with the SECURITY.md runbook.
    }

    /// @dev The CRISP install params — byte-identical to `DeployInterfoldDao.crispPluginSettings`.
    ///      `grantExecuteOnDao: false` is load-bearing: a body holding EXECUTE could execute
    ///      straight from stage 0 and skip the foundation entirely (INV-2).
    function crispInstallData(address fold) internal view returns (bytes memory) {
        Utils.CrispEnvVariables memory crispEnv = Utils.readCrispEnv();

        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(0)),
            token: address(0),
            interfold: crispEnv.interfold,
            committeeSize: crispEnv.committeeSize,
            paramSet: crispEnv.paramSet,
            crispProgramAddress: crispEnv.crispProgramAddress,
            computeProviderParams: crispEnv.computeProviderParams,
            votingSettings: crispEnv.votingSettings
        });

        return abi.encode(params, fold, false);
    }
}
