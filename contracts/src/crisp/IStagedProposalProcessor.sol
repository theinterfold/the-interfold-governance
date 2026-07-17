// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

/// @notice Minimal view of Aragon's Staged Proposal Processor, used by CrispVoting to
/// resolve the CREATOR of the parent (SPP) proposal when a sub-proposal is created on it.
/// The struct layout MUST stay identical to StagedProposalProcessor.Proposal (v1.1).
interface IStagedProposalProcessor {
    struct Proposal {
        uint128 allowFailureMap;
        uint64 lastStageTransition;
        uint16 currentStage;
        uint16 stageConfigIndex;
        bool executed;
        bool canceled;
        address creator;
        Action[] actions;
        IPlugin.TargetConfig targetConfig;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory);
}
