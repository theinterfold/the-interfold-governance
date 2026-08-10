// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

/* solhint-disable no-console */

import {Script, console2} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";

import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {PluginRepoFactory} from "@aragon/osx/framework/plugin/repo/PluginRepoFactory.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {PluginSetupRef} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "@aragon/token-voting-plugin/erc20/GovernanceWrappedERC20.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// Forked CRISP plugin (governance variant: createProposal defaults to 3 options + CUSTOM credits).
import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {Utils} from "./Utils.sol";
import {IDAOFactory} from "../src/crisp/IDAOFactory.sol";

import {TokenVotingInstall} from "./TokenVotingInstall.sol";
import {SppInstall} from "./SppInstall.sol";
import {Executor} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";

/**
 * @title DeployInterfoldDao
 * @notice Creates the Interfold DAO and installs BOTH governance plugins in a single
 *         atomic `createDao` call, sharing one FOLD (ERC20Votes / IVotes) token:
 *           - CRISP voting     -> PRIVATE (encrypted) proposals   (crisp-aragon-plugin, published fresh)
 *           - TokenVoting v1.4  -> PUBLIC proposals                (Aragon canonical PluginRepo, by address)
 *
 *         Aragon's DAOFactory grants each installed plugin `EXECUTE_PERMISSION` on the DAO, so both
 *         plugins execute governance actions through the DAO (target == address(0) resolves to the
 *         DAO in OSx 1.4). No new token is deployed: an existing FOLD address is passed to both setups.
 *
 *         The CRISP plugin sources are reused from the sibling crisp-aragon-plugin repo via remappings.
 *         TokenVoting is referenced purely by its published repo address + version tag, with install
 *         params ABI-encoded as bytes (see TokenVotingInstall) — its v1.4 source is never compiled.
 */

