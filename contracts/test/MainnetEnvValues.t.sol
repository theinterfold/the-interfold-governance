// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {Utils} from "../script/Utils.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

/// @notice Asserts the VALUES currently in contracts/.env.mainnet clear the mainnet policy gate.
/// @dev `Utils.validateDeploymentPolicy` is chain-gated on `chainid == 1`, so a wrong env value is
///      only caught at deploy time on mainnet itself. This pins the three numbers the Safe flow
///      will broadcast, so a drifted env file fails here instead of reverting mid-deploy.
contract MainnetEnvValuesTest is Test {
    // The literals below mirror contracts/.env.mainnet. Update both together.
    uint8 internal constant ENV_PARAM_SET = 1; // secure-8192
    IInterfold.CommitteeSize internal constant ENV_COMMITTEE_SIZE = IInterfold.CommitteeSize.Small; // ordinal 2
    uint64 internal constant ENV_MINIMUM_DURATION = 432_000; // 5 days
    uint64 internal constant ENV_SPP_PRIVATE_VOTE_DURATION = 432_000; // 5 days

    function _config() internal pure returns (Utils.CrispEnvVariables memory config) {
        config.paramSet = ENV_PARAM_SET;
        config.committeeSize = ENV_COMMITTEE_SIZE;
        config.votingSettings.minDuration = ENV_MINIMUM_DURATION;
    }

    /// @dev External so `vm.expectRevert` can target a call boundary.
    function exposedValidate(uint256 chainId, Utils.CrispEnvVariables memory config) external pure {
        Utils.validateDeploymentPolicy(chainId, config);
    }

    function test_envMainnetValuesPassTheMainnetPolicyGate() public pure {
        // chainid 1 is the only gated chain; this must not revert.
        Utils.validateDeploymentPolicy(1, _config());
    }

    function test_envParamSetIsTheSecureSet() public pure {
        assertEq(ENV_PARAM_SET, 1, "mainnet must deploy secure-8192, not insecure-512");
    }

    /// @dev The ordinal is what crosses the ABI as `uint8`, so pin the number, not the name.
    function test_envCommitteeSizeOrdinalIsSmall() public pure {
        assertEq(uint8(ENV_COMMITTEE_SIZE), 2, "Small must be ordinal 2 (0=Minimum, 1=Micro)");
    }

    function test_envMinimumDurationClearsTheMainnetFloor() public pure {
        assertGe(ENV_MINIMUM_DURATION, Utils.MAINNET_MINIMUM_DURATION, "minDuration below the 5-day mainnet floor");
    }

    /// @dev INV-37: a private stage window under CRISP's `minDuration` makes every private
    ///      `createProposal` revert INSIDE the SPP's try/catch, so the proposal dies silently.
    function test_sppPrivateWindowClearsCrispMinimumDuration() public pure {
        assertGe(
            ENV_SPP_PRIVATE_VOTE_DURATION, ENV_MINIMUM_DURATION, "SPP private window shorter than CRISP minDuration"
        );
    }

    /// @dev The values this env file carried before. Reinjecting them must still be refused.
    function test_theSupersededTestnetValuesAreStillRefused() public {
        Utils.CrispEnvVariables memory stale = _config();
        stale.paramSet = 0;
        vm.expectRevert(abi.encodeWithSelector(Utils.MainnetRequiresSecureParams.selector, uint8(0)));
        this.exposedValidate(1, stale);

        stale = _config();
        stale.committeeSize = IInterfold.CommitteeSize.Minimum;
        vm.expectRevert(
            abi.encodeWithSelector(Utils.MainnetRequiresSmallCommittee.selector, IInterfold.CommitteeSize.Minimum)
        );
        this.exposedValidate(1, stale);
    }

    /// @dev Sepolia and local legitimately run the insecure preset; the gate must stay chain-scoped.
    function test_theGateDoesNotConstrainSepoliaOrLocal() public pure {
        Utils.CrispEnvVariables memory testnet = _config();
        testnet.paramSet = 0;
        testnet.committeeSize = IInterfold.CommitteeSize.Minimum;
        testnet.votingSettings.minDuration = 3600;
        Utils.validateDeploymentPolicy(11_155_111, testnet);
        Utils.validateDeploymentPolicy(31_337, testnet);
    }
}
