// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

/* solhint-disable no-console */

import {Script, console2} from "forge-std/Script.sol";

import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {SppInstall} from "./SppInstall.sol";

/// @dev Minimal view of the DAO's permission manager.
interface IDAOPermissions {
    function grant(address where, address who, bytes32 permissionId) external;
    function revoke(address where, address who, bytes32 permissionId) external;
}

/// @dev Minimal view of the SPP (structs mirrored via SppInstall so the encoded
///      calldata matches `updateStages(Stage[] calldata)` exactly).
interface ISpp {
    function updateStages(SppInstall.Stage[] calldata stages) external;
}

/// @dev Minimal view of an OSx 1.4 plugin's target-config setter.
interface IPluginTarget {
    function setTargetConfig(IPlugin.TargetConfig calldata targetConfig) external;
}

/// @dev Minimal view of Aragon's Admin plugin (release 1, build 2). The caller must hold
///      EXECUTE_PROPOSAL_PERMISSION on it (granted to the deployer at install); the plugin
///      forwards the actions to the DAO, which it holds EXECUTE_PERMISSION on.
interface IAdmin {
    function executeProposal(bytes calldata metadata, Action[] calldata actions, uint256 allowFailureMap)
        external
        returns (uint256 proposalId);
}

/// @dev Minimal view of the CRISP plugin's fee escrow.
interface ICrispFee {
    function interfoldFeeToken() external view returns (address);
    function deposit(uint256 amount) external;
}

/**
 * @title WireSpp
 * @notice One-shot bootstrap that turns the freshly deployed DAO into a staged (SPP)
 *         governance system with a foundation veto stage — NO vote required. The Admin
 *         plugin (installed at deploy time) grants the deployer direct execute-on-DAO power;
 *         this script has the Admin plugin execute all wiring actions in a single tx, and the
 *         final action revokes the Admin plugin's own EXECUTE on the DAO, disarming it.
 *
 *         Resulting proposal flow (both processes):
 *           stage 0  voting body approves   (CRISP private / TokenVoting public)
 *           stage 1  foundation may VETO within the veto window; otherwise anyone advances
 *                    and the SPP executes the actions on the DAO.
 *
 *         Actions, in order:
 *           1. sppPrivate.updateStages([crisp approval, foundation veto])
 *           2. sppPublic.updateStages([tokenVoting approval, foundation veto])
 *           3. grant  CREATE_PROPOSAL on crisp        -> sppPrivate
 *           4. grant  CREATE_PROPOSAL on tokenVoting  -> sppPublic
 *           5. crisp.setTargetConfig(executor, DelegateCall)
 *           6. tokenVoting.setTargetConfig(executor, DelegateCall)
 *           7. revoke EXECUTE on DAO from tokenVoting   <- closes the veto bypass
 *           8. revoke EXECUTE on DAO from adminPlugin    <- disarms the bootstrap; MUST be last
 *              (this batch still runs under the Admin plugin's EXECUTE permission)
 *
 *         5/6 make sub-proposal execution delegatecall the stateless Executor, so the SPP's
 *         `reportProposalResult` callback sees the BODY as msg.sender (and the bodies no
 *         longer need — or have — execute rights on the DAO).
 *
 *         Optionally (CRISP_FEE_DEPOSIT_AMOUNT > 0) the deployer escrows CRISP fee credit.
 */