/// @dev Minimal view of the Interfold contract's Ownable2Step ownership.
interface IOwnable2Step {
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

contract DeployInterfoldDaoScript is Script {
    address public pluginRepoFactory;
    IDAOFactory public daoFactory;
    string public nameWithEntropy;
    address[] public installedPlugins;

    function setUp() public {
        pluginRepoFactory = vm.envAddress("PLUGIN_REPO_FACTORY_ADDRESS");
        daoFactory = IDAOFactory(vm.envAddress("DAO_FACTORY_ADDRESS"));
        nameWithEntropy = string.concat("the-interfold-", vm.toString(block.timestamp));
    }

    function run() public {
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        require(fold != address(0), "FOLD_TOKEN_ADDRESS not set");

        // Phased rollout (see docs/mainnet-deployment.md). When false, ONLY the public
        // process is deployed: TokenVoting body + one SPP + the Admin bootstrap. The CRISP
        // body and its SPP are installed later into the live DAO by InstallPrivateProcess.
        // Defaults to true so the Sepolia flow is unchanged.
        bool withPrivate = vm.envOr("DEPLOY_PRIVATE_PROCESS", true);

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // 1. The stateless Executor that SPP bodies delegatecall into (keeps `msg.sender` ==
        //    body when a sub-proposal reports its result back to the SPP). Always deployed —
        //    the public body needs it now, and phase 2 reuses this same instance.
        Executor executor = new Executor();

        // 1b. Deploy + publish the CRISP plugin as a new PluginRepo (private process only).
        //     Skipped entirely in the public-only deploy: `Utils.readCrispEnv()` reads
        //     INTERFOLD_ADDRESS via `envAddress` and would revert on an unset mainnet value.
        CrispVotingSetup crispSetup;
        PluginRepo crispRepo;
        if (withPrivate) {
            crispSetup = deployCrispSetup();
            crispRepo = deployCrispRepo(address(crispSetup));
        }

        // 2. Assemble all installations. Bodies (CRISP + TokenVoting) point at the existing
        //    FOLD token; the SPP instances (one per process) install with EMPTY stages —
        //    bodies are only known post-deploy, so stages + permissions are wired by the
        //    follow-up bootstrap step (make wire-spp). The Admin plugin gives the deployer
        //    direct execute-on-DAO power so wire-spp needs NO governance vote.
        //
        //    Install order is load-bearing: `InstallationApplied` is emitted in this order and
        //    step 4 recovers the addresses positionally.
        IDAOFactory.PluginSettings[] memory pluginSettings = new IDAOFactory.PluginSettings[](withPrivate ? 5 : 3);
        if (withPrivate) {
            pluginSettings[0] = crispPluginSettings(crispRepo, fold); // PRIVATE body
            pluginSettings[1] = tokenVotingPluginSettings(fold); // PUBLIC body
            pluginSettings[2] = sppPluginSettings(); // SPP (PRIVATE process)
            pluginSettings[3] = sppPluginSettings(); // SPP (PUBLIC process)
            pluginSettings[4] = adminPluginSettings(); // Admin (bootstrap)
        } else {
            pluginSettings[0] = tokenVotingPluginSettings(fold); // PUBLIC body
            pluginSettings[1] = sppPluginSettings(); // SPP (PUBLIC process)
            pluginSettings[2] = adminPluginSettings(); // Admin (bootstrap)
        }

        // 3. Create the DAO with the plugins installed atomically.
        vm.recordLogs();
        address createdDAO = daoFactory.createDao(getDAOSettings(), pluginSettings);

        // 4. Recover the installed plugin addresses (emission order == pluginSettings order).
        Vm.Log[] memory logEntries = vm.getRecordedLogs();
        for (uint256 i = 0; i < logEntries.length; i++) {
            if (logEntries[i].topics[0] == keccak256("InstallationApplied(address,address,bytes32,bytes32)")) {
                installedPlugins.push(address(uint160(uint256(logEntries[i].topics[2]))));
            }
        }

        // 5. Optional: hand the Interfold contract's ownership to the new DAO (gated).
        transferInterfoldOwnership(createdDAO);

        vm.stopBroadcast();

        // 6. Log everything needed for the frontend .env and the wire-spp step.
        //    These labels are PARSED BY script/sync-env.sh — keep them byte-stable.
        console2.log("=== The Interfold DAO ===");
        console2.log("DAO:                 ", createdDAO);
        console2.log("FOLD token (shared): ", fold);
        console2.log("Executor (delegatecall target): ", address(executor));
        logInstalledPlugins(withPrivate, crispRepo, crispSetup);
    }

    /// @dev Emits the per-plugin summary. Labels are parsed by `script/sync-env.sh`, which
    ///      matches them literally — do not reword them without updating that script.
    function logInstalledPlugins(bool withPrivate, PluginRepo crispRepo, CrispVotingSetup crispSetup) internal view {
        uint256 expected = withPrivate ? 5 : 3;
        if (installedPlugins.length != expected) {
            console2.log("WARNING: expected installations:", expected);
            console2.log("         recovered:             ", installedPlugins.length);
            for (uint256 i = 0; i < installedPlugins.length; i++) {
                console2.log("Installed plugin:    ", installedPlugins[i]);
            }
            return;
        }

        if (withPrivate) {
            console2.log("CRISP PluginRepo:    ", address(crispRepo));
            console2.log("CRISP setup:         ", address(crispSetup));
            console2.log("CRISP plugin (PRIVATE body):  ", installedPlugins[0]);
            console2.log("TokenVoting plugin (PUBLIC body): ", installedPlugins[1]);
            console2.log("SPP plugin (PRIVATE process): ", installedPlugins[2]);
            console2.log("SPP plugin (PUBLIC process):  ", installedPlugins[3]);
            console2.log("Admin plugin (bootstrap):     ", installedPlugins[4]);
        } else {
            console2.log("TokenVoting plugin (PUBLIC body): ", installedPlugins[0]);
            console2.log("SPP plugin (PUBLIC process):  ", installedPlugins[1]);
            console2.log("Admin plugin (bootstrap):     ", installedPlugins[2]);
            console2.log("PUBLIC-ONLY deploy: no CRISP body, no PRIVATE process.");
            console2.log("  Phase 2 installs them into this DAO (make install-private-process).");
        }
        console2.log("NEXT STEP: run `make sync-env` then `make wire-spp` (no vote needed)");
    }

    // --- CRISP (private) ---

    function deployCrispSetup() public returns (CrispVotingSetup) {
        GovernanceERC20 governanceERC20Base = new GovernanceERC20(
            IDAO(address(0)),
            "",
            "",
            GovernanceERC20.MintSettings({receivers: new address[](0), amounts: new uint256[](0)})
        );
        GovernanceWrappedERC20 governanceWrappedERC20Base =
            new GovernanceWrappedERC20(IERC20Upgradeable(address(0)), "", "");
        address crispVoting = address(new CrispVoting());
        return new CrispVotingSetup(governanceERC20Base, governanceWrappedERC20Base, crispVoting);
    }

    function deployCrispRepo(address pluginSetup) public returns (PluginRepo pluginRepo) {
        pluginRepo = PluginRepoFactory(pluginRepoFactory)
            .createPluginRepoWithFirstVersion(nameWithEntropy, pluginSetup, msg.sender, "1", "1");
    }

    function crispPluginSettings(PluginRepo crispRepo, address fold)
        public
        returns (IDAOFactory.PluginSettings memory)
    {
        Utils.CrispEnvVariables memory crispEnv = Utils.readCrispEnv();

        // dao + token are resolved inside prepareInstallation (token from tokenSettings.addr).
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

        // Existing FOLD: addr != 0 => the setup uses it directly (it is IVotes); no mint.
        CrispVotingSetup.TokenSettings memory tokenSettings =
            CrispVotingSetup.TokenSettings({addr: fold, name: "", symbol: ""});
        GovernanceERC20.MintSettings memory mintSettings =
            GovernanceERC20.MintSettings({receivers: new address[](0), amounts: new uint256[](0)});

        // NOTE: no foundation param anymore — the foundation's veto power moved from an
        // execute-gate on the plugin to the SPP's veto stage (configured in wire-spp).
        //
        // `grantExecuteOnDao: false` — this plugin is installed as an SPP body. Granting it
        // EXECUTE on the DAO would let a stage-0 proposal execute without ever reaching the veto
        // stage, which is the whole point of the staged setup. Only a standalone install (the
        // Aragon app's simple-governance path) passes true.
        bytes memory data = abi.encode(params, tokenSettings, mintSettings, false);
        return IDAOFactory.PluginSettings(PluginSetupRef(PluginRepo.Tag(1, 1), crispRepo), data);
    }

    // --- Staged Proposal Processor v1.1 — Aragon canonical repo, referenced by address ---

    /// @dev Installed with EMPTY stages; `make wire-spp` configures stages + permissions once
    ///      the body plugin addresses are known. Rules are empty too (anyone can create SPP
    ///      proposals) until the DAO sets them via the SPPRuleCondition.
    function sppPluginSettings() public view returns (IDAOFactory.PluginSettings memory) {
        PluginRepo sppRepo = PluginRepo(vm.envAddress("SPP_PLUGIN_REPO"));
        uint8 release = uint8(vm.envOr("SPP_RELEASE", uint256(1)));
        uint16 build = uint16(vm.envOr("SPP_BUILD", uint256(1)));

        return IDAOFactory.PluginSettings(PluginSetupRef(PluginRepo.Tag(release, build), sppRepo), SppInstall.encode());
    }

    // --- Admin plugin — Aragon canonical repo, referenced by address (bootstrap) ---

    /// @dev Grants the deployer (or ADMIN_ADDRESS) direct execute-on-DAO power via the Admin
    ///      plugin, so `make wire-spp` can apply the staged-governance wiring in a single tx
    ///      with no vote. The wiring's final action revokes the Admin plugin's EXECUTE on the
    ///      DAO, leaving it installed-but-powerless (Admin's own uninstall can only revoke
    ///      that same permission, so this is the equivalent disarm).
    function adminPluginSettings() public view returns (IDAOFactory.PluginSettings memory) {
        PluginRepo adminRepo = PluginRepo(vm.envAddress("ADMIN_PLUGIN_REPO"));
        uint8 release = uint8(vm.envOr("ADMIN_RELEASE", uint256(1)));
        uint16 build = uint16(vm.envOr("ADMIN_BUILD", uint256(2)));
        address admin = vm.envOr("ADMIN_ADDRESS", vm.addr(vm.envUint("PRIVATE_KEY")));

        // target == address(0) resolves to the DAO in OSx 1.4 (Admin executes on the DAO).
        IPlugin.TargetConfig memory targetConfig =
            IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});

