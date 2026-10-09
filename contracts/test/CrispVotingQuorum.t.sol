// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {MockCrispProgram, MockFeeToken, MockInterfold, MockSpp, MockVotesToken} from "./mocks/CrispMocks.sol";

// --- Tests -----------------------------------------------------------------

/// @notice Covers the quorum half of `CrispVoting`.
///
/// CRISP weighs each ballot as `floor(rawPower / divisor)` with the divisor it records for the
/// round, so decrypted tallies arrive in units of `divisor` raw tokens. `_canExecute` must scale
/// them back up by exactly that recorded divisor (`votingPowerDivisorOf`) — a mismatch silently
/// changes which proposals pass.
contract CrispVotingQuorumTest is Test {
    DAO internal dao;
    CrispVoting internal plugin;
    MockFeeToken internal feeToken;
    MockVotesToken internal votesToken;
    MockInterfold internal interfold;
    MockCrispProgram internal crispProgram;
    MockSpp internal spp;

    address internal sppAddr;
    address internal creator;

    uint64 internal constant MIN_DURATION = 3600;
    uint256 internal constant SPP_PROPOSAL_ID = 777;
    uint32 internal constant MIN_PARTICIPATION = 50; // 50% of RATIO_BASE (=100)

    /// @dev Raw supply at the snapshot. With the insecure-512 plaintext modulus `t = 100` the
    ///      mock program records `supply / t + 1 = 10` as the round's divisor, so the supply is
    ///      exactly 90 ballot units and a 50% quorum is exactly 45 units.
    uint256 internal constant SUPPLY = 900;
    uint256 internal constant DIVISOR = 10;

    function setUp() public {
        vm.roll(100);

        feeToken = new MockFeeToken();
        votesToken = new MockVotesToken(SUPPLY);
        interfold = new MockInterfold(address(feeToken));
        crispProgram = new MockCrispProgram();
        spp = new MockSpp();
        creator = makeAddr("creator");

        dao = DAO(
            payable(ProxyLib.deployUUPSProxy(
                    address(new DAO()), abi.encodeCall(DAO.initialize, (bytes(""), address(this), address(0), ""))
                ))
        );

        _deployPlugin(MIN_PARTICIPATION);
        spp.setCreator(SPP_PROPOSAL_ID, creator);
    }

    function _deployPlugin(uint32 minParticipation) internal {
        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(dao)),
            token: address(votesToken),
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(crispProgram),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: minParticipation,
                supportThreshold: 50,
                minDuration: MIN_DURATION
            })
        });

        plugin = CrispVoting(
            ProxyLib.deployUUPSProxy(address(new CrispVoting()), abi.encodeCall(CrispVoting.initialize, params))
        );

        sppAddr = address(spp);
        dao.grant(address(plugin), sppAddr, plugin.CREATE_PROPOSAL_PERMISSION_ID());
    }

    function _depositAs(address who, uint256 amount) internal {
        feeToken.mint(who, amount);
        vm.startPrank(who);
        feeToken.approve(address(plugin), amount);
        plugin.deposit(amount);
        vm.stopPrank();
    }

    function _sppMetadata() internal view returns (bytes memory) {
        return abi.encode(sppAddr, SPP_PROPOSAL_ID, uint16(0));
    }

    /// @dev Creates a proposal and publishes `counts` as its decrypted tally.
    function _createWithTally(uint256[] memory counts) internal returns (uint256 proposalId) {
        _depositAs(creator, 100 ether);

        Action[] memory actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (0, 1, 1, true))});

        vm.prank(sppAddr);
        proposalId = plugin.createProposal(_sppMetadata(), actions, 0, 0, abi.encode(uint256(0)));

        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, counts);
        vm.warp(block.timestamp + MIN_DURATION + 1);
    }

    function _counts(uint256 yes, uint256 no) internal pure returns (uint256[] memory counts) {
        counts = new uint256[](2);
        counts[0] = yes;
        counts[1] = no;
    }

    // --- quorum ---

    function test_quorumReachedExactlyAtThresholdSucceeds() public {
        // Supply is 90 ballot units, minParticipation 50% => quorum is exactly 45 units.
        uint256 proposalId = _createWithTally(_counts(27, 18));
        assertTrue(plugin.canExecute(proposalId), "exactly-at-quorum must pass");
    }

    function test_quorumOneUnitBelowThresholdFails() public {
        uint256 proposalId = _createWithTally(_counts(27, 17)); // 44 units < 45
        assertFalse(plugin.canExecute(proposalId), "one unit below quorum must fail");
    }

    /// @notice A proposal settles at the quorum in force WHEN IT WAS CREATED, not the one in
    ///         force when its tally is read (INV-33).
    /// @dev Matches canonical TokenVoting, which freezes `minVotingPower` into the proposal at
    ///      creation and never re-reads the setting, and matches the SPP, which pins each
    ///      proposal to a `stageConfigIndex`. Without this, a governance proposal that raises the
    ///      quorum retroactively fails every CRISP vote already in flight — the goalposts move
    ///      after people have voted, and an encrypted vote cannot even be re-cast.
    function test_quorumRaisedMidProposalDoesNotAffectAnOpenProposal() public {
        // Created under 50%: 45 units is exactly quorum, so it passes.
        uint256 proposalId = _createWithTally(_counts(27, 18));

        // Mid-flight, governance raises the bar to 90% (81 units).
        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: 90,
                supportThreshold: 50,
                minDuration: MIN_DURATION
            })
        );
        assertEq(plugin.minParticipation(), 90, "the live setting must have changed");

        assertTrue(plugin.canExecute(proposalId), "an open proposal must settle at the quorum it was created under");
    }

    /// @notice The converse: LOWERING the quorum must not rescue a proposal that already failed.
    function test_quorumLoweredMidProposalDoesNotRescueAnOpenProposal() public {
        // Created under 50%: 44 units is one unit short, so it fails.
        uint256 proposalId = _createWithTally(_counts(27, 17));

        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: 1,
                supportThreshold: 50,
                minDuration: MIN_DURATION
            })
        );

        assertFalse(plugin.canExecute(proposalId), "a failed proposal must not be rescued by a later change");
    }

    function test_rejectedWhenNoBeatsYesDespiteQuorum() public {
        uint256 proposalId = _createWithTally(_counts(2000, 4000)); // quorum met, but no > yes
        assertFalse(plugin.canExecute(proposalId), "no must beat yes => rejected");
    }

    function test_tieIsRejected() public {
        // counts[0] must STRICTLY beat counts[1].
        uint256 proposalId = _createWithTally(_counts(3000, 3000));
        assertFalse(plugin.canExecute(proposalId), "a tie must not pass");
    }

    // --- supportThreshold ----------------------------------------------------

    /// @dev Raises the live support threshold to `threshold` (like a governance vote would).
    function _setSupportThreshold(uint32 threshold) internal {
        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: MIN_PARTICIPATION,
                supportThreshold: threshold,
                minDuration: MIN_DURATION
            })
        );
    }

    /// @notice The TokenVoting-style support rule: yes must STRICTLY exceed the threshold share
    ///         of the decisive votes, `(RATIO_BASE - t) * yes > t * no`. Landing exactly ON the
    ///         threshold fails — the same strictness as the tie rejection at the 50 default.
    function test_supportExactlyAtTheThresholdFails() public {
        _setSupportThreshold(51);
        // yes/(yes+no) = 5100/10000 = exactly 51%: 49*5100 == 51*4900, not strictly greater.
        uint256 proposalId = _createWithTally(_counts(5100, 4900));
        assertFalse(plugin.canExecute(proposalId), "exactly 51% support must fail a 51% threshold");
    }

    function test_supportOneUnitAboveTheThresholdSucceeds() public {
        _setSupportThreshold(51);
        uint256 proposalId = _createWithTally(_counts(5101, 4899));
        assertTrue(plugin.canExecute(proposalId), "one scaled unit above 51% must pass");
    }

    /// @notice INV-33 for the support threshold: like the quorum, a proposal settles under the
    ///         threshold in force WHEN IT WAS CREATED — raising it mid-flight must not
    ///         retroactively fail an open, encrypted vote.
    function test_supportThresholdRaisedMidProposalDoesNotAffectAnOpenProposal() public {
        // Created at the 50 default: 5100 vs 4900 passes (yes > no).
        uint256 proposalId = _createWithTally(_counts(5100, 4900));

        _setSupportThreshold(60);
        assertEq(plugin.supportThreshold(), 60, "the live setting must have changed");

        assertTrue(plugin.canExecute(proposalId), "an open proposal settles at the threshold it was created under");
        assertEq(plugin.getWinningOption(proposalId), 0, "and the reported decision agrees");
    }

    /// @notice A threshold of RATIO_BASE would make every tally unpassable
    ///         (`0 * yes > 100 * no` never holds), so it is capped at RATIO_BASE - 1 like
    ///         TokenVoting's.
    function test_updateVotingSettingsRevertsWhenSupportThresholdReachesRatioBase() public {
        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.RatioOutOfBounds.selector, 99, 100));
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: MIN_PARTICIPATION,
                supportThreshold: 100,
                minDuration: MIN_DURATION
            })
        );
    }

    function test_zeroTurnoutFails() public {
        uint256 proposalId = _createWithTally(_counts(0, 0));
        assertFalse(plugin.canExecute(proposalId), "no votes => no quorum");
    }

    function test_zeroTotalVotingPowerFails() public {
        uint256 proposalId = _createWithTally(_counts(5000, 0));
        votesToken.setSupply(0);
        assertFalse(plugin.canExecute(proposalId), "zero supply must fail closed, not divide-by-zero");
    }

    function test_zeroMinParticipationDisablesQuorum() public {
        _deployPlugin(0);
        uint256 proposalId = _createWithTally(_counts(1, 0)); // a single scaled unit
        assertTrue(plugin.canExecute(proposalId), "minParticipation 0 => quorum disabled");
    }

    // --- recorded divisor ---

    /// @notice Tallies are in units of the divisor CRISP recorded for the round, which is
    ///         `supply / t + 1` — not a power of ten, and not the same for every supply.
    function test_quorumScalesTalliesByTheRecordedDivisor() public {
        // 9000 raw supply at t = 100 => divisor 91. 50% quorum is 4500 raw, so 50 units
        // (4550 raw) pass and 49 units (4459 raw) do not.
        votesToken.setSupply(9000);
        uint256 proposalId = _createWithTally(_counts(50, 0));
        uint256 e3Id = plugin.getProposal(proposalId).e3Id;
        assertEq(crispProgram.votingPowerDivisorOf(e3Id), 91, "sanity: CRISP's minimum divisor");
        assertTrue(plugin.canExecute(proposalId), "50 units of 91 raw cover 50% of 9000");

        crispProgram.setTally(e3Id, _counts(49, 0));
        assertFalse(plugin.canExecute(proposalId), "49 units of 91 raw fall short of 50% of 9000");
    }

    /// @notice The divisor is read from the program, so quorum moves with it in both directions
    ///         at the boundary: a smaller divisor fails a tally that a larger one passes.
    function test_aSmallerDivisorWouldChangeTheOutcome() public {
        uint256 proposalId = _createWithTally(_counts(27, 18)); // 45 units
        uint256 e3Id = plugin.getProposal(proposalId).e3Id;
        assertEq(crispProgram.votingPowerDivisorOf(e3Id), DIVISOR, "sanity: recorded divisor");
        assertTrue(plugin.canExecute(proposalId), "45 units x 10 meets the 450 raw quorum");

        crispProgram.setVotingPowerDivisor(e3Id, DIVISOR - 1);
        assertFalse(plugin.canExecute(proposalId), "45 units x 9 falls short of 450");

        crispProgram.setTally(e3Id, _counts(27, 17)); // 44 units
        crispProgram.setVotingPowerDivisor(e3Id, DIVISOR);
        assertFalse(plugin.canExecute(proposalId), "44 units x 10 falls short of 450");
        crispProgram.setVotingPowerDivisor(e3Id, DIVISOR + 1);
        assertTrue(plugin.canExecute(proposalId), "44 units x 11 meets 450");
    }

    /// @notice A recorded divisor of 0 means the program holds no round for the E3. Multiplying
    ///         the votes by it zeroes the left side of the quorum comparison, so with quorum
    ///         disabled (`minParticipation == 0`) `0 >= 0` would read as a passing quorum.
    function test_zeroDivisorNeverPassesQuorum() public {
        _deployPlugin(0);
        uint256 proposalId = _createWithTally(_counts(1_000_000, 0));
        uint256 e3Id = plugin.getProposal(proposalId).e3Id;
        assertTrue(plugin.canExecute(proposalId), "sanity: with quorum disabled this tally passes");

        crispProgram.setVotingPowerDivisor(e3Id, 0);
        assertFalse(plugin.canExecute(proposalId), "no recorded divisor must not read as a passing quorum");
    }

    /// @notice Quorum must be monotonic: more turnout never turns a passing proposal
    ///         into a failing one. Guards against overflow/truncation in the scaling.
    function testFuzz_quorumIsMonotonicInTurnout(uint96 yesA, uint96 extra) public {
        uint256 yes = uint256(yesA) % 1e12;
        uint256 more = yes + (uint256(extra) % 1e12);

        uint256 idA = _createWithTally(_counts(yes, 0));
        bool passesA = plugin.canExecute(idA);

        // Fresh plugin so the second proposal is judged independently.
        _deployPlugin(MIN_PARTICIPATION);
        spp.setCreator(SPP_PROPOSAL_ID, creator);
        uint256 idB = _createWithTally(_counts(more, 0));
        bool passesB = plugin.canExecute(idB);

        if (passesA) assertTrue(passesB, "more turnout must never lose a passing quorum");
    }
}
