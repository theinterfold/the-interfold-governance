// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

/* solhint-disable no-console */

import {console2} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";

import {Executor} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginSetupRef} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";

import {SafeActionsScript, IDAOPermissions} from "./SafeActions.s.sol";
import {IAdmin, ISpp} from "./WireSpp.s.sol";
import {SppInstall} from "./SppInstall.sol";
import {TokenVotingInstall} from "./TokenVotingInstall.sol";

/// @dev Minimal view of the DAO's permission oracle, for post-condition assertions.
interface IDAOIsGranted {
    function isGranted(address where, address who, bytes32 permissionId, bytes calldata data)
        external
        view
        returns (bool);
}

/**
 * @title InstallPublicProcess
 * @notice Installs the PUBLIC staged process — a TokenVoting body behind an SPP with a
 *         foundation approval stage — into a DAO that already exists and whose only plugin is
 *         the Admin bootstrap.
 *
 * @dev This is NOT the `DeployInterfoldDao` path. That script creates a DAO with every plugin
 *      installed atomically by the DAOFactory. Here the DAO is live, the DAOFactory is out of
 *      the picture, and each plugin goes in through the PluginSetupProcessor in two halves:
 *
 *        prepareInstallation  — permissionless. Deploys the plugin proxy and RECORDS a prepared
 *                               setup. The DAO is untouched. Emits the plugin address, the
 *                               permission list and the helpers the apply step must quote back.
 *        applyInstallation    — authorises on `msg.sender == dao`, so it must come from the
 *                               Admin bootstrap, and needs the PSP to hold ROOT on the DAO.
 *
 *      THE APPLY AND THE WIRING ARE ONE TRANSACTION, ON PURPOSE. TokenVoting's setup grants
 *      `CREATE_PROPOSAL_PERMISSION` to ANY_ADDR (behind a VotingPowerCondition) and
 *      `EXECUTE_PERMISSION` on the DAO to the plugin itself. Between an apply and a separate
 *      wiring transaction, any FOLD holder could therefore create a proposal on the body and
 *      execute it straight onto the DAO — no SPP, no foundation stage. `emitApplyAndWire`
 *      closes that window by never opening it: the ROOT grant, both applies, the ROOT revoke,
 *      the stage config, the CREATE_PROPOSAL grant, the target config and the EXECUTE revoke
 *      all land in a single `admin.executeProposal`, which either fully succeeds or reverts.
 *
 *      Ordering inside that batch (see `_applyAndWireActions`):
 *        1. grant ROOT on the DAO -> PSP          opens the install window
 *        2. applyInstallation(TokenVoting)        body installed; holds EXECUTE at this instant
 *        3. applyInstallation(SPP public)         SPP installed; also holds EXECUTE
 *        4. revoke ROOT on the DAO from PSP       closes the install window
 *        5. sppPublic.updateStages([...])         stage 0 TokenVoting, stage 1 foundation
 *        6. grant CREATE_PROPOSAL on body -> SPP  only the SPP may open sub-proposals (INV-3)
 *        7. body.setTargetConfig(executor, DelegateCall)  so results report AS the body (INV-5)
 *        8. revoke EXECUTE on the DAO from body   closes the veto bypass (INV-2)
 *
 *      The Admin bootstrap is NOT disarmed here (INV-29 stays deferred, DISARM_ADMIN=false):
 *      the private CRISP process is a later phase that needs it. `make disarm-admin` remains
 *      outstanding and is always its own deliberate action.
 *
 *      Entrypoints, in the order they are used:
 *        deployExecutor()    EOA. Deploys the stateless delegatecall target. No privileges.
 *        emitPrepare()       Two Safe files: prepareInstallation for the body and for the SPP.
 *        emitApplyAndWire()  One Safe file: the atomic batch above, from the prepare receipts.
 *        simulate()          Forks mainnet and runs all of it, asserting the end state.
 */