        bytes memory data = abi.encode(admin, targetConfig);
        return IDAOFactory.PluginSettings(PluginSetupRef(PluginRepo.Tag(release, build), adminRepo), data);
    }

    // --- TokenVoting v1.4 (public) — Aragon canonical repo, referenced by address ---
    //     NOTE: the deployed build 4 IS clock-aware (checks the token's ERC-6372 CLOCK_MODE and
    //     snapshots block.timestamp - 1 for timestamp-mode tokens like FOLD), even though older
    //     npm source snapshots block.number only. Verified against the on-chain implementation.

    function tokenVotingPluginSettings(address fold) public view returns (IDAOFactory.PluginSettings memory) {
        PluginRepo tvRepo = PluginRepo(vm.envAddress("TOKEN_VOTING_PLUGIN_REPO"));
        uint8 release = uint8(vm.envOr("TOKEN_VOTING_RELEASE", uint256(1)));
        uint16 build = uint16(vm.envOr("TOKEN_VOTING_BUILD", uint256(1)));

        TokenVotingInstall.VotingSettings memory votingSettings = TokenVotingInstall.VotingSettings({
            votingMode: uint8(vm.envOr("TV_VOTING_MODE", uint256(0))),
            supportThreshold: uint32(vm.envOr("TV_SUPPORT_THRESHOLD", uint256(500_000))), // >50%
            minParticipation: uint32(vm.envOr("TV_MIN_PARTICIPATION", uint256(100_000))), // 10%
            minDuration: uint64(vm.envOr("TV_MIN_DURATION", uint256(3600))), // 1h
            minProposerVotingPower: vm.envOr("TV_MIN_PROPOSER_VOTING_POWER", uint256(0))
        });
        uint256 minApprovals = vm.envOr("TV_MIN_APPROVALS", uint256(0));

        bytes memory data = TokenVotingInstall.encode(fold, votingSettings, minApprovals);
        return IDAOFactory.PluginSettings(PluginSetupRef(PluginRepo.Tag(release, build), tvRepo), data);
    }

    function getDAOSettings() public view returns (IDAOFactory.DAOSettings memory) {
        return IDAOFactory.DAOSettings(address(0), "", nameWithEntropy, "");
    }

    // --- Optional: transfer Interfold ownership to the DAO (gated) ---

    /// @dev Gated on TRANSFER_INTERFOLD_OWNERSHIP. Interfold is Ownable2Step, so this only sets
    ///      the DAO as *pending* owner; the DAO must finalize by executing `acceptOwnership()`
    ///      through a governance proposal (CRISP or TokenVoting). Runs as the current owner
    ///      (the broadcasting deployer), so it no-ops with a log if the deployer isn't the owner.
    function transferInterfoldOwnership(address dao) internal {
        if (!vm.envOr("TRANSFER_INTERFOLD_OWNERSHIP", false)) return;

        address interfold = vm.envOr("INTERFOLD_ADDRESS", address(0));
        if (interfold == address(0)) {
            console2.log("TRANSFER_INTERFOLD_OWNERSHIP set but INTERFOLD_ADDRESS is empty - skipping");
            return;
        }

        IOwnable2Step ownable = IOwnable2Step(interfold);
        address currentOwner = ownable.owner();
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        if (currentOwner != deployer) {
            console2.log("Skipping Interfold ownership transfer: deployer is not the current owner");
            console2.log("  current owner: ", currentOwner);
            console2.log("  deployer:      ", deployer);
            return;
        }

        ownable.transferOwnership(dao);
        console2.log("Interfold ownership transfer initiated (Ownable2Step):");
        console2.log("  interfold:      ", interfold);
        console2.log("  pending owner:  ", ownable.pendingOwner());
        console2.log("  -> DAO must execute Interfold.acceptOwnership() via a governance proposal to finalize.");
    }
}
