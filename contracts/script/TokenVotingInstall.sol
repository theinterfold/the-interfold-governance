// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

/**
 * @title TokenVotingInstall
 * @notice Builds the ABI-encoded installation params for Aragon's canonical TokenVoting v1.4
 *         `TokenVotingSetup.prepareInstallation`, WITHOUT importing the v1.4 source (which would
 *         clash with crisp-aragon-plugin's older bundled GovernanceERC20).
 *
 *         The tuple layout MUST stay byte-identical to
 *         TokenVotingSetup.decodeInstallationParameters:
 *           (VotingSettings, TokenSettings, MintSettings, IPlugin.TargetConfig,
 *            uint256 minApprovals, bytes pluginMetadata, address[] excludedAccounts)
 */
library TokenVotingInstall {
    struct VotingSettings {
        uint8 votingMode; // 0 Standard, 1 EarlyExecution, 2 VoteReplacement
        uint32 supportThreshold; // ppm out of 1_000_000
        uint32 minParticipation; // ppm out of 1_000_000
        uint64 minDuration; // seconds
        uint256 minProposerVotingPower;
    }

    struct TokenSettings {
        address addr;
        string name;
        string symbol;
    }

    struct MintSettings {
        address[] receivers;
        uint256[] amounts;
        bool ensureDelegationOnMint;
    }

    /// @notice Encode install params for an EXISTING IVotes token (`fold`): no mint, target == DAO.
    function encode(address fold, VotingSettings memory votingSettings, uint256 minApprovals)
        internal
        pure
        returns (bytes memory)
    {
        TokenSettings memory tokenSettings = TokenSettings({addr: fold, name: "", symbol: ""});
        MintSettings memory mintSettings =
            MintSettings({receivers: new address[](0), amounts: new uint256[](0), ensureDelegationOnMint: false});

        // target == address(0) resolves to the DAO in OSx 1.4 (execute via the DAO).
        IPlugin.TargetConfig memory targetConfig =
            IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});

        bytes memory pluginMetadata = bytes("");
        address[] memory excludedAccounts = new address[](0);

        return abi.encode(
            votingSettings, tokenSettings, mintSettings, targetConfig, minApprovals, pluginMetadata, excludedAccounts
        );
    }
}