contract InstallPublicProcessScript is SafeActionsScript {
    bytes32 internal constant ROOT_ID = keccak256("ROOT_PERMISSION");
    bytes32 internal constant EXECUTE_ID = keccak256("EXECUTE_PERMISSION");
    bytes32 internal constant CREATE_PROPOSAL_ID = keccak256("CREATE_PROPOSAL_PERMISSION");

    // --- step 0: the Executor ------------------------------------------------------

    /// @notice Deploys the stateless `Executor` the bodies delegatecall into (INV-5).
    /// @dev Broadcast from an EOA rather than the Safe: the contract holds no state, no owner
    ///      and no permissions, so who deploys it cannot affect what it does. A Safe cannot
    ///      issue a raw creation anyway — `deploySetupViaCreate2()` is the alternative if the
    ///      address must be deterministic and pre-verifiable.
    function deployExecutor() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        Executor executor = new Executor();
        vm.stopBroadcast();

        console2.log("=== Executor deployed ===");
        console2.log("EXECUTOR_ADDRESS=%s", address(executor));
        console2.log("Write this into the env file before running emitApplyAndWire().");
    }

    // --- step 1: prepare -----------------------------------------------------------

    /// @notice Emits the two `prepareInstallation` calls as direct Safe transactions.
    /// @dev Direct, not wrapped in the Admin bootstrap: `prepareInstallation` is permissionless
    ///      and changes nothing the DAO owns, so there is no reason to spend the bootstrap on
    ///      it. Sign and execute them one at a time — each receipt carries the
    ///      `InstallationPrepared` event whose values `emitApplyAndWire` needs, and those
    ///      values cannot be predicted ahead of the transaction.
    function emitPrepare() external {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");

        _emitDirect(
            "20-prepare-token-voting",
            "Prepare installation of the TokenVoting body",
            "Permissionless. Deploys the TokenVoting proxy against the existing FOLD token and "
            "records a prepared setup; the DAO is unchanged. Read InstallationPrepared from the "
            "receipt with `make read-prepared PLUGIN_PREFIX=TOKEN_VOTING`.",
            psp,
            abi.encodeCall(
                PluginSetupProcessor.prepareInstallation,
                (dao, PluginSetupProcessor.PrepareInstallationParams(_tokenVotingRef(), tokenVotingInstallData()))
            )
        );

        _emitDirect(
            "21-prepare-spp-public",
            "Prepare installation of the public SPP",
            "Permissionless. Deploys the SPP proxy with EMPTY stages - the body address is only "
            "known once the TokenVoting prepare has run, so stages are set in the apply batch. "
            "An SPP with no stages rejects createProposal, so the empty state is inert.",
            psp,
            abi.encodeCall(
                PluginSetupProcessor.prepareInstallation,
                (dao, PluginSetupProcessor.PrepareInstallationParams(_sppRef(), SppInstall.encode()))
            )
        );
    }

    // --- step 2: apply + wire, atomically ------------------------------------------

    /// @notice Emits the single atomic Safe transaction that installs and wires both plugins.
    /// @dev Reads the prepared values from `TOKEN_VOTING_*` / `SPP_PUBLIC_*` in the env, as
    ///      written by `make read-prepared`. The PSP re-derives the setup id from them and
    ///      reverts on any mismatch, so a transcription error fails on chain rather than
    ///      installing something else.
    function emitApplyAndWire() external {
        Action[] memory actions = _applyAndWireActions();

        _emitActions(
            "22-install-and-wire-public-process",
            "Install and wire the public process (TokenVoting + SPP)",
            "ATOMIC BY DESIGN. Opens the PSP's ROOT window, applies both prepared installs, "
            "closes the window, then sets the SPP stages, grants the SPP sole CREATE_PROPOSAL on "
            "the body, points the body at the Executor, and revokes the body's EXECUTE on the "
            "DAO. Splitting this would leave a window in which any FOLD holder could execute on "
            "the DAO directly, bypassing the foundation stage. Does NOT disarm the Admin.",
            actions
        );
    }

    // --- changing the stage config after the fact -----------------------------------

    /// @notice Emits `sppPublic.updateStages(...)` for the timings currently in the env — the way
    ///         the stage-0 window, the stage-1 approval deadline or the stage-1 mode are changed
    ///         after install.
    /// @dev The public-only counterpart to `WireSpp.printUpdateStages()`, which reads
    ///      `CRISP_VOTING_PLUGIN_ADDRESS` and so reverts on a DAO with no private process.
    ///
    ///      Two ways to land it, and which one applies depends on whether the bootstrap is armed:
    ///        armed    — sign this Safe file; it executes immediately, no vote.
    ///        disarmed — the `to`/`data` printed alongside is the action to put in a governance
    ///                   proposal, which then runs through the very process it is editing.
    ///
    ///      In-flight proposals are NOT affected: the SPP snapshots `stageConfigIndex` at creation
    ///      and `updateStages` writes a new config, so anything already open keeps the rules it
    ///      was created under. Proven by `simulateStageChange()`.
    function emitUpdateStages() external {
        address sppPublic = vm.envAddress("SPP_PUBLIC_ADDRESS");
        address tokenVoting = vm.envAddress("TOKEN_VOTING_PLUGIN_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");

        _emit(
            "40-update-public-stages",
            "Update the public SPP stage configuration",
            "Rewrites the stage-0 voting window and the stage-1 approval deadline from the current "
            "env values. Applies to proposals created AFTER this lands; in-flight ones keep the "
            "config they were created under.",
            sppPublic,
            abi.encodeCall(ISpp.updateStages, (stagesFor(tokenVoting, foundation, false)))
        );
    }

    // --- dry run: every transaction the Safe signs, in order ------------------------

    /// @notice Prints all three Safe transactions on a mainnet fork, executing each as it goes.
    /// @dev Transactions 1 and 2 are FINAL — `prepareInstallation` calldata depends only on the
    ///      DAO, the repo tag and the install settings, so the bytes printed here are the bytes to
    ///      sign. Transaction 3 is SHAPE-ONLY: it quotes the plugin addresses, permission set and
    ///      helpers hash that this fork's prepare produced, and the real ones will differ because
    ///      the proxies are deployed with CREATE from the setup contract. Regenerate it with
    ///      `make safe-install-public` once the two prepares have executed for real.
    function dryRun() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");
        address safe = adminDriver();
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");

        console2.log("=== DRY RUN on a mainnet fork at block %s ===", block.number);
        console2.log("DAO:            %s", dao);
        console2.log("Safe (signer):  %s", safe);
        console2.log("Admin plugin:   %s", adminPlugin);
        console2.log("");

        // --- TX 1 + 2: prepareInstallation. Final bytes; the Safe calls the PSP directly. ---
        bytes memory tvPrepare = abi.encodeCall(
            PluginSetupProcessor.prepareInstallation,
            (dao, PluginSetupProcessor.PrepareInstallationParams(_tokenVotingRef(), tokenVotingInstallData()))
        );
        bytes memory sppPrepare = abi.encodeCall(
            PluginSetupProcessor.prepareInstallation,
            (dao, PluginSetupProcessor.PrepareInstallationParams(_sppRef(), SppInstall.encode()))
        );

        console2.log("--- TX 1 of 3  (FINAL - sign this) ------------------------------");
        console2.log("  what:  prepareInstallation, TokenVoting body");
        console2.log("  from:  %s   (the Safe, direct - no Admin wrapper)", safe);
        console2.log("  to:    %s", psp);
        console2.log("  value: 0");
        console2.log("  data:");
        console2.logBytes(tvPrepare);
        console2.log("");

        console2.log("--- TX 2 of 3  (FINAL - sign this) ------------------------------");
        console2.log("  what:  prepareInstallation, public SPP (empty stages)");
        console2.log("  from:  %s   (the Safe, direct - no Admin wrapper)", safe);
        console2.log("  to:    %s", psp);
        console2.log("  value: 0");
        console2.log("  data:");
        console2.logBytes(sppPrepare);
        console2.log("");

        // Execute them so TX 3 can be built on their real output.
        if (vm.envOr("EXECUTOR_ADDRESS", address(0)) == address(0)) {
            vm.setEnv("EXECUTOR_ADDRESS", vm.toString(address(new Executor())));
            console2.log("NOTE: EXECUTOR_ADDRESS was empty - a throwaway one was deployed for this");
            console2.log("      run. Deploy the real one with `make deploy-executor` first.");
            console2.log("");
        }

        vm.startPrank(safe);
        IPluginSetup.PreparedSetupData memory tvData;
        IPluginSetup.PreparedSetupData memory sppData;
        address tokenVoting;
        address sppPublic;
        (tokenVoting, tvData) = PluginSetupProcessor(psp)
            .prepareInstallation(
                dao, PluginSetupProcessor.PrepareInstallationParams(_tokenVotingRef(), tokenVotingInstallData())
            );
        (sppPublic, sppData) = PluginSetupProcessor(psp)
            .prepareInstallation(dao, PluginSetupProcessor.PrepareInstallationParams(_sppRef(), SppInstall.encode()));
        vm.stopPrank();

        vm.setEnv("TOKEN_VOTING_PLUGIN_ADDRESS", vm.toString(tokenVoting));
        vm.setEnv("SPP_PUBLIC_ADDRESS", vm.toString(sppPublic));

        // --- TX 3: the atomic apply + wire. ---
        Action[] memory actions = _buildApplyAndWire(
            dao,
            psp,
            tokenVoting,
            sppPublic,
            _prepared(_tokenVotingRef(), tokenVoting, tvData),
            _prepared(_sppRef(), sppPublic, sppData)
        );

        console2.log("--- TX 3 of 3  (SHAPE ONLY - regenerate after TX 1+2 land) ------");
        console2.log("  what:  apply BOTH installs + wire, as ONE atomic Admin proposal");
        console2.log("  from:  %s", safe);
        console2.log("  to:    %s   (the Admin plugin)", adminPlugin);
        console2.log("  value: 0");
        console2.log("  inner actions, in order:");
        for (uint256 i = 0; i < actions.length; i++) {
            console2.log("    %s. to %s", i + 1, actions[i].to);
        }
        console2.log("");
        console2.log("  fork-prepared addresses quoted inside (WILL DIFFER on mainnet):");
        console2.log("    TokenVoting: %s", tokenVoting);
        console2.log("    SPP public:  %s", sppPublic);
        console2.log("  data:");
        console2.logBytes(abi.encodeCall(IAdmin.executeProposal, (bytes("ipfs://install-public-process"), actions, 0)));
        console2.log("");

        // Prove the batch actually lands.
        vm.prank(safe);
        IAdmin(adminPlugin).executeProposal(bytes("ipfs://install-public-process"), actions, 0);

        IDAOIsGranted d = IDAOIsGranted(dao);
        require(d.isGranted(dao, sppPublic, EXECUTE_ID, ""), "SPP lacks EXECUTE");
        require(!d.isGranted(dao, tokenVoting, EXECUTE_ID, ""), "INV-2 violated");
        require(!d.isGranted(dao, psp, ROOT_ID, ""), "PSP kept ROOT");

        console2.log("=== TX 3 executed on the fork; end state verified ===");
    }

    // --- step 3: verification -------------------------------------------------------

    /// @notice Forks mainnet and runs the whole sequence, asserting the resulting permissions.
    /// @dev The prepared values are unpredictable, so this cannot verify the exact bytes the
    ///      Safe will sign — it verifies the SHAPE: that the encodings decode, that nothing
    ///      reverts, and that the end state matches the invariants. Run it before signing, and
    ///      again against the real prepared values once both prepares have executed.
    function simulate() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");
        address safe = adminDriver();
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");

        console2.log("=== Simulating on a mainnet fork at block %s ===", block.number);

        // The Executor is a plain deployment; stand one up so the wiring has a target.
        address executor = vm.envOr("EXECUTOR_ADDRESS", address(0));
        if (executor == address(0)) {
            executor = address(new Executor());
            vm.setEnv("EXECUTOR_ADDRESS", vm.toString(executor));
            console2.log("EXECUTOR_ADDRESS was empty - simulated one at %s", executor);
        }

        // --- prepare, exactly as the two Safe transactions will ---
        vm.startPrank(safe);
        (address tokenVoting, IPluginSetup.PreparedSetupData memory tvData) = PluginSetupProcessor(psp)
            .prepareInstallation(
                dao, PluginSetupProcessor.PrepareInstallationParams(_tokenVotingRef(), tokenVotingInstallData())
            );
        (address sppPublic, IPluginSetup.PreparedSetupData memory sppData) = PluginSetupProcessor(psp)
            .prepareInstallation(dao, PluginSetupProcessor.PrepareInstallationParams(_sppRef(), SppInstall.encode()));
        vm.stopPrank();

        console2.log("prepared TokenVoting: %s", tokenVoting);
        console2.log("prepared SPP public:  %s", sppPublic);
        _logPermissions("TokenVoting", tvData.permissions);
        _logPermissions("SPP public", sppData.permissions);

        // The body must use FOLD ITSELF. If TokenVotingSetup had not recognised FOLD as IVotes
        // it would have silently cloned a GovernanceWrappedERC20 wrapper instead, and every
        // holder would have to wrap their tokens before they could vote.
        address votingToken = ITokenVotingView(tokenVoting).getVotingToken();
        require(votingToken == fold, "TokenVoting is not using FOLD - the setup wrapped it");

        // Feed the simulated prepare results back in so the action builder runs on them.
        vm.setEnv("TOKEN_VOTING_PLUGIN_ADDRESS", vm.toString(tokenVoting));
        vm.setEnv("SPP_PUBLIC_ADDRESS", vm.toString(sppPublic));
        vm.setEnv("SPP_PUBLIC_PLUGIN_ADDRESS", vm.toString(sppPublic));

        Action[] memory actions = _buildApplyAndWire(
            dao,
            psp,
            tokenVoting,
            sppPublic,
            _prepared(_tokenVotingRef(), tokenVoting, tvData),
            _prepared(_sppRef(), sppPublic, sppData)
        );

        // --- the single Safe transaction ---
        vm.prank(safe);
        IAdmin(adminPlugin).executeProposal(bytes("ipfs://simulate"), actions, 0);

        // --- post-conditions ---
        IDAOIsGranted d = IDAOIsGranted(dao);
        bytes memory empty = "";

        require(d.isGranted(dao, sppPublic, EXECUTE_ID, empty), "SPP must hold EXECUTE on the DAO");
        // INV-2: the body must NOT be able to execute on the DAO, or stage 1 is skippable.
        require(!d.isGranted(dao, tokenVoting, EXECUTE_ID, empty), "INV-2: body still holds EXECUTE");
        // INV-3/INV-1: only the SPP opens sub-proposals on the body.
        require(d.isGranted(tokenVoting, sppPublic, CREATE_PROPOSAL_ID, empty), "SPP cannot create on the body");
        // The install window must be shut again.
        require(!d.isGranted(dao, psp, ROOT_ID, empty), "PSP still holds ROOT on the DAO");
        // The bootstrap is deliberately left armed for the private phase (DISARM_ADMIN=false).
        require(d.isGranted(dao, adminPlugin, EXECUTE_ID, empty), "Admin bootstrap unexpectedly disarmed");

        console2.log("");
        console2.log("=== Simulation passed ===");
        console2.log("  SPP holds EXECUTE on the DAO:        yes");
        console2.log("  TokenVoting holds EXECUTE on the DAO: no  (INV-2)");
        console2.log("  SPP may create on TokenVoting:        yes (INV-3)");
        console2.log("  PSP holds ROOT on the DAO:            no");
        console2.log("  Admin bootstrap still armed:          yes (INV-29 deferred)");
        console2.log("  TokenVoting voting token:             %s (FOLD, unwrapped)", votingToken);

        _assertSettings(tokenVoting);
    }

    /// @dev Reads the settings back off the INSTALLED plugin and checks them against the env.
    ///      Closes the loop on the whole encode -> prepare -> apply path: a field silently landing
    ///      in the wrong slot of the install tuple would show up here as a wrong number, not as a
    ///      revert.
    function _assertSettings(address tokenVoting) internal view {
        ITokenVotingView tv = ITokenVotingView(tokenVoting);

        uint32 support = uint32(vm.envOr("TV_SUPPORT_THRESHOLD", uint256(510_000)));
        uint32 participation = uint32(vm.envOr("TV_MIN_PARTICIPATION", uint256(50_000)));
        uint64 duration = uint64(vm.envOr("TV_MIN_DURATION", uint256(432_000)));
        uint256 proposerPower = vm.envOr("TV_MIN_PROPOSER_VOTING_POWER", uint256(0));

        require(tv.supportThreshold() == support, "supportThreshold mismatch");
        require(tv.minParticipation() == participation, "minParticipation mismatch");
        require(tv.minDuration() == duration, "minDuration mismatch");
        require(tv.minProposerVotingPower() == proposerPower, "minProposerVotingPower mismatch");

        // What the quorum actually costs in tokens, at today's supply.
        uint256 supply = tv.totalVotingPower(block.timestamp - 1);
        console2.log("");
        console2.log("  settings read back off the installed plugin:");
        console2.log("    supportThreshold:  %s ppm", support);
        console2.log("    minParticipation:  %s ppm", participation);
        console2.log("    minDuration:       %s seconds", duration);
        console2.log("    total voting power:%s", supply);
        console2.log("    quorum needs:      %s FOLD (wei)", (supply * participation) / 1_000_000);
    }

    /// @notice Forks mainnet, installs the process, then drives a real proposal through it:
    ///         create on the SPP -> vote on the body -> advance -> foundation approves ->
    ///         execute on the DAO.
    /// @dev This is the check the permission assertions cannot make. In particular it proves the
    ///      5-day timing is self-consistent: the SPP creates the stage-0 sub-proposal for exactly
    ///      `SPP_PUBLIC_VOTE_DURATION`, and TokenVoting rejects any window shorter than its own
    ///      `minDuration`. Setting the two equal is only safe if the comparison is inclusive —
    ///      if it were strict, every single proposal would revert at creation, and it would fail
    ///      here rather than on mainnet.
    function simulateGovernance() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        uint64 voteDuration = uint64(vm.envOr("SPP_PUBLIC_VOTE_DURATION", uint256(432_000)));

        (address tokenVoting, address sppPublic) = _installOnFork();

        // REAL FOLD holders, delegating to themselves. Deliberately not `deal`: stdstore picks
        // the balance slot by probing, and on this token it wrote into a total-supply checkpoint
        // instead — `getPastTotalSupply` came back as 25x the real supply, which silently moved
        // the quorum bar. Real holders keep the 373.86M denominator honest, which is the whole
        // point of simulating the quorum at all.
        address[] memory voters = _simulationVoters();
        uint256 votingPower;
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            IVotesLite(fold).delegate(voters[i]);
            votingPower += IERC20Supply(fold).balanceOf(voters[i]);
        }
        vm.warp(block.timestamp + 1); // checkpoints are timestamp-keyed (INV-19); let them settle

        uint256 quorum =
            (IERC20Supply(fold).totalSupply() * vm.envOr("TV_MIN_PARTICIPATION", uint256(100_000))) / 1_000_000;
        console2.log("delegated for the simulation: %s", votingPower);
        console2.log("quorum requires:              %s", quorum);
        require(votingPower > quorum, "simulation voters cannot reach quorum - pick bigger holders");

        // --- create on the SPP, never on the body (INV-1) ---
        // The action rewrites the DAO's own daoURI. Chosen because it has a public getter, so
        // "did the SPP actually execute on the DAO" is observable rather than inferred from a flag.
        string memory newUri = "ipfs://executed-by-the-public-process";
        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: dao, value: 0, data: abi.encodeCall(IDAOUri.setDaoURI, (newUri))});

        bytes[][] memory proposalParams = new bytes[][](2);
        proposalParams[0] = new bytes[](1);
        // TokenVoting's customProposalParams: (uint256 allowFailureMap, uint8 voteOption, bool tryEarlyExecution)
        proposalParams[0][0] = abi.encode(uint256(0), uint8(0), false);
        proposalParams[1] = new bytes[](0); // stage 1 is the manual foundation body

        // Proposal ids are hash-derived in OSx 1.4, not sequential, so the sub-proposal id is
        // taken from the event the body emitted rather than guessed from a counter.
        vm.recordLogs();
        vm.prank(voters[0]);
        uint256 proposalId = ISppFlow(sppPublic).createProposal(bytes("ipfs://test"), actions, 0, 0, proposalParams);
        uint256 subId = _subProposalId(tokenVoting);
        console2.log("SPP proposal:  %s", proposalId);
        console2.log("sub-proposal on the body: %s", subId);

        // The sub-proposal on the body is created for exactly the stage window.
        (,, ITokenVotingFlow.ProposalParameters memory params,,,,) = ITokenVotingFlow(tokenVoting).getProposal(subId);
        require(params.endDate - params.startDate == voteDuration, "sub-proposal window != stage voteDuration");
        console2.log("stage-0 sub-proposal window: %s seconds", params.endDate - params.startDate);

        // --- vote yes ---
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            // MajorityVotingBase.VoteOption is {None, Abstain, Yes, No} - Yes is 2, NOT 1.
            ITokenVotingFlow(tokenVoting).vote(subId, 2, false);
        }

        // INV-8: while the vote is open the SPP must NOT advance, even though the yes-tally has
        // already passed both thresholds. minAdvance == voteDuration is what enforces this.
        vm.warp(block.timestamp + voteDuration / 2);
        require(!ISppFlow(sppPublic).canProposalAdvance(proposalId), "INV-8: advanced on an early tally");
        console2.log("halfway through the window, canProposalAdvance == false (INV-8 holds)");

        // --- close the window and advance to stage 1 ---
        vm.warp(block.timestamp + voteDuration / 2 + 1);
        {
            (,,, ITokenVotingFlow.Tally memory t,,,) = ITokenVotingFlow(tokenVoting).getProposal(subId);
            console2.log("final tally - yes: %s", t.yes);
            console2.log("              no:  %s", t.no);
            console2.log("         abstain:  %s", t.abstain);
        }
        require(ITokenVotingFlow(tokenVoting).hasSucceeded(subId), "body vote did not succeed");
        require(ISppFlow(sppPublic).canProposalAdvance(proposalId), "stage 0 will not advance");
        ISppFlow(sppPublic).advanceProposal(proposalId);
        console2.log("advanced to stage 1 (foundation approval)");

        // --- approval mode: silence is NOT consent, the foundation must report ---
        require(!ISppFlow(sppPublic).canProposalAdvance(proposalId), "advanced without foundation approval");

        vm.prank(foundation);
        ISppFlow(sppPublic).reportProposalResult(proposalId, 1, 1, false); // stage 1, Approval

        // minAdvance == 0 in approval mode: executable the instant the approval lands.
        require(ISppFlow(sppPublic).canProposalAdvance(proposalId), "approval did not make it advanceable");
        console2.log("foundation approved; immediately advanceable (minAdvance == 0)");

        ISppFlow(sppPublic).advanceProposal(proposalId);
        require(
            keccak256(bytes(IDAOUri(dao).daoURI())) == keccak256(bytes(newUri)), "the action never landed on the DAO"
        );

        console2.log("");
        console2.log("=== Governance flow passed ===");
        console2.log("  created on the SPP, sub-proposal on the body   (INV-1)");
        console2.log("  no early advance mid-window                    (INV-8)");
        console2.log("  stage 1 held until the foundation approved     (approval mode)");
        console2.log("  executed on the DAO through the SPP            (INV-2)");
    }

    /// @notice Forks mainnet, installs, then changes the stage-1 approval deadline and proves an
    ///         already-open proposal is unaffected.
    /// @dev Answers two questions that matter before committing to a number: can the deadline be
    ///      changed at all after install, and does changing it disturb proposals already in
    ///      flight. The second is the one worth checking — a config change that retroactively
    ///      shortened a live proposal's window could expire it out from under its voters.
    function simulateStageChange() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");

        (address tokenVoting, address sppPublic) = _installOnFork();

        // The DAO must hold UPDATE_STAGES on the SPP, or the config is frozen forever.
        require(
            IDAOIsGranted(dao).isGranted(sppPublic, dao, keccak256("UPDATE_STAGES_PERMISSION"), ""),
            "the DAO cannot update stages - the config would be immutable"
        );

        uint16 indexBefore = ISppStages(sppPublic).getCurrentConfigIndex();
        uint64 deadlineBefore = ISppStages(sppPublic).getStages(indexBefore)[1].maxAdvance;
        console2.log("stage-1 maxAdvance at install: %s seconds", deadlineBefore);

        // Open a proposal under the CURRENT config, so it can be checked afterwards.
        address[] memory voters = _simulationVoters();
        bytes[][] memory proposalParams = new bytes[][](2);
        proposalParams[0] = new bytes[](1);
        proposalParams[0][0] = abi.encode(uint256(0), uint8(0), false);
        proposalParams[1] = new bytes[](0);

        vm.prank(voters[0]);
        uint256 inFlight =
            ISppFlow(sppPublic).createProposal(bytes("ipfs://in-flight"), new Action[](0), 0, 0, proposalParams);

        // --- the change itself: shorten the stage-1 deadline from 30 days to 10 ---
        vm.setEnv("SPP_VETO_DURATION", "172800"); // 2 days
        vm.setEnv("SPP_EXECUTE_WINDOW", "691200"); // 8 days  => 10-day maxAdvance

        Action[] memory actions = new Action[](1);
        actions[0] = Action({
            to: sppPublic,
            value: 0,
            data: abi.encodeCall(ISpp.updateStages, (stagesFor(tokenVoting, foundation, false)))
        });

        vm.prank(adminDriver());
        IAdmin(adminPlugin).executeProposal(bytes("ipfs://retime"), actions, 0);

        uint16 indexAfter = ISppStages(sppPublic).getCurrentConfigIndex();
        uint64 deadlineAfter = ISppStages(sppPublic).getStages(indexAfter)[1].maxAdvance;

        require(indexAfter == indexBefore + 1, "updateStages did not write a new config");
        require(deadlineAfter == 10 days, "stage-1 deadline did not change");

        // The in-flight proposal must still point at the OLD config.
        uint16 inFlightConfig = ISppStages(sppPublic).getProposal(inFlight).stageConfigIndex;
        require(inFlightConfig == indexBefore, "an open proposal was retimed underneath its voters");

        console2.log("");
        console2.log("=== Stage change passed ===");
        console2.log("  config index: %s -> %s", indexBefore, indexAfter);
        console2.log("  stage-1 maxAdvance: %s -> %s seconds", deadlineBefore, deadlineAfter);
        console2.log("  in-flight proposal still on config %s (unchanged)", inFlightConfig);
    }

    /// @notice Forks mainnet and interrogates the stage-1 approval: who may execute once the
    ///         foundation has approved, for how long that approval stays live, and whether it can
    ///         be taken back.
    /// @dev `advanceProposal` on the LAST stage is not open to the world — it checks
    ///      `EXECUTE_PROPOSAL_PERMISSION` on the SPP. Whether that amounts to "anyone" depends on
    ///      who the SPP's setup granted it to, which is what this measures rather than assumes.
    function simulateApprovalWindow() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address foundation = vm.envAddress("FOUNDATION_ADDRESS");
        uint64 voteDuration = uint64(vm.envOr("SPP_PUBLIC_VOTE_DURATION", uint256(432_000)));

        (address tokenVoting, address sppPublic) = _installOnFork();

        // Who is allowed to press execute on the final stage?
        address bystander = address(uint160(uint256(keccak256("interfold.random.bystander"))));
        bool anyoneMayExecute = ISppPerms(sppPublic).hasExecutePermission(bystander);
        console2.log("an unrelated address may execute the final stage: %s", anyoneMayExecute);

        // Get a proposal to stage 1 with a passing vote.
        uint256 proposalId = _proposalThroughStageZero(dao, tokenVoting, sppPublic, voteDuration);

        // Nothing may advance until the foundation speaks (approval mode).
        require(!ISppFlow(sppPublic).canProposalAdvance(proposalId), "advanceable before any approval");

        uint64 stage1Entered = uint64(block.timestamp);
        vm.prank(foundation);
        ISppFlow(sppPublic).reportProposalResult(proposalId, 1, 1, false); // Approval
        require(ISppFlow(sppPublic).canProposalAdvance(proposalId), "approval did not arm execution");

        uint64 deadline = ISppStages(sppPublic).getStages(ISppStages(sppPublic).getCurrentConfigIndex())[1].maxAdvance;
        console2.log("stage-1 maxAdvance: %s seconds from stage entry", deadline);

        // --- branch A: does the approval stay live for the whole window? ---
        uint256 snap = vm.snapshotState();
        vm.warp(stage1Entered + deadline - 60); // one minute before expiry
        require(ISppFlow(sppPublic).canProposalAdvance(proposalId), "approval went stale before the deadline");
        vm.prank(bystander);
        ISppFlow(sppPublic).advanceProposal(proposalId);
        require(
            keccak256(bytes(IDAOUri(dao).daoURI())) == keccak256(bytes(_SIM_URI)),
            "a bystander could not execute an approved proposal"
        );
        console2.log("executed by an unrelated address at deadline - 60s");
        vm.revertToState(snap);

        // --- branch B: what happens past the deadline? ---
        snap = vm.snapshotState();
        vm.warp(stage1Entered + deadline + 1);
        require(!ISppFlow(sppPublic).canProposalAdvance(proposalId), "still advanceable past maxAdvance");
        console2.log("past maxAdvance the approval lapses - the proposal expires");
        vm.revertToState(snap);

        // --- branch C: can the foundation take the approval back? ---
        // `_processProposalResult` is a plain overwrite of bodyResults[id][stage][sender], so
        // re-reporting replaces the earlier result for as long as the proposal is unexecuted.
        vm.prank(foundation);
        ISppFlow(sppPublic).reportProposalResult(proposalId, 1, 0, false); // back to None
        require(!ISppFlow(sppPublic).canProposalAdvance(proposalId), "approval could not be withdrawn");
        console2.log("the foundation withdrew its approval - no longer advanceable");

        console2.log("");
        console2.log("=== Approval window ===");
        console2.log("  execution open to any address:      %s", anyoneMayExecute);
        console2.log("  approval stays live until:          stage entry + %s seconds", deadline);
        console2.log("  withdrawable while unexecuted:      yes");
    }

    /// @notice Forks mainnet and exercises the path that actually uses the Executor: the BODY
    ///         executing its own sub-proposal, which reports the result back to the SPP.
    /// @dev INV-5. A stage-0 sub-proposal's only action is a `reportProposalResult` callback on
    ///      the SPP, and the SPP credits the result to `msg.sender`. The body must therefore
    ///      arrive as itself, which is why its target config is `DelegateCall` into a stateless
    ///      Executor rather than a normal call.
    ///
    ///      `simulateGovernance` does NOT cover this: it advances stage 0 by calling
    ///      `advanceProposal` on the SPP, which reads `hasSucceeded()` off the body and never
    ///      makes the body execute anything. Both paths exist in production, so both need
    ///      checking — and only this one can catch a wrong EXECUTOR_ADDRESS.
    function simulateBodyExecution() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address dao = vm.envAddress("DAO_ADDRESS");
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        uint64 voteDuration = uint64(vm.envOr("SPP_PUBLIC_VOTE_DURATION", uint256(432_000)));

        (address tokenVoting, address sppPublic) = _installOnFork();
        console2.log("executor in use: %s", vm.envAddress("EXECUTOR_ADDRESS"));

        address[] memory voters = _simulationVoters();
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            IVotesLite(fold).delegate(voters[i]);
        }
        vm.warp(block.timestamp + 1);

        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: dao, value: 0, data: abi.encodeCall(IDAOUri.setDaoURI, (_SIM_URI))});

        bytes[][] memory proposalParams = new bytes[][](2);
        proposalParams[0] = new bytes[](1);
        proposalParams[0][0] = abi.encode(uint256(0), uint8(0), false);
        proposalParams[1] = new bytes[](0);

        vm.recordLogs();
        vm.prank(voters[0]);
        uint256 proposalId =
            ISppFlow(sppPublic).createProposal(bytes("ipfs://body-exec"), actions, 0, 0, proposalParams);
        uint256 subId = _subProposalId(tokenVoting);

        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            ITokenVotingFlow(tokenVoting).vote(subId, 2, false);
        }
        vm.warp(block.timestamp + voteDuration + 1);

        require(ISppStages(sppPublic).getProposal(proposalId).currentStage == 0, "not at stage 0");

        // THE PATH UNDER TEST: execute the sub-proposal ON THE BODY. Its action delegatecalls the
        // Executor, which forwards `reportProposalResult` to the SPP with the body as msg.sender.
        ITokenVotingFlow(tokenVoting).execute(subId);

        uint16 stageAfter = ISppStages(sppPublic).getProposal(proposalId).currentStage;
        require(stageAfter == 1, "body execution did not report a result the SPP accepted (INV-5)");

        console2.log("");
        console2.log("=== Body execution passed (INV-5) ===");
        console2.log("  the body executed its sub-proposal and the SPP credited the result");
        console2.log("  proposal advanced to stage %s", stageAfter);
    }

    /// @notice Forks mainnet and raises the quorum WHILE a proposal is open, to establish which
    ///         threshold that proposal settles at.
    /// @dev The answer is the OLD one, and the mechanism is worth knowing: TokenVoting does not
    ///      store `minParticipation` per proposal. At creation it computes
    ///      `minVotingPower = minParticipation x totalVotingPower(snapshot)` and freezes that
    ///      ABSOLUTE token amount in `ProposalParameters`. `isMinParticipationReached` compares
    ///      the tally against that stored number and never re-reads the setting — so a later
    ///      `updateVotingSettings` cannot reach backwards into an open proposal.
    ///
    ///      Proven behaviourally, not by reading a field: the proposal is carried by turnout that
    ///      clears the OLD quorum but not the NEW one. If the new setting applied, it would fail.
    function simulateQuorumChangeMidFlight() external {
        vm.createSelectFork(vm.envString("RPC_URL"));

        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");
        uint64 voteDuration = uint64(vm.envOr("SPP_PUBLIC_VOTE_DURATION", uint256(432_000)));

        (address tokenVoting, address sppPublic) = _installOnFork();

        // ONE voter, deliberately: enough for a 5% quorum, not enough for 10%.
        address[] memory all = _simulationVoters();
        address voter = all[0];
        vm.prank(voter);
        IVotesLite(fold).delegate(voter);
        vm.warp(block.timestamp + 1);

        bytes[][] memory proposalParams = new bytes[][](2);
        proposalParams[0] = new bytes[](1);
        proposalParams[0][0] = abi.encode(uint256(0), uint8(0), false);
        proposalParams[1] = new bytes[](0);

        vm.recordLogs();
        vm.prank(voter);
        uint256 proposalId =
            ISppFlow(sppPublic).createProposal(bytes("ipfs://mid-flight"), new Action[](0), 0, 0, proposalParams);
        uint256 subId = _subProposalId(tokenVoting);

        (,, ITokenVotingFlow.ProposalParameters memory before,,,,) = ITokenVotingFlow(tokenVoting).getProposal(subId);
        uint256 turnout = IERC20Supply(fold).balanceOf(voter);
        console2.log("quorum frozen into the open proposal: %s", before.minVotingPower);
        console2.log("turnout available:                    %s", turnout);

        vm.prank(voter);
        ITokenVotingFlow(tokenVoting).vote(subId, 2, false); // Yes

        // --- raise the quorum to 10% mid-flight, as a second proposal would ---
        Action[] memory actions = new Action[](1);
        actions[0] = Action({
            to: tokenVoting,
            value: 0,
            data: abi.encodeWithSignature(
                "updateVotingSettings((uint8,uint32,uint32,uint64,uint256))",
                uint8(vm.envOr("TV_VOTING_MODE", uint256(2))),
                uint32(vm.envOr("TV_SUPPORT_THRESHOLD", uint256(510_000))),
                uint32(100_000), // 10%, up from 5%
                uint64(vm.envOr("TV_MIN_DURATION", uint256(432_000))),
                uint256(0)
            )
        });
        vm.prank(adminDriver());
        IAdmin(adminPlugin).executeProposal(bytes("ipfs://raise-quorum"), actions, 0);

        require(ITokenVotingView(tokenVoting).minParticipation() == 100_000, "the setting did not change");

        // The open proposal's frozen quorum must be untouched.
        (,, ITokenVotingFlow.ProposalParameters memory afterUpdate,,,,) =
            ITokenVotingFlow(tokenVoting).getProposal(subId);
        require(afterUpdate.minVotingPower == before.minVotingPower, "an open proposal was re-quorumed");

        // Sanity: this turnout is genuinely between the old and new bars, or the test proves nothing.
        uint256 newBar = (ITokenVotingView(tokenVoting).totalVotingPower(before.snapshotTimepoint) * 100_000) / 1e6;
        require(turnout >= before.minVotingPower, "turnout below the OLD quorum - inconclusive");
        require(turnout < newBar, "turnout also clears the NEW quorum - inconclusive");

        vm.warp(block.timestamp + voteDuration + 1);
        require(ITokenVotingFlow(tokenVoting).hasSucceeded(subId), "the open proposal was retroactively failed");
        require(ISppFlow(sppPublic).canProposalAdvance(proposalId), "SPP will not advance the passed proposal");

        // A proposal created AFTER the change gets the new, higher bar.
        vm.recordLogs();
        vm.prank(voter);
        ISppFlow(sppPublic).createProposal(bytes("ipfs://after"), new Action[](0), 0, 0, proposalParams);
        uint256 newSubId = _subProposalId(tokenVoting);
        (,, ITokenVotingFlow.ProposalParameters memory fresh,,,,) = ITokenVotingFlow(tokenVoting).getProposal(newSubId);
        require(fresh.minVotingPower > before.minVotingPower, "a new proposal did not pick up the new quorum");

        console2.log("");
        console2.log("=== Mid-flight quorum change ===");
        console2.log("  open proposal keeps quorum:   %s  (5%%)", before.minVotingPower);
        console2.log("  new proposal gets quorum:     %s  (10%%)", fresh.minVotingPower);
        console2.log("  open proposal still succeeds: yes - it settles at the OLD bar");
    }

    // --- internals ------------------------------------------------------------------

    string internal constant _SIM_URI = "ipfs://executed-by-the-public-process";

    /// @dev Creates a proposal, votes it through stage 0 and advances it into stage 1.
    function _proposalThroughStageZero(address dao, address tokenVoting, address sppPublic, uint64 voteDuration)
        internal
        returns (uint256 proposalId)
    {
        address fold = vm.envAddress("FOLD_TOKEN_ADDRESS");
        address[] memory voters = _simulationVoters();
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            IVotesLite(fold).delegate(voters[i]);
        }
        vm.warp(block.timestamp + 1);

        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: dao, value: 0, data: abi.encodeCall(IDAOUri.setDaoURI, (_SIM_URI))});

        bytes[][] memory proposalParams = new bytes[][](2);
        proposalParams[0] = new bytes[](1);
        proposalParams[0][0] = abi.encode(uint256(0), uint8(0), false);
        proposalParams[1] = new bytes[](0);

        vm.recordLogs();
        vm.prank(voters[0]);
        proposalId = ISppFlow(sppPublic).createProposal(bytes("ipfs://test"), actions, 0, 0, proposalParams);
        uint256 subId = _subProposalId(tokenVoting);

        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            ITokenVotingFlow(tokenVoting).vote(subId, 2, false); // Yes
        }

        vm.warp(block.timestamp + voteDuration + 1);
        ISppFlow(sppPublic).advanceProposal(proposalId);
    }

    /// @dev Runs the prepare + atomic apply/wire on the current fork and returns the two plugin
    ///      addresses. Shared by both simulations so they exercise the same code path the Safe
    ///      files are generated from.
    function _installOnFork() internal returns (address tokenVoting, address sppPublic) {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");
        address safe = adminDriver();
        address adminPlugin = vm.envAddress("ADMIN_PLUGIN_ADDRESS");

        if (vm.envOr("EXECUTOR_ADDRESS", address(0)) == address(0)) {
            vm.setEnv("EXECUTOR_ADDRESS", vm.toString(address(new Executor())));
        }

        vm.startPrank(safe);
        IPluginSetup.PreparedSetupData memory tvData;
        IPluginSetup.PreparedSetupData memory sppData;
        (tokenVoting, tvData) = PluginSetupProcessor(psp)
            .prepareInstallation(
                dao, PluginSetupProcessor.PrepareInstallationParams(_tokenVotingRef(), tokenVotingInstallData())
            );
        (sppPublic, sppData) = PluginSetupProcessor(psp)
            .prepareInstallation(dao, PluginSetupProcessor.PrepareInstallationParams(_sppRef(), SppInstall.encode()));
        vm.stopPrank();

        vm.setEnv("TOKEN_VOTING_PLUGIN_ADDRESS", vm.toString(tokenVoting));
        vm.setEnv("SPP_PUBLIC_ADDRESS", vm.toString(sppPublic));

        Action[] memory actions = _buildApplyAndWire(
            dao,
            psp,
            tokenVoting,
            sppPublic,
            _prepared(_tokenVotingRef(), tokenVoting, tvData),
            _prepared(_sppRef(), sppPublic, sppData)
        );

        vm.prank(safe);
        IAdmin(adminPlugin).executeProposal(bytes("ipfs://simulate"), actions, 0);
    }

    /// @notice The TokenVoting install payload, from the `TV_*` env settings against FOLD.
    /// @dev Public so it can be printed and diffed against the calldata in the Safe file.
    function tokenVotingInstallData() public view returns (bytes memory) {
        TokenVotingInstall.VotingSettings memory votingSettings = TokenVotingInstall.VotingSettings({
            votingMode: uint8(vm.envOr("TV_VOTING_MODE", uint256(2))),
            // Of the DECISIVE votes: yes/(yes+no) must be strictly greater than this. Abstain
            // is excluded here, so abstaining never counts against a proposal.
            supportThreshold: uint32(vm.envOr("TV_SUPPORT_THRESHOLD", uint256(500_000))),
            // Of TOTAL supply: yes+no+abstain must reach this. Abstain DOES count, which is how
            // a holder helps a vote reach quorum without taking a side.
            minParticipation: uint32(vm.envOr("TV_MIN_PARTICIPATION", uint256(100_000))),
            // Equal to the stage-0 window, so the 5-day vote is enforced by the body too and not
            // only by the SPP's stage config.
            minDuration: uint64(vm.envOr("TV_MIN_DURATION", uint256(432_000))),
            minProposerVotingPower: vm.envOr("TV_MIN_PROPOSER_VOTING_POWER", uint256(0))
        });

        return TokenVotingInstall.encode(
            vm.envAddress("FOLD_TOKEN_ADDRESS"), votingSettings, vm.envOr("TV_MIN_APPROVALS", uint256(0))
        );
    }

    function _tokenVotingRef() internal view returns (PluginSetupRef memory) {
        return PluginSetupRef(
            PluginRepo.Tag(
                uint8(vm.envOr("TOKEN_VOTING_RELEASE", uint256(1))), uint16(vm.envOr("TOKEN_VOTING_BUILD", uint256(4)))
            ),
            PluginRepo(vm.envAddress("TOKEN_VOTING_PLUGIN_REPO"))
        );
    }

    function _sppRef() internal view returns (PluginSetupRef memory) {
        return PluginSetupRef(
            PluginRepo.Tag(uint8(vm.envOr("SPP_RELEASE", uint256(1))), uint16(vm.envOr("SPP_BUILD", uint256(1)))),
            PluginRepo(vm.envAddress("SPP_PLUGIN_REPO"))
        );
    }

    /// @dev Builds the batch from the env-recorded prepare results.
    function _applyAndWireActions() internal view returns (Action[] memory) {
        address dao = vm.envAddress("DAO_ADDRESS");
        address psp = vm.envAddress("PLUGIN_SETUP_PROCESSOR_ADDRESS");

        Prepared memory tv = _loadPrepared("TOKEN_VOTING");
        Prepared memory spp = _loadPrepared("SPP_PUBLIC");

        return _buildApplyAndWire(dao, psp, tv.plugin, spp.plugin, tv, spp);
    }

    /// @dev The action list itself. Split from the env reading so `simulate()` can run it on
    ///      freshly prepared values without a round-trip through the environment.
    function _buildApplyAndWire(
        address dao,
        address psp,
        address tokenVoting,
        address sppPublic,
        Prepared memory tv,
        Prepared memory spp
    ) internal view returns (Action[] memory actions) {
        // `buildWiringActions` reads the body and SPP addresses from the env, so they must be
        // set before this is called; `simulate()` does that with vm.setEnv.
        Action[] memory wiring = buildWiringActions(false, false);

        actions = new Action[](4 + wiring.length);

        // 1. Open the install window. The PSP applies the setup's permission changes AS the
        //    DAO, so it needs ROOT — which was granted and revoked again at DAO creation.
        actions[0] = Action({to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.grant, (dao, psp, ROOT_ID))});
        actions[1] = Action({
            to: psp,
            value: 0,
            data: abi.encodeCall(
                PluginSetupProcessor.applyInstallation,
                (
                    dao,
                    PluginSetupProcessor.ApplyInstallationParams(
                        tv.setupRef, tokenVoting, tv.permissions, tv.helpersHash
                    )
                )
            )
        });
        actions[2] = Action({
            to: psp,
            value: 0,
            data: abi.encodeCall(
                PluginSetupProcessor.applyInstallation,
                (
                    dao,
                    PluginSetupProcessor.ApplyInstallationParams(
                        spp.setupRef, sppPublic, spp.permissions, spp.helpersHash
                    )
                )
            )
        });
        // 4. Shut it again in the same transaction: a PSP left with ROOT can install anything.
        actions[3] = Action({to: dao, value: 0, data: abi.encodeCall(IDAOPermissions.revoke, (dao, psp, ROOT_ID))});

        // 5-8. The wiring, reused verbatim from WireSpp so the staged config cannot drift from
        //      what `WireSppStages.t.sol` asserts (INV-8 .. INV-15).
        for (uint256 i = 0; i < wiring.length; i++) {
            actions[4 + i] = wiring[i];
        }
    }

    function _prepared(PluginSetupRef memory ref, address plugin, IPluginSetup.PreparedSetupData memory data)
        internal
        pure
        returns (Prepared memory p)
    {
        p.plugin = plugin;
        p.setupRef = ref;
        p.permissions = data.permissions;
        p.helpersHash = keccak256(abi.encode(data.helpers));
    }

    /// @dev The holders the governance simulation votes with. Overridable via `SIM_VOTERS` so the
    ///      run can be re-pointed when balances move; the default is the two largest FOLD holders
    ///      at the time this was written, which together clear a 10% quorum.
    function _simulationVoters() internal view returns (address[] memory) {
        address[] memory fallbackVoters = new address[](2);
        fallbackVoters[0] = 0x35e3564C86Bc0b5548a3BE3A9a1E71eB1455FaD2; // 23.20M FOLD
        fallbackVoters[1] = 0x73e9e7cdF65b284E61690aAfC0dAcF41B1277f5e; // 18.56M FOLD

        return vm.envOr("SIM_VOTERS", ",", fallbackVoters);
    }

    /// @dev Pulls the sub-proposal id out of the `ProposalCreated` the body emitted during the
    ///      SPP's create. `proposalId` is the first indexed arg.
    function _subProposalId(address body) internal returns (uint256) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic =
            keccak256("ProposalCreated(uint256,address,uint64,uint64,bytes,(address,uint256,bytes)[],uint256)");

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == body && logs[i].topics.length > 1 && logs[i].topics[0] == topic) {
                return uint256(logs[i].topics[1]);
            }
        }
        revert("no ProposalCreated from the body - the SPP swallowed the sub-proposal creation");
    }

    function _logPermissions(string memory label, PermissionLib.MultiTargetPermission[] memory perms) internal pure {
        console2.log("  %s install grants %s permission(s):", label, perms.length);
        for (uint256 i = 0; i < perms.length; i++) {
            console2.log("    op=%s where=%s who=%s", uint8(perms[i].operation), perms[i].where, perms[i].who);
            if (perms[i].condition != address(0)) {
                console2.log("      condition: %s", perms[i].condition);
            }
        }
    }
}

