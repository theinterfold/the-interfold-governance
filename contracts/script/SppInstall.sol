// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {RuledCondition} from "@aragon/osx-commons-contracts/src/permission/condition/extensions/RuledCondition.sol";

/**
 * @title SppInstall
 * @notice Builds the ABI-encoded installation params for Aragon's canonical Staged Proposal
 *         Processor (SPP) v1.1 `StagedProposalProcessorSetup.prepareInstallation`, WITHOUT
 *         importing the SPP source (referenced purely by its published repo address + tag,
 *         same pattern as TokenVotingInstall).
 *
 *         The tuple layout MUST stay byte-identical to the setup's decode:
 *           (bytes pluginMetadata, SPP.Stage[] stages, RuledCondition.Rule[] rules,
 *            IPlugin.TargetConfig targetConfig)
 *
 *         Stages are installed EMPTY and configured post-deploy via `updateStages` in the
 *         wiring proposal (see WireSpp.s.sol): the body plugin addresses are only known after
 *         `createDao`, so they cannot be encoded here. `createProposal` on the SPP reverts
 *         until stages exist, which is safe.
 */
library SppInstall {
    /// @dev Mirrors StagedProposalProcessor.ResultType.
    enum ResultType {
        None,
        Approval,
        Veto
    }

    /// @dev Mirrors StagedProposalProcessor.Body (field order matters for abi.encode).
    struct Body {
        address addr;
        bool isManual;
        bool tryAdvance;
        ResultType resultType;
    }

    /// @dev Mirrors StagedProposalProcessor.Stage (field order matters for abi.encode).
    struct Stage {
        Body[] bodies;
        uint64 maxAdvance;
        uint64 minAdvance;
        uint64 voteDuration;
        uint16 approvalThreshold;
        uint16 vetoThreshold;
        bool cancelable;
        bool editable;
    }

    /// @notice Encode install params: no metadata, empty stages, empty rules (anyone can create
    ///         proposals on the SPP until the DAO sets rules), target == DAO via regular call.
    function encode() internal pure returns (bytes memory) {
        return encode(bytes(""));
    }

    /// @notice Same, carrying `pluginMetadata` — the UTF-8 bytes of an `ipfs://` URI whose JSON
    ///         is `{name, description, links, processKey, stageNames}` (the process-metadata
    ///         shape the Aragon app pins for a staged process).
    function encode(bytes memory pluginMetadata) internal pure returns (bytes memory) {
        // target == address(0) resolves to the DAO in OSx 1.4 (the SPP executes passed
        // proposals' actions on the DAO; its setup grants it EXECUTE_PERMISSION there).
        IPlugin.TargetConfig memory targetConfig =
            IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});

        return abi.encode(pluginMetadata, new Stage[](0), new RuledCondition.Rule[](0), targetConfig);
    }
}
