// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {IPermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/IPermissionCondition.sol";
import {PermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/PermissionCondition.sol";

import {ICrispVoting} from "../ICrispVoting.sol";

/// @title CrispProposerCondition
/// @notice The proposal-creation rule of a CRISP body, as an OSx permission condition: an account
///     is granted if it is an eligible proposer of the plugin.
/// @dev Returned by `CrispVotingSetup` at `helpers[0]` and used as the Staged Proposal Processor's
///     creation rule. In a staged process `CrispVoting` does not re-check the proposer (the SPP,
///     which holds no votes, is its caller), so this condition is the only voting-power gate.
///     It asks the plugin rather than reading the token itself, so it applies EXACTLY the rule a
///     direct creator faces: past votes at the previous timepoint, never live balance, which
///     would let a proposer borrow tokens to create.
contract CrispProposerCondition is PermissionCondition {
    /// @notice The CRISP plugin whose proposer rule this condition applies.
    // solhint-disable-next-line immutable-vars-naming
    ICrispVoting public immutable plugin;

    /// @param _plugin The CRISP plugin.
    constructor(address _plugin) {
        plugin = ICrispVoting(_plugin);
    }

    /// @inheritdoc IPermissionCondition
    function isGranted(address _where, address _who, bytes32 _permissionId, bytes calldata _data)
        public
        view
        override
        returns (bool)
    {
        (_where, _permissionId, _data);

        return plugin.isProposerEligible(_who);
    }
}