/// @dev Minimal view of TokenVoting: the voting token, plus the settings read back so the
///      encode -> prepare -> apply round trip can be checked against what was intended.
interface ITokenVotingView {
    function getVotingToken() external view returns (address);
    function supportThreshold() external view returns (uint32);
    function minParticipation() external view returns (uint32);
    function minDuration() external view returns (uint64);
    function minProposerVotingPower() external view returns (uint256);
    function totalVotingPower(uint256 timepoint) external view returns (uint256);
}

/// @dev The DAO's metadata URI — a governed value with a public getter, used by the governance
///      simulation to observe that an executed proposal really reached the DAO.
interface IDAOUri {
    function setDaoURI(string calldata newDaoURI) external;
    function daoURI() external view returns (string memory);
}

interface IERC20Supply {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IVotesLite {
    function delegate(address delegatee) external;
    function getVotes(address account) external view returns (uint256);
}

/// @dev The slice of the SPP the governance simulation drives.
interface ISppFlow {
    function createProposal(
        bytes calldata metadata,
        Action[] calldata actions,
        uint128 allowFailureMap,
        uint64 startDate,
        bytes[][] calldata proposalParams
    ) external returns (uint256 proposalId);
    function advanceProposal(uint256 proposalId) external;
    function canProposalAdvance(uint256 proposalId) external view returns (bool);
    function reportProposalResult(uint256 proposalId, uint16 stageId, uint8 resultType, bool tryAdvance) external;
}

/// @dev The SPP's own view of who may advance or execute a proposal.
interface ISppPerms {
    function hasExecutePermission(address account) external view returns (bool);
    function hasAdvancePermission(address account) external view returns (bool);
}

/// @dev The SPP's stage-config read surface, for asserting what `updateStages` did.
interface ISppStages {
    struct Body {
        address addr;
        bool isManual;
        bool tryAdvance;
        uint8 resultType;
    }

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

