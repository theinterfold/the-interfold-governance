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
 *           1. sppPrivate.updateStages([crisp approval, foundation veto])     (private only)
 *           2. sppPublic.updateStages([tokenVoting approval, foundation veto])
 *           3. grant  CREATE_PROPOSAL on crisp        -> sppPrivate           (private only)
 *           4. grant  CREATE_PROPOSAL on tokenVoting  -> sppPublic
 *           5. crisp.setTargetConfig(executor, DelegateCall)                  (private only)
 *           6. tokenVoting.setTargetConfig(executor, DelegateCall)
 *           7. revoke EXECUTE on DAO from tokenVoting   <- closes the veto bypass
 *           8. revoke EXECUTE on DAO from adminPlugin    <- disarms the bootstrap; MUST be last
 *              (this batch still runs under the Admin plugin's EXECUTE permission)
 *
 *         5/6 make sub-proposal execution delegatecall the stateless Executor, so the SPP's
 *         `reportProposalResult` callback sees the BODY as msg.sender (and the bodies no
 *         longer need — or have — execute rights on the DAO).
 *
 *         Two env flags shape the batch (both default to the single-phase Sepolia behaviour):
 *           DEPLOY_PRIVATE_PROCESS (default true)  — false drops the three private actions.
 *           DISARM_ADMIN           (default true)  — false KEEPS the Admin plugin armed so a
 *             later phase can install plugins without a vote. This leaves an EOA able to
 *             execute anything on the DAO: `make install-private-process` performs the disarm
 *             as its own final action. See docs/mainnet-deployment.md.
 *
 *         Optionally (CRISP_FEE_DEPOSIT_AMOUNT > 0) the deployer escrows CRISP fee credit.
 */
contract WireSppScript is Script {
    using SafeERC20 for IERC20;

    bytes32 internal constant CREATE_PROPOSAL_PERMISSION_ID = keccak256("CREATE_PROPOSAL_PERMISSION");
    bytes32 internal constant EXECUTE_PERMISSION_ID = keccak256("EXECUTE_PERMISSION");

    /// @notice Prints the `updateStages` calldata for both SPPs under the current env config
    ///         (incl. SPP_STAGE1_MODE) WITHOUT broadcasting. Paste each blob as a proposal
    ///         action (to = the SPP, value = 0) to change the stage config via governance —
    ///         the DAO holds the SPPs' update-stages permission, so no redeploy is needed.
    ///         Usage: forge script script/WireSpp.s.sol:WireSppScript --sig "printUpdateStages()"
    function printUpdateStages() external view {
        address crisp = vm.envAddress("CRISP_VOTING_PLUGIN_ADDRESS");
        address tokenVoting = vm.envAddress("TOKEN_VOTING_PLUGIN_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");

        console2.log("Action 1 - to (SPP private):", vm.envAddress("SPP_PRIVATE_ADDRESS"));
        console2.logBytes(abi.encodeCall(ISpp.updateStages, (stagesFor(crisp, foundation, true))));
        console2.log("Action 2 - to (SPP public):", vm.envAddress("SPP_PUBLIC_ADDRESS"));
        console2.logBytes(abi.encodeCall(ISpp.updateStages, (stagesFor(tokenVoting, foundation, false))));
    }

    /// @notice Disarms the Admin bootstrap on its own: revokes its EXECUTE on the DAO.
    ///         For the phased rollout, where `wire-spp` ran with DISARM_ADMIN=false and the
    ///         Admin plugin is still armed — use this if phase 2 is abandoned or deferred, so
    ///         the DAO is never left with a live no-vote execution path.
    ///         Usage: forge script script/WireSpp.s.sol:WireSppScript --sig "disarmAdmin()" \
    ///                  --rpc-url $RPC_URL --broadcast
    ///         Irreversible without a governance proposal re-granting EXECUTE.
    function disarmAdmin() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        require(dao != address(0) && adminPlugin != address(0), "missing address env");

        Action[] memory actions = new Action[](1);
        actions[0] = Action({
            to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, adminPlugin, EXECUTE_PERMISSION_ID))
        });

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        uint256 proposalId = IAdmin(adminPlugin).executeProposal(bytes("ipfs://disarm-admin"), actions, 0);
        vm.stopBroadcast();

        console2.log("=== Admin bootstrap disarmed ===");
        console2.log("admin proposalId:  ", proposalId);
        console2.log("The Admin plugin no longer holds EXECUTE on the DAO (INV-29).");
    }

    /// @dev `virtual` so InstallPrivateProcess can inherit the stage builder and helpers
    ///      while exposing its own `run()` entrypoint.
    function run() external virtual {
        bool withPrivate = vm.envOr("DEPLOY_PRIVATE_PROCESS", true);
        bool shouldDisarmAdmin = vm.envOr("DISARM_ADMIN", true);

        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        address sppPrivate = withPrivate ? vm.envAddress("SPP_PRIVATE_ADDRESS") : address(0);
        address sppPublic = vm.envAddress("SPP_PUBLIC_ADDRESS");
        address crisp = withPrivate ? vm.envAddress("CRISP_VOTING_PLUGIN_ADDRESS") : address(0);

        Action[] memory actions = buildWiringActions(withPrivate, shouldDisarmAdmin);

        bytes memory metadata = bytes(vm.envOr("PROPOSAL_METADATA_URI", string("ipfs://wire-spp")));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // Optional: escrow fee-token credit for the DEPLOYER on the CRISP plugin (creator-pays:
        // each creator deposits their own credit; this only covers proposals the deployer creates).
        // No CRISP plugin exists in a public-only wiring, so there is nothing to fund.
        uint256 prefund = withPrivate ? vm.envOr("CRISP_FEE_DEPOSIT_AMOUNT", uint256(0)) : 0;
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
        console2.log("SPP public:        ", sppPublic);
        if (withPrivate) {
            console2.log("SPP private:       ", sppPrivate);
        } else {
            console2.log("SPP private:        <not deployed - public-only phase>");
        }
        if (shouldDisarmAdmin) {
            console2.log("Wiring applied. Admin plugin disarmed (EXECUTE on DAO revoked).");
        } else {
            console2.log("Wiring applied. Admin plugin LEFT ARMED (DISARM_ADMIN=false).");
            console2.log("  WARNING: the admin EOA can execute anything on this DAO until disarmed.");
            console2.log("  Disarm with `make install-private-process`, or `make disarm-admin` to disarm now.");
        }
        console2.log("ALL new proposals must now be created on the SPP plugins.");
    }

    /// @notice Builds the wiring batch from the current env. Split out of `run()` so the exact
    ///         action set can be asserted in tests without broadcasting (WireSppStages.t.sol).
    /// @param withPrivate include the three private-process actions.
    /// @param shouldDisarmAdmin append the Admin disarm as the final action.
    function buildWiringActions(bool withPrivate, bool shouldDisarmAdmin)
        internal
        view
        returns (Action[] memory actions)
    {
        address dao = vm.envAddress("DAO_ADDRESS");
        address tokenVoting = vm.envAddress("TOKEN_VOTING_PLUGIN_ADDRESS");
        address sppPublic = vm.envAddress("SPP_PUBLIC_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        require(
            dao != address(0) && tokenVoting != address(0) && sppPublic != address(0) && executor != address(0)
                && foundation != address(0) && adminPlugin != address(0),
            "missing address env"
        );

        // Only read/require the private addresses when the private process exists.
        address crisp;
        address sppPrivate;
        if (withPrivate) {
            crisp = vm.envAddress("CRISP_VOTING_PLUGIN_ADDRESS");
            sppPrivate = vm.envAddress("SPP_PRIVATE_ADDRESS");
            require(crisp != address(0) && sppPrivate != address(0), "missing private address env");
        }

        IPlugin.TargetConfig memory delegateExecutor =
            IPlugin.TargetConfig({target: executor, operation: IPlugin.Operation.DelegateCall});

        // 4 public actions, +3 for the private process, +1 for the Admin disarm.
        actions = new Action[]((withPrivate ? 7 : 4) + (shouldDisarmAdmin ? 1 : 0));
        uint256 n;

        if (withPrivate) {
            actions[n++] = Action({
                to: sppPrivate, value: 0, data: abi.encodeCall(ISpp.updateStages, (stagesFor(crisp, foundation, true)))
            });
        }
        actions[n++] = Action({
            to: sppPublic,
            value: 0,
            data: abi.encodeCall(ISpp.updateStages, (stagesFor(tokenVoting, foundation, false)))
        });
        if (withPrivate) {
            actions[n++] = Action({
                to: dao,
                value: 0,
                data: abi.encodeCall(IDAOPermissions.grant, (crisp, sppPrivate, CREATE_PROPOSAL_PERMISSION_ID))
            });
        }
        actions[n++] = Action({
            to: dao,
            value: 0,
            data: abi.encodeCall(IDAOPermissions.grant, (tokenVoting, sppPublic, CREATE_PROPOSAL_PERMISSION_ID))
        });
        if (withPrivate) {
            actions[n++] =
                Action({to: crisp, value: 0, data: abi.encodeCall(IPluginTarget.setTargetConfig, (delegateExecutor))});
        }
        actions[n++] = Action({
            to: tokenVoting, value: 0, data: abi.encodeCall(IPluginTarget.setTargetConfig, (delegateExecutor))
        });
        // Close the veto bypass: the public body can no longer execute directly on the DAO.
        actions[n++] = Action({
            to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, tokenVoting, EXECUTE_PERMISSION_ID))
        });
        // MUST stay last: disarm the bootstrap. This batch runs under the Admin plugin's
        // EXECUTE permission (checked once at the start of dao.execute), so revoking it here
        // does not abort the batch — but it must be the final action.
        //
        // Skipped when DISARM_ADMIN=false: the Admin plugin stays armed so a later phase can
        // install plugins without a vote, and that phase performs this same revoke last.
        if (shouldDisarmAdmin) {
            actions[n++] = Action({
                to: dao,
                value: 0,
                data: abi.encodeCall(IDAOPermissions.revoke, (dao, adminPlugin, EXECUTE_PERMISSION_ID))
            });
        }
        require(n == actions.length, "action count mismatch");
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

        // Stage 1 mode (SPP_STAGE1_MODE): "approval" (default) or "veto".
        //   approval — opt-in: the foundation must explicitly report an Approval before the
        //              proposal can execute; silence means it expires at maxAdvance (rejection).
        //   veto     — opt-out: the proposal is held for the veto window; silence means consent
        //              and anyone can execute after the window lapses.
        // Switching later needs NO redeploy: the DAO holds the SPP's update-stages permission
        // (wire-spp itself uses it), so a passed governance proposal with action
        // `spp.updateStages(stagesFor(...))` flips the mode for all FUTURE proposals
        // (in-flight ones keep the stage config they were created under).
        bool approvalMode = keccak256(bytes(vm.envOr("SPP_STAGE1_MODE", string("approval")))) != keccak256("veto");

        SppInstall.Body[] memory foundationBodies = new SppInstall.Body[](1);
        foundationBodies[0] = SppInstall.Body({
            addr: foundation,
            isManual: true, // the foundation calls reportProposalResult(id, 1, <result>, false) itself
            tryAdvance: false,
            resultType: approvalMode ? SppInstall.ResultType.Approval : SppInstall.ResultType.Veto
        });
        stages[1] = SppInstall.Stage({
            bodies: foundationBodies,
            maxAdvance: vetoDuration + executeWindow,
            minAdvance: 0,
            // approval: advanceable the moment the approval lands (no forced hold window).
            // veto: with vetoThreshold > 0 the SPP holds the proposal Active for the full
            // window before it becomes advanceable.
            voteDuration: approvalMode ? 0 : vetoDuration,
            approvalThreshold: approvalMode ? 1 : 0,
            vetoThreshold: approvalMode ? 0 : 1,
            cancelable: false,
            editable: false
        });
    }
}