contract WireSppScript is Script {
    using SafeERC20 for IERC20;

    bytes32 internal constant CREATE_PROPOSAL_PERMISSION_ID = keccak256("CREATE_PROPOSAL_PERMISSION");
    bytes32 internal constant EXECUTE_PERMISSION_ID = keccak256("EXECUTE_PERMISSION");

    function run() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address crisp = vm.envAddress("CRISP_VOTING_PLUGIN_ADDRESS");
        address tokenVoting = vm.envAddress("TOKEN_VOTING_PLUGIN_ADDRESS");
        address sppPrivate = vm.envAddress("SPP_PRIVATE_ADDRESS");
        address sppPublic = vm.envAddress("SPP_PUBLIC_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        require(
            dao != address(0) && crisp != address(0) && tokenVoting != address(0) && sppPrivate != address(0)
                && sppPublic != address(0) && executor != address(0) && foundation != address(0)
                && adminPlugin != address(0),
            "missing address env"
        );

        IPlugin.TargetConfig memory delegateExecutor =
            IPlugin.TargetConfig({target: executor, operation: IPlugin.Operation.DelegateCall});

        Action[] memory actions = new Action[](8);
        actions[0] = Action({
            to: sppPrivate, value: 0, data: abi.encodeCall(ISpp.updateStages, (stagesFor(crisp, foundation, true)))
        });
        actions[1] = Action({
            to: sppPublic,
            value: 0,
            data: abi.encodeCall(ISpp.updateStages, (stagesFor(tokenVoting, foundation, false)))
        });
        actions[2] = Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.grant, (crisp, sppPrivate, CREATE_PROPOSAL_PERMISSION_ID))
        });
        actions[3] = Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.grant, (tokenVoting, sppPublic, CREATE_PROPOSAL_PERMISSION_ID))
        });
        actions[4] =
            Action({to: crisp, value: 0, data: abi.encodeCall(IPluginTarget.setTargetConfig, (delegateExecutor))});
        actions[5] = Action({
            to: tokenVoting, value: 0, data: abi.encodeCall(IPluginTarget.setTargetConfig, (delegateExecutor))
        });
        // Close the veto bypass: the public body can no longer execute directly on the DAO.
        actions[6] = Action({
            to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, tokenVoting, EXECUTE_PERMISSION_ID))
        });
        // MUST stay last: disarm the bootstrap. This batch runs under the Admin plugin's
        // EXECUTE permission (checked once at the start of dao.execute), so revoking it here
        // does not abort the batch — but it must be the final action.
        actions[7] = Action({
            to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, adminPlugin, EXECUTE_PERMISSION_ID))
        });

        bytes memory metadata = bytes(vm.envOr("PROPOSAL_METADATA_URI", string("ipfs://wire-spp")));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // Optional: escrow fee-token credit for the DEPLOYER on the CRISP plugin (creator-pays:
        // each creator deposits their own credit; this only covers proposals the deployer creates).
        uint256 prefund = vm.envOr("CRISP_FEE_DEPOSIT_AMOUNT", uint256(0));
        if (prefund > 0) {
            IERC20 feeToken = IERC20(ICrispFee(crisp).interfoldFeeToken());
            feeToken.safeIncreaseAllowance(crisp, prefund);
            ICrispFee(crisp).deposit(prefund);
            console2.log("Deposited fee credit for the deployer:", prefund);
        }

        // Admin executes the whole wiring atomically — no vote, single tx.
        uint256 proposalId = IAdmin(adminPlugin).executeProposal(metadata, actions, 0);
        vm.stopBroadcast();

        console2.log("=== Wire SPP (staged governance + foundation veto) ===");
        console2.log("admin proposalId:  ", proposalId);
        console2.log("SPP private:       ", sppPrivate);
        console2.log("SPP public:        ", sppPublic);
        console2.log("Wiring applied. Admin plugin disarmed (EXECUTE on DAO revoked).");
        console2.log("ALL new proposals must now be created on the SPP plugins.");
    }

    /// @dev Builds the two-stage config: [voting body approval, foundation manual veto].
    function stagesFor(address votingBody, address foundation, bool isPrivate)
        internal
        view
        returns (SppInstall.Stage[] memory stages)
    {
        // Stage 0 timing. The public default respects TokenVoting's minDuration (1h).
        uint64 voteDuration = uint64(
            isPrivate
                ? vm.envOr("SPP_PRIVATE_VOTE_DURATION", uint256(3600))
                : vm.envOr("SPP_PUBLIC_VOTE_DURATION", uint256(3600))
        );
        // Window to advance a passed stage-0 before it expires (on top of the vote itself).
        uint64 advanceWindow = uint64(vm.envOr("SPP_ADVANCE_WINDOW", uint256(7 days)));
        // Stage 1 veto window: the proposal is held Active this long for the foundation to veto.
        uint64 vetoDuration = uint64(vm.envOr("SPP_VETO_DURATION", uint256(2 days)));
        // Window to execute after the veto window lapses, before the proposal expires.
        uint64 executeWindow = uint64(vm.envOr("SPP_EXECUTE_WINDOW", uint256(30 days)));

        stages = new SppInstall.Stage[](2);

        SppInstall.Body[] memory approvalBodies = new SppInstall.Body[](1);
        approvalBodies[0] = SppInstall.Body({
            addr: votingBody,
            isManual: false, // SPP creates the sub-proposal on the body
            tryAdvance: true, // executing the passed sub-proposal auto-advances to the veto stage
            resultType: SppInstall.ResultType.Approval
        });
        // PUBLIC path: minAdvance = voteDuration forces the SPP to wait for the full voting
        // window before advancing, so stage 0 is decided on the FINAL TokenVoting tally, never
        // an early-locked one (TokenVoting.hasSucceeded reports an early-reached threshold while
        // the vote is open even in Standard mode; minAdvance neutralises that for advancement).
        // PRIVATE path: the CRISP tally only exists after the E3 window closes, so the full
        // window is already enforced by tally availability — minAdvance 0 is sufficient and
        // avoids coupling to the (per-proposal, possibly longer) custom voting duration.
        stages[0] = SppInstall.Stage({
            bodies: approvalBodies,
            maxAdvance: voteDuration + advanceWindow,
            minAdvance: isPrivate ? 0 : voteDuration,
            voteDuration: voteDuration,
            approvalThreshold: 1,
            vetoThreshold: 0,
            cancelable: false,
            editable: false
        });

        SppInstall.Body[] memory vetoBodies = new SppInstall.Body[](1);
        vetoBodies[0] = SppInstall.Body({
            addr: foundation,
            isManual: true, // the foundation calls reportProposalResult(id, 1, Veto, false) itself
            tryAdvance: false,
            resultType: SppInstall.ResultType.Veto
        });
        stages[1] = SppInstall.Stage({
            bodies: vetoBodies,
            maxAdvance: vetoDuration + executeWindow,
            minAdvance: 0,
            voteDuration: vetoDuration, // with vetoThreshold > 0 the SPP holds the proposal
            approvalThreshold: 0, // Active for the full window before it becomes advanceable
            vetoThreshold: 1,
            cancelable: false,
            editable: false
        });
    }
}