    struct TargetConfig {
        address target;
        uint8 operation;
    }

    /// @dev Field-for-field with `StagedProposalProcessor.Proposal`. Only `stageConfigIndex` is
    ///      read, but the whole shape must match or the return data will not decode.
    struct Proposal {
        uint128 allowFailureMap;
        uint64 lastStageTransition;
        uint16 currentStage;
        uint16 stageConfigIndex;
        bool executed;
        bool canceled;
        address creator;
        Action[] actions;
        TargetConfig targetConfig;
    }

    function getCurrentConfigIndex() external view returns (uint16);
    function getStages(uint256 index) external view returns (Stage[] memory);
    function getProposal(uint256 proposalId) external view returns (Proposal memory);
}

/// @dev The slice of TokenVoting the governance simulation drives. `getProposal` returns seven
///      values in OSx 1.4; only `parameters` is read here, but the full arity must match.
interface ITokenVotingFlow {
    struct ProposalParameters {
        uint8 votingMode;
        uint32 supportThreshold;
        uint64 startDate;
        uint64 endDate;
        uint64 snapshotTimepoint;
        uint256 minVotingPower;
    }

    struct Tally {
        uint256 abstain;
        uint256 yes;
        uint256 no;
    }

    struct TargetConfig {
        address target;
        uint8 operation;
    }

    function getProposal(uint256 proposalId)
        external
        view
        returns (
            bool open,
            bool executed,
            ProposalParameters memory parameters,
            Tally memory tally,
            Action[] memory actions,
            uint256 allowFailureMap,
            TargetConfig memory targetConfig
        );
    function vote(uint256 proposalId, uint8 voteOption, bool tryEarlyExecution) external;
    function execute(uint256 proposalId) external;
    function hasSucceeded(uint256 proposalId) external view returns (bool);
}
