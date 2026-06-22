// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/* solhint-disable no-console */

import {Script, console2} from "forge-std/Script.sol";

/// @dev Minimal view of the DAO's permission manager.
interface IDAOPermissions {
    function grant(address where, address who, bytes32 permissionId) external;
    function revoke(address where, address who, bytes32 permissionId) external;
}

/// @dev Minimal view of the TokenVoting plugin (v1.4 createProposal).
interface ITokenVoting {
    struct Action {
        address to;
        uint256 value;
        bytes data;
    }

    function createProposal(
        bytes calldata metadata,
        Action[] calldata actions,
        uint256 allowFailureMap,
        uint64 startDate,
        uint64 endDate,
        uint8 voteOption,
        bool tryEarlyExecution
    ) external returns (uint256 proposalId);
}

/**
 * @title LockPublicExecution
 * @notice One-time governance bootstrap that gives the foundation a veto on the PUBLIC
 *         (TokenVoting) plugin, matching the CRISP plugin.
 *
 *         TokenVoting's `execute` is gated by EXECUTE_PROPOSAL_PERMISSION, but its canonical
 *         setup grants that permission to ANY_ADDR (anyone can execute). This script creates a
 *         proposal on the token plugin whose actions make the DAO (ROOT) revoke that permission
 *         from ANY_ADDR and grant it to the foundation. Once the proposal passes and is executed
 *         (anyone can execute it while ANY_ADDR still holds the permission), only the foundation
 *         can execute public proposals thereafter.
 *
 *         The caller must hold FOLD voting power. The proposal is created with a Yes vote and
 *         early execution, so if the caller already holds a passing majority it locks down in one
 *         step; otherwise it is left open for the community to vote.
 */
contract LockPublicExecutionScript is Script {
    address internal constant ANY_ADDR = address(type(uint160).max);
    bytes32 internal constant EXECUTE_PROPOSAL_PERMISSION_ID = keccak256("EXECUTE_PROPOSAL_PERMISSION");

    // IMajorityVoting.VoteOption.Yes
    uint8 internal constant VOTE_YES = 2;

    function run() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address tokenPlugin = vm.envAddress("TOKEN_VOTING_PLUGIN_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        require(dao != address(0) && tokenPlugin != address(0) && foundation != address(0), "missing address env");

        // Both actions execute via the DAO against its own permission manager (the DAO is ROOT).
        ITokenVoting.Action[] memory actions = new ITokenVoting.Action[](2);
        actions[0] = ITokenVoting.Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.revoke, (tokenPlugin, ANY_ADDR, EXECUTE_PROPOSAL_PERMISSION_ID))
        });
        actions[1] = ITokenVoting.Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.grant, (tokenPlugin, foundation, EXECUTE_PROPOSAL_PERMISSION_ID))
        });

        bytes memory metadata = bytes(vm.envOr("PROPOSAL_METADATA_URI", string("ipfs://lock-public-execution")));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        uint256 proposalId = ITokenVoting(tokenPlugin).createProposal(metadata, actions, 0, 0, 0, VOTE_YES, true);
        vm.stopBroadcast();

        console2.log("=== Lock public execution ===");
        console2.log("TokenVoting plugin:", tokenPlugin);
        console2.log("proposalId:        ", proposalId);
        console2.log("foundation:        ", foundation);
        console2.log("Once this proposal passes and is executed, only the foundation can execute public proposals.");
    }
}
