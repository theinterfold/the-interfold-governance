// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";

import {SppInstall} from "../script/SppInstall.sol";
import {WireSppScript} from "../script/WireSpp.s.sol";

/// @dev Exposes the script's internal stage builder so the wiring invariants can be asserted
///      without broadcasting. `stagesFor` reads its knobs from the environment, so each test
///      sets the env explicitly rather than depending on the developer's `.env`.
contract WireSppHarness is WireSppScript {
    function stages(address body, address foundation, bool isPrivate)
        external
        view
        returns (SppInstall.Stage[] memory)
    {
        return stagesFor(body, foundation, isPrivate);
    }

    function wiringActions(bool withPrivate, bool shouldDisarmAdmin) external view returns (Action[] memory) {
        return buildWiringActions(withPrivate, shouldDisarmAdmin);
    }
}

/// @notice Guards the stage configuration produced by `WireSpp.stagesFor` — the shape of
///         staged governance itself. These are the invariants documented in AGENTS.md;
///         breaking one silently changes who can execute what, and when.
contract WireSppStagesTest is Test {
    WireSppHarness internal harness;

    address internal constant BODY = address(0xB0D1);
    address internal constant FOUNDATION = address(0xF00D);

    // Distinct sentinels for the wiring-batch assertions.
    address internal constant DAO = address(0xDA0);
    address internal constant TOKEN_VOTING = address(0x7011);
    address internal constant SPP_PUBLIC = address(0x5B0B);
    address internal constant CRISP = address(0xC215);
    address internal constant SPP_PRIVATE = address(0x5B21);
    address internal constant EXECUTOR = address(0xE1EC);
    address internal constant ADMIN = address(0xAD11);

    bytes32 internal constant EXECUTE_PERMISSION = keccak256("EXECUTE_PERMISSION");

    uint64 internal constant PUBLIC_VOTE_DURATION = 7200;
    uint64 internal constant PRIVATE_VOTE_DURATION = 600;
    uint64 internal constant ADVANCE_WINDOW = 7 days;
    uint64 internal constant VETO_DURATION = 2 days;
    uint64 internal constant EXECUTE_WINDOW = 30 days;

    function setUp() public {
        harness = new WireSppHarness();
    }

    function _public() internal view returns (SppInstall.Stage[] memory) {
        return harness.stages(BODY, FOUNDATION, false);
    }

    function _private() internal view returns (SppInstall.Stage[] memory) {
        return harness.stages(BODY, FOUNDATION, true);
    }

    /// @dev Sets the full env baseline. `stagesFor` reads its knobs from the process
    ///      environment, which `vm.setEnv` mutates GLOBALLY — and forge runs tests in
    ///      parallel. Splitting these assertions across test functions therefore races
    ///      (one test's `SPP_STAGE1_MODE=veto` is visible to another mid-run), so every
    ///      env-dependent assertion lives in one sequential test below.
    function _setEnv(string memory stage1Mode, uint256 publicVoteDuration) internal {
        vm.setEnv("SPP_PUBLIC_VOTE_DURATION", vm.toString(publicVoteDuration));
        vm.setEnv("SPP_PRIVATE_VOTE_DURATION", vm.toString(uint256(PRIVATE_VOTE_DURATION)));
        vm.setEnv("SPP_ADVANCE_WINDOW", vm.toString(uint256(ADVANCE_WINDOW)));
        vm.setEnv("SPP_VETO_DURATION", vm.toString(uint256(VETO_DURATION)));
        vm.setEnv("SPP_EXECUTE_WINDOW", vm.toString(uint256(EXECUTE_WINDOW)));
        vm.setEnv("SPP_STAGE1_MODE", stage1Mode);
    }

    /// @notice All stage-configuration invariants, asserted sequentially in one test so the
    ///         shared-env mutation above cannot race. Each assertion names its invariant.
    function test_stageConfigurationInvariants() public {
        _setEnv("approval", PUBLIC_VOTE_DURATION);
        SppInstall.Stage[] memory pub = _public();
        SppInstall.Stage[] memory priv = _private();

        // --- shape ---
        assertEq(pub.length, 2, "public: vote + foundation");
        assertEq(priv.length, 2, "private: vote + foundation");
        assertEq(pub[0].bodies.length, 1, "one voting body");
        assertEq(pub[0].bodies[0].addr, BODY, "stage 0 must be the voting body");
        assertEq(pub[1].bodies.length, 1, "one foundation body");
        assertEq(pub[1].bodies[0].addr, FOUNDATION, "stage 1 must be the foundation");

        // --- INV-8: the public vote is decided on the FINAL tally ---
        // TokenVoting's hasSucceeded() reports an early-reached threshold while the vote is
        // open (Standard mode only blocks early *execution*). minAdvance == voteDuration is
        // the only thing forcing the SPP to wait for the full window.
        assertEq(pub[0].minAdvance, PUBLIC_VOTE_DURATION, "INV-8: public minAdvance MUST equal voteDuration");
        assertEq(pub[0].voteDuration, PUBLIC_VOTE_DURATION, "INV-8: voteDuration");
        assertTrue(pub[0].minAdvance != 0, "INV-8: public minAdvance must never be 0");

        // --- INV-9: the private path is self-limiting ---
        assertEq(priv[0].minAdvance, 0, "INV-9: private minAdvance is 0 by design");

        // --- INV-15: the public window clears TokenVoting's 1h floor ---
        assertGe(pub[0].voteDuration, 1 hours, "INV-15: public window must clear TokenVoting's 1h floor");

        // --- stage 0 approves, never vetoes ---
        assertEq(pub[0].maxAdvance, PUBLIC_VOTE_DURATION + ADVANCE_WINDOW, "maxAdvance = vote + window");
        assertGt(pub[0].maxAdvance, pub[0].minAdvance, "a passed vote must have time to advance");
        assertEq(pub[0].approvalThreshold, 1, "one approval advances stage 0");
        assertEq(pub[0].vetoThreshold, 0, "stage 0 has no veto");
        assertEq(uint8(pub[0].bodies[0].resultType), uint8(SppInstall.ResultType.Approval), "stage 0 resultType");
        assertFalse(pub[0].bodies[0].isManual, "the SPP creates the sub-proposal on the body");
        assertTrue(pub[0].bodies[0].tryAdvance, "a passed sub-proposal auto-advances to stage 1");

        // --- INV-13: the foundation acts manually ---
        assertTrue(pub[1].bodies[0].isManual, "INV-13: the foundation calls reportProposalResult itself");
        assertFalse(pub[1].bodies[0].tryAdvance, "INV-13: must not auto-advance out of the final stage");

        // --- INV-14: proposals are immutable once created ---
        for (uint256 i = 0; i < 2; i++) {
            assertFalse(pub[i].editable, "INV-14: public stages must not be editable");
            assertFalse(pub[i].cancelable, "INV-14: public stages must not be cancelable");
            assertFalse(priv[i].editable, "INV-14: private stages must not be editable");
            assertFalse(priv[i].cancelable, "INV-14: private stages must not be cancelable");
        }

        // --- INV-10: approval mode is opt-in ---
        // vetoThreshold == 0 is exactly what the UI detects the mode by.
        assertEq(pub[1].vetoThreshold, 0, "INV-10: approval mode MUST have vetoThreshold 0");
        assertEq(pub[1].approvalThreshold, 1, "INV-10: one approval is required");
        assertEq(pub[1].voteDuration, 0, "INV-10: no forced hold; executable once approval lands");
        assertEq(uint8(pub[1].bodies[0].resultType), uint8(SppInstall.ResultType.Approval), "INV-10: resultType");
        assertEq(pub[1].maxAdvance, VETO_DURATION + EXECUTE_WINDOW, "INV-10: approval must land before maxAdvance");

        // --- INV-11: veto mode is opt-out and holds for the full window ---
        _setEnv("veto", PUBLIC_VOTE_DURATION);
        SppInstall.Stage[] memory vetoMode = _public();
        assertEq(vetoMode[1].vetoThreshold, 1, "INV-11: veto mode requires a veto threshold");
        assertEq(vetoMode[1].approvalThreshold, 0, "INV-11: no approval is required");
        assertEq(vetoMode[1].voteDuration, VETO_DURATION, "INV-11: must hold for the full veto window");
        assertEq(uint8(vetoMode[1].bodies[0].resultType), uint8(SppInstall.ResultType.Veto), "INV-11: resultType");
        assertTrue(vetoMode[1].voteDuration != 0, "INV-11: a zero veto window would mean no veto at all");

        // --- INV-12: an unrecognised mode falls back to approval, never veto ---
        // The check is `!= "veto"`, so a typo must not silently disable the foundation gate.
        _setEnv("VETO", PUBLIC_VOTE_DURATION); // wrong case on purpose
        assertEq(_public()[1].vetoThreshold, 0, "INV-12: wrong-case mode must default to approval");
        _setEnv("nonsense", PUBLIC_VOTE_DURATION);
        assertEq(_public()[1].vetoThreshold, 0, "INV-12: unknown mode must default to approval");

        // --- INV-8 across the whole supported window range ---
        uint64[5] memory durations = [uint64(1 hours), 2 hours, 1 days, 30 days, 365 days];
        for (uint256 i = 0; i < durations.length; i++) {
            _setEnv("approval", durations[i]);
            SppInstall.Stage[] memory s = _public();
            assertEq(s[0].voteDuration, durations[i], "INV-8: voteDuration follows the env");
            assertEq(s[0].minAdvance, s[0].voteDuration, "INV-8: minAdvance must track voteDuration for any window");
        }

        // --- the wiring batch itself, under the phased-rollout flags ---
        // Lives in this same test for the shared-env reason documented on `_setEnv`.
        _setEnv("approval", PUBLIC_VOTE_DURATION);
        _setWiringEnv();

        // Single-phase (the Sepolia default): both processes, Admin disarmed last.
        Action[] memory full = harness.wiringActions(true, true);
        assertEq(full.length, 8, "single-phase wiring is 8 actions");
        _assertDisarmIsLast(full);

        // Phase 1 of the phased rollout: public only, bootstrap deliberately left armed.
        Action[] memory publicOnly = harness.wiringActions(false, false);
        assertEq(publicOnly.length, 4, "public-only wiring drops the 3 private actions and the disarm");
        for (uint256 i = 0; i < publicOnly.length; i++) {
            assertTrue(publicOnly[i].to != CRISP, "public-only wiring must never touch the CRISP body");
            assertTrue(publicOnly[i].to != SPP_PRIVATE, "public-only wiring must never touch the private SPP");
        }
        // No action may revoke the Admin plugin's EXECUTE when the disarm is opted out of.
        bytes memory disarmCalldata =
            abi.encodeWithSignature("revoke(address,address,bytes32)", DAO, ADMIN, keccak256("EXECUTE_PERMISSION"));
        for (uint256 i = 0; i < publicOnly.length; i++) {
            assertTrue(
                keccak256(publicOnly[i].data) != keccak256(disarmCalldata),
                "DISARM_ADMIN=false must not disarm the bootstrap"
            );
        }

        // The disarm stays the final action whenever it is included at all.
        _assertDisarmIsLast(harness.wiringActions(false, true));
        assertEq(harness.wiringActions(true, false).length, 7, "private wiring without the disarm is 7 actions");
    }

    /// @dev The Admin disarm must be the LAST action: the batch runs under the Admin plugin's
    ///      EXECUTE permission, so revoking it earlier would strand the remaining actions.
    function _assertDisarmIsLast(Action[] memory actions) internal pure {
        Action memory last = actions[actions.length - 1];
        assertEq(last.to, DAO, "disarm targets the DAO");
        assertEq(
            keccak256(last.data),
            keccak256(abi.encodeWithSignature("revoke(address,address,bytes32)", DAO, ADMIN, EXECUTE_PERMISSION)),
            "the final action must revoke the Admin plugin's EXECUTE on the DAO"
        );
    }

    function _setWiringEnv() internal {
        vm.setEnv("DAO_ADDRESS", vm.toString(DAO));
        vm.setEnv("TOKEN_VOTING_PLUGIN_ADDRESS", vm.toString(TOKEN_VOTING));
        vm.setEnv("SPP_PUBLIC_ADDRESS", vm.toString(SPP_PUBLIC));
        vm.setEnv("CRISP_VOTING_PLUGIN_ADDRESS", vm.toString(CRISP));
        vm.setEnv("SPP_PRIVATE_ADDRESS", vm.toString(SPP_PRIVATE));
        vm.setEnv("EXECUTOR_ADDRESS", vm.toString(EXECUTOR));
        vm.setEnv("FOUNDATION_ADDRESS", vm.toString(FOUNDATION));
        vm.setEnv("ADMIN_PLUGIN_ADDRESS", vm.toString(ADMIN));
    }
}
