// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";

import {SafeActionsScript} from "../script/SafeActions.s.sol";

/// @dev Exposes the internal env reader so the parallel-array decoding can be asserted directly.
contract SafeActionsHarness is SafeActionsScript {
    function loadPrepared(string memory prefix) external view returns (Prepared memory) {
        return _loadPrepared(prefix);
    }
}

/**
 * @notice Guards how a prepared installation is rebuilt from `<PREFIX>_*` env vars.
 *
 * @dev `applyInstallation` re-derives the prepared setup id by hashing the permission list —
 *      condition addresses INCLUDED — and reverts on any mismatch. The reader originally
 *      hardcoded `NO_CONDITION`, which is silently wrong for any setup that grants with a
 *      condition. TokenVoting's install does exactly that (CREATE_PROPOSAL to ANY_ADDR behind a
 *      VotingPowerCondition), and so does the SPP's, so every generated apply action for the
 *      mainnet DAO would have been rejected on chain.
 *
 *      Each test uses its OWN prefix: `vm.setEnv` writes the forge process environment, which is
 *      shared across test functions, so a common prefix makes the cases race each other.
 */
contract SafeActionsPreparedTest is Test {
    SafeActionsHarness internal harness;

    address internal constant PLUGIN = 0x1111111111111111111111111111111111111111;
    address internal constant REPO = 0x2222222222222222222222222222222222222222;
    address internal constant CONDITION = 0x3333333333333333333333333333333333333333;

    function setUp() public {
        harness = new SafeActionsHarness();
    }

    /// @dev Writes the four always-present arrays under `prefix`, two permissions long.
    function _seed(string memory prefix) internal {
        vm.setEnv(string.concat(prefix, "_PLUGIN_ADDRESS"), vm.toString(PLUGIN));
        vm.setEnv(string.concat(prefix, "_PLUGIN_REPO"), vm.toString(REPO));
        vm.setEnv(string.concat(prefix, "_RELEASE"), "1");
        vm.setEnv(string.concat(prefix, "_BUILD"), "4");
        vm.setEnv(string.concat(prefix, "_HELPERS_HASH"), vm.toString(keccak256("helpers")));
        vm.setEnv(string.concat(prefix, "_PERM_OPS"), "0,2");
        vm.setEnv(
            string.concat(prefix, "_PERM_WHERE"),
            "0x1111111111111111111111111111111111111111,0x1111111111111111111111111111111111111111"
        );
        vm.setEnv(
            string.concat(prefix, "_PERM_WHO"),
            "0x4444444444444444444444444444444444444444,0x5555555555555555555555555555555555555555"
        );
        vm.setEnv(
            string.concat(prefix, "_PERM_IDS"),
            string.concat(vm.toString(keccak256("A")), ",", vm.toString(keccak256("B")))
        );
    }

    /// @notice A conditioned permission keeps its condition address through the round trip.
    function test_loadPreparedCarriesTheConditionAddress() public {
        _seed("TA");
        vm.setEnv(
            "TA_PERM_CONDITIONS",
            "0x0000000000000000000000000000000000000000,0x3333333333333333333333333333333333333333"
        );

        SafeActionsScript.Prepared memory p = harness.loadPrepared("TA");

        assertEq(p.permissions.length, 2, "permission count");
        assertEq(p.permissions[0].condition, PermissionLib.NO_CONDITION, "unconditioned entry");
        assertEq(p.permissions[1].condition, CONDITION, "conditioned entry must survive the round trip");
        assertEq(uint8(p.permissions[1].operation), uint8(PermissionLib.Operation.GrantWithCondition), "operation");
        assertEq(p.plugin, PLUGIN, "plugin");
    }

    /// @notice Omitting the var entirely still works, for setups with no conditions at all.
    function test_loadPreparedDefaultsToNoCondition() public {
        _seed("TB");
        vm.setEnv("TB_PERM_CONDITIONS", "");

        SafeActionsScript.Prepared memory p = harness.loadPrepared("TB");

        assertEq(p.permissions.length, 2, "permission count");
        assertEq(p.permissions[0].condition, PermissionLib.NO_CONDITION, "entry 0");
        assertEq(p.permissions[1].condition, PermissionLib.NO_CONDITION, "entry 1");
    }

    /// @notice A short conditions list is a transcription error, not something to pad silently.
    function test_loadPreparedRevertsOnMismatchedConditionCount() public {
        _seed("TC");
        vm.setEnv("TC_PERM_CONDITIONS", "0x0000000000000000000000000000000000000000");

        vm.expectRevert("permission arrays differ in length");
        harness.loadPrepared("TC");
    }
}
