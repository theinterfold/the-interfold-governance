// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Test.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

library Utils {
    // the canonical hevm cheat‑code address
    Vm public constant VM = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    /// @notice Mainnet refuses the insecure 512-degree parameter set.
    /// @dev Matches v0.19's SECURE_PARAM_SET(2). The old identifier remains a historical
    ///      configuration, not a default for new requests. A misconfigured `.env` fails the simulate
    ///      step rather than reverting mid-broadcast with `UnsupportedCryptoConfig`.
    error MainnetRequiresSecureParams(uint8 paramSet);

    /// @notice Mainnet refuses committees below the production size.
    error MainnetRequiresSmallCommittee(IInterfold.CommitteeSize committeeSize);

    /// @notice Mainnet refuses a zero `minDuration`.
    /// @dev The private SPP window must meet this floor before it can be wired.
    error MainnetDurationTooShort(uint64 minDuration, uint64 required);

    /// @notice The production floor on the CRISP voting window.
    uint64 internal constant MAINNET_MINIMUM_DURATION = 5 days;

    /// @notice Mainnet FOLD voting power uses 18 decimals.
    uint256 internal constant MAINNET_MINIMUM_VOTER_VOTING_POWER = 71 ether;

    /// @notice The existing Foundation-maintained CRISP repository on Ethereum mainnet.
    address internal constant MAINNET_CRISP_REPO = 0x3C9F0aBb016Da5C1cCF944dDDFD2A04DD43415A1;

    error MainnetVoterMinimumTooLow(uint256 minimum, uint256 required);

    /// @notice Reads published metadata; empty release metadata preserves an existing release.
    function crispBuildMetadata() internal view returns (bytes memory buildMetadata, bytes memory releaseMetadata) {
        buildMetadata = bytes(VM.envOr("CRISP_BUILD_METADATA_URI", string("")));
        releaseMetadata = bytes(VM.envOr("CRISP_RELEASE_METADATA_URI", string("")));
    }

    struct CrispEnvVariables {
        address interfold;
        address crispProgramAddress;
        ICrispVoting.VotingSettings votingSettings;
        IPlugin.TargetConfig targetConfig;
        IInterfold.CommitteeSize committeeSize;
        uint8 paramSet;
        bytes computeProviderParams;
    }

    function readCrispEnv() public view returns (CrispEnvVariables memory crispEnvVariables) {
        IPlugin.TargetConfig memory defaultTargetConfig =
            IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});

        crispEnvVariables.interfold = VM.envAddress("INTERFOLD_ADDRESS");
        crispEnvVariables.crispProgramAddress = VM.envAddress("CRISP_PROGRAM_ADDRESS");
        crispEnvVariables.votingSettings = ICrispVoting.VotingSettings({
            minProposerVotingPower: VM.envUint("MINIMUM_PROPOSER_VOTING_POWER"),
            minVoterVotingPower: VM.envUint("MINIMUM_VOTER_VOTING_POWER"),
            minDuration: uint64(VM.envUint("MINIMUM_DURATION")),
            minParticipation: uint32(VM.envUint("MINIMUM_PARTICIPATION")),
            supportThreshold: uint32(VM.envUint("SUPPORT_THRESHOLD"))
        });
        crispEnvVariables.targetConfig = defaultTargetConfig;
        crispEnvVariables.committeeSize = IInterfold.CommitteeSize(uint8(VM.envUint("COMMITTEE_SIZE")));
        crispEnvVariables.computeProviderParams = VM.envBytes("COMPUTE_PROVIDER_PARAMS");
        crispEnvVariables.paramSet = uint8(VM.envUint("PARAM_SET"));
        validateDeploymentPolicy(block.chainid, crispEnvVariables);
    }

    /// @notice Prevents a production deployment from silently using test cryptography or policy.
    /// @dev Chain-gated rather than unconditional: Sepolia and local chains legitimately run the
    ///      insecure preset and a minimum committee, and `ActiveCryptoConfig.isParamSetSupported`
    ///      allows both there. Only mainnet is constrained.
    function validateDeploymentPolicy(uint256 chainId, CrispEnvVariables memory config) internal pure {
        if (chainId != 1) return;
        if (config.paramSet != 2) revert MainnetRequiresSecureParams(config.paramSet);
        if (config.committeeSize != IInterfold.CommitteeSize.Small) {
            revert MainnetRequiresSmallCommittee(config.committeeSize);
        }
        if (config.votingSettings.minDuration < MAINNET_MINIMUM_DURATION) {
            revert MainnetDurationTooShort(config.votingSettings.minDuration, MAINNET_MINIMUM_DURATION);
        }
        validateVoterMinimum(chainId, config.votingSettings.minVoterVotingPower);
    }

    /// @notice Rejects stale mainnet settings when installing or updating the CRISP plugin.
    function validateVoterMinimum(uint256 chainId, uint256 minimum) internal pure {
        if (chainId == 1 && minimum < MAINNET_MINIMUM_VOTER_VOTING_POWER) {
            revert MainnetVoterMinimumTooLow(minimum, MAINNET_MINIMUM_VOTER_VOTING_POWER);
        }
    }

    /// @notice Checks encoded Safe inputs too, including payloads from an earlier installation.
    function validateCrispInstallData(uint256 chainId, bytes memory data) internal pure {
        if (chainId != 1) return;
        (ICrispVoting.PluginInitParams memory params,,) =
            abi.decode(data, (ICrispVoting.PluginInitParams, address, bool));
        CrispEnvVariables memory config;
        config.paramSet = params.paramSet;
        config.committeeSize = params.committeeSize;
        config.votingSettings = params.votingSettings;
        validateDeploymentPolicy(chainId, config);
    }

    /// @notice Rejects a stale prepared plugin before an apply action is generated.
    function validatePreparedCrisp(address plugin) internal view {
        if (block.chainid == 1) {
            validateVoterMinimum(block.chainid, CrispVoting(plugin).minVoterVotingPower());
        }
    }

    /// @notice Recognizes mainnet CRISP aliases even without optional repository configuration.
    function isCrispInstallation(string memory prefix, address repo) internal view returns (bool) {
        if (keccak256(bytes(prefix)) == keccak256("CRISP")) return true;
        if (block.chainid == 1 && repo == MAINNET_CRISP_REPO) return true;
        address crispRepo = VM.envOr("CRISP_PLUGIN_REPO", address(0));
        return crispRepo != address(0) && repo == crispRepo;
    }
}
