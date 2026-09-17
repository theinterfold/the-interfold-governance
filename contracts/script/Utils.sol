// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Test.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

library Utils {
    // the canonical hevm cheat‑code address
    Vm public constant VM = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    /// @notice Mainnet refuses the insecure 512-degree parameter set.
    /// @dev Mirrors `ActiveCryptoConfig.isParamSetSupported`, which accepts SECURE_PARAM_SET(1)
    ///      only outside Sepolia/local. Caught here so a misconfigured `.env` fails the simulate
    ///      step rather than reverting mid-broadcast with `UnsupportedCryptoConfig`.
    error MainnetRequiresSecureParams(uint8 paramSet);

    /// @notice Mainnet refuses committees below the production size.
    error MainnetRequiresSmallCommittee(IInterfold.CommitteeSize committeeSize);

    /// @notice Mainnet refuses a zero `minDuration`.
    /// @dev The private SPP window must meet this floor before it can be wired.
    error MainnetDurationTooShort(uint64 minDuration, uint64 required);

    /// @notice The production floor on the CRISP voting window.
    uint64 internal constant MAINNET_MINIMUM_DURATION = 5 days;

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
        if (config.paramSet != 1) revert MainnetRequiresSecureParams(config.paramSet);
        if (config.committeeSize != IInterfold.CommitteeSize.Small) {
            revert MainnetRequiresSmallCommittee(config.committeeSize);
        }
        if (config.votingSettings.minDuration < MAINNET_MINIMUM_DURATION) {
            revert MainnetDurationTooShort(config.votingSettings.minDuration, MAINNET_MINIMUM_DURATION);
        }
    }
}
