// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

import {Utils} from "../script/Utils.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

/// @dev `validateDeploymentPolicy` is `internal`, so it is reached through a harness rather than
///      by calling the library directly.
contract PolicyHarness {
    function check(uint256 chainId, Utils.CrispEnvVariables memory config) external pure {
        Utils.validateDeploymentPolicy(chainId, config);
    }
}

/// @notice Guards the mainnet deployment policy in `Utils.validateDeploymentPolicy`.
///
/// @dev These constants are not cosmetic. `E3RequestParams.committeeSize` and `.paramSet` cross
///      the ABI as bare `uint8` ordinals, and Interfold resolves them through
///      `ActiveCryptoConfig`: `isParamSetSupported` accepts ONLY `SECURE_PARAM_SET == 1` outside
///      Sepolia and local chains, and `committeeParams` maps 0/1/2 to Minimum(2 of 3),
///      Micro(5 of 9), Small(10 of 19).
///
///      The incident this guards: the vendored `CommitteeSize` enum read
///      `Micro, Small, Medium, Large` while the coordinator declared `Minimum, Micro, Small`.
///      Every ordinal was silently renamed — `.env.mainnet.example` asked for `COMMITTEE_SIZE=0`
///      believing it meant "Micro", which on chain is a 3-node committee with threshold 1, and
///      `PARAM_SET=0` is the insecure 512-degree set that mainnet refuses outright. Neither
///      mistake announces itself in a checkout: the enum compiles, and the deploy only fails
///      mid-broadcast with an opaque `UnsupportedCryptoConfig`.
contract MainnetDeploymentPolicyTest is Test {
    uint256 internal constant MAINNET = 1;
    uint256 internal constant SEPOLIA = 11155111;

    PolicyHarness internal harness;

    function setUp() public {
        harness = new PolicyHarness();
    }

    /// @dev A configuration that satisfies every mainnet rule; each test breaks exactly one field.
    function _validMainnetConfig() internal pure returns (Utils.CrispEnvVariables memory config) {
        config.interfold = address(0xBEEF);
        config.crispProgramAddress = address(0xCAFE);
        config.targetConfig = IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});
        config.committeeSize = IInterfold.CommitteeSize.Small;
        config.paramSet = 1;
        config.votingSettings = ICrispVoting.VotingSettings({
            minProposerVotingPower: 1,
            minVoterVotingPower: 1,
            minDuration: 5 days,
            minParticipation: 10,
            supportThreshold: 50
        });
    }

    // --- the ordinals themselves ---------------------------------------------

    /// @dev The whole policy rests on these three ordinals matching
    ///      `ActiveCryptoConfig.committeeParams`. If someone reorders the enum, this fails before
    ///      any of the revert tests below become misleading.
    function test_committeeSizeOrdinalsMatchTheCoordinator() public pure {
        assertEq(uint8(IInterfold.CommitteeSize.Minimum), 0, "Minimum must be ordinal 0 (2 of 3)");
        assertEq(uint8(IInterfold.CommitteeSize.Micro), 1, "Micro must be ordinal 1 (5 of 9)");
        assertEq(uint8(IInterfold.CommitteeSize.Small), 2, "Small must be ordinal 2 (10 of 19)");
    }

    // --- mainnet is constrained ----------------------------------------------

    function test_mainnetAcceptsSecureParamsWithASmallCommittee() public view {
        harness.check(MAINNET, _validMainnetConfig());
    }

    function test_mainnetRejectsTheInsecureParamSet() public {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.paramSet = 0;

        vm.expectRevert(abi.encodeWithSelector(Utils.MainnetRequiresSecureParams.selector, uint8(0)));
        harness.check(MAINNET, config);
    }

    /// @dev Ordinal 0 is what `.env.mainnet.example` used to ship. Under the corrected enum it is
    ///      `Minimum` — a 3-node committee — so it must be refused by name, not merely renamed.
    function test_mainnetRejectsAMinimumCommittee() public {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.committeeSize = IInterfold.CommitteeSize.Minimum;

        vm.expectRevert(
            abi.encodeWithSelector(Utils.MainnetRequiresSmallCommittee.selector, IInterfold.CommitteeSize.Minimum)
        );
        harness.check(MAINNET, config);
    }

    function test_mainnetRejectsAMicroCommittee() public {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.committeeSize = IInterfold.CommitteeSize.Micro;

        vm.expectRevert(
            abi.encodeWithSelector(Utils.MainnetRequiresSmallCommittee.selector, IInterfold.CommitteeSize.Micro)
        );
        harness.check(MAINNET, config);
    }

    /// @dev Mainnet private governance requires a full five-day voting window.
    function test_mainnetRejectsADurationBelowTheFloor() public {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.votingSettings.minDuration = 5 days - 1;

        vm.expectRevert(
            abi.encodeWithSelector(Utils.MainnetDurationTooShort.selector, uint64(5 days - 1), uint64(5 days))
        );
        harness.check(MAINNET, config);
    }

    function test_mainnetRejectsAZeroDuration() public {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.votingSettings.minDuration = 0;

        vm.expectRevert(abi.encodeWithSelector(Utils.MainnetDurationTooShort.selector, uint64(0), uint64(5 days)));
        harness.check(MAINNET, config);
    }

    // --- testnets are not ----------------------------------------------------

    /// @dev Sepolia legitimately runs the insecure preset against a minimum committee —
    ///      `isParamSetSupported` allows both there. A guard that refused this would block the
    ///      very testnet the secure-parameter work is validated on.
    function test_sepoliaAcceptsTheInsecurePresetAndAMinimumCommittee() public view {
        Utils.CrispEnvVariables memory config = _validMainnetConfig();
        config.paramSet = 0;
        config.committeeSize = IInterfold.CommitteeSize.Minimum;
        config.votingSettings.minDuration = 0;

        harness.check(SEPOLIA, config);
    }
}
