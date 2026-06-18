// SPDX-License-Identifier: MIT
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

import {CrispVoting} from "@crisp-aragon-plugin/src/CrispVoting.sol";
import {CrispVotingSetup} from "@crisp-aragon-plugin/src/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "@crisp-aragon-plugin/src/ICrispVoting.sol";
import {Utils} from "@crisp-aragon-plugin/script/Utils.sol";
import {IDAOFactory} from "@crisp-aragon-plugin/src/IDAOFactory.sol";

import {TokenVotingInstall} from "./TokenVotingInstall.sol";

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

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // 1. Deploy + publish the CRISP plugin as a new PluginRepo.
        CrispVotingSetup crispSetup = deployCrispSetup();
        PluginRepo crispRepo = deployCrispRepo(address(crispSetup));

        // 2. Assemble both installations, both pointed at the existing FOLD token.
        IDAOFactory.PluginSettings[] memory pluginSettings = new IDAOFactory.PluginSettings[](2);
        pluginSettings[0] = crispPluginSettings(crispRepo, fold); // index 0 -> PRIVATE
        pluginSettings[1] = tokenVotingPluginSettings(fold); // index 1 -> PUBLIC

        // 3. Create the DAO with both plugins installed atomically.
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

        // 6. Log everything needed for the frontend .env.
        console2.log("=== The Interfold DAO ===");
        console2.log("DAO:                 ", createdDAO);
        console2.log("FOLD token (shared): ", fold);
        console2.log("CRISP PluginRepo:    ", address(crispRepo));
        console2.log("CRISP setup:         ", address(crispSetup));
        if (installedPlugins.length == 2) {
            console2.log("CRISP plugin (PRIVATE):       ", installedPlugins[0]);
            console2.log("TokenVoting plugin (PUBLIC):  ", installedPlugins[1]);
        } else {
            for (uint256 i = 0; i < installedPlugins.length; i++) {
                console2.log("Installed plugin:    ", installedPlugins[i]);
            }
        }
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
        pluginRepo = PluginRepoFactory(pluginRepoFactory).createPluginRepoWithFirstVersion(
            nameWithEntropy, pluginSetup, msg.sender, "1", "1"
        );
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
            enclave: crispEnv.enclave,
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

        bytes memory data = abi.encode(params, tokenSettings, mintSettings);
        return IDAOFactory.PluginSettings(PluginSetupRef(PluginRepo.Tag(1, 1), crispRepo), data);
    }

    // --- TokenVoting v1.4 (public) — Aragon canonical repo, referenced by address ---

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
