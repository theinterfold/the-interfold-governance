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

/// @notice Covers the quorum / tally-scaling half of `CrispVoting`.
///
/// The CRISP server encodes each voter's power at 1 decimal of precision
/// (`balance / 10^(decimals-1)`), so decrypted tallies arrive in scaled units.
/// `_tallyScale()` must undo exactly that when checking quorum — it is one leg of
/// the three-way sync (server / contract / app) called out in AGENTS.md, and a
/// mismatch silently changes which proposals pass.
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

    /// @dev 18-decimal token => the server scales by 10^17.
    uint256 internal constant SCALE = 10 ** 17;

    function setUp() public {
        vm.roll(100);

        feeToken = new MockFeeToken();
        // 1000 whole tokens of supply at 18 decimals.
        votesToken = new MockVotesToken(1000 * 10 ** 18, 18);
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
        proposalId =
            plugin.createProposal(_sppMetadata(), actions, 0, 0, abi.encode(uint256(0), uint256(0), uint256(0)));

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
        // Supply 1000e18, minParticipation 50% => need 500e18 raw = 5000 scaled units.
        uint256 proposalId = _createWithTally(_counts(3000, 2000)); // 5000 scaled == exactly 50%
        assertTrue(plugin.canExecute(proposalId), "exactly-at-quorum must pass");
    }

    function test_quorumOneUnitBelowThresholdFails() public {
        uint256 proposalId = _createWithTally(_counts(3000, 1999)); // 4999 scaled < 50%
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
        // Created under 50%: 5000 scaled units is exactly quorum, so it passes.
        uint256 proposalId = _createWithTally(_counts(3000, 2000));

        // Mid-flight, governance raises the bar to 90% (9000 scaled units).
        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0, minVoterVotingPower: 1, minParticipation: 90, minDuration: MIN_DURATION
            })
        );
        assertEq(plugin.minParticipation(), 90, "the live setting must have changed");

        assertTrue(plugin.canExecute(proposalId), "an open proposal must settle at the quorum it was created under");
    }

    /// @notice The converse: LOWERING the quorum must not rescue a proposal that already failed.
    function test_quorumLoweredMidProposalDoesNotRescueAnOpenProposal() public {
        // Created under 50%: 4999 scaled units is one unit short, so it fails.
        uint256 proposalId = _createWithTally(_counts(3000, 1999));

        dao.grant(address(plugin), address(this), plugin.MANAGER_PERMISSION_ID());
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: 0, minVoterVotingPower: 1, minParticipation: 1, minDuration: MIN_DURATION
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

    // --- tally scaling ---

    /// @notice The scaling invariant: a tally expressed in scaled units must be judged
    ///         against raw supply as `counts * 10^(decimals-1)`. If `_tallyScale()` ever
    ///         drifts from the server's encoding, this is the test that catches it.
    function test_tallyScaleMatchesTheServerEncoding() public {
        // Half the supply voted: 500e18 raw => 500e18 / 10^17 == 5000 scaled units.
        uint256 halfSupplyScaled = (500 * 10 ** 18) / SCALE;
        assertEq(halfSupplyScaled, 5000, "sanity: 18-decimal scaling is 10^17");

        uint256 proposalId = _createWithTally(_counts(halfSupplyScaled, 0));
        assertTrue(plugin.canExecute(proposalId), "half the supply must meet a 50% quorum");
    }

    /// @dev Tokens with 0 or 1 decimals are unscaled (scale == 1).
    function test_lowDecimalTokenIsUnscaled() public {
        votesToken = new MockVotesToken(1000, 1);
        _deployPlugin(MIN_PARTICIPATION);
        spp.setCreator(SPP_PROPOSAL_ID, creator);

        uint256 proposalId = _createWithTally(_counts(500, 0)); // 500/1000 == 50%, unscaled
        assertTrue(plugin.canExecute(proposalId), "1-decimal token must not be scaled");
    }

    /// @dev A token without `decimals()` must fall back to scale 1 rather than revert.
    function test_tokenWithoutDecimalsFallsBackToUnscaled() public {
        votesToken = new MockVotesToken(1000, 18);
        _deployPlugin(MIN_PARTICIPATION);
        spp.setCreator(SPP_PROPOSAL_ID, creator);
        votesToken.setRevertOnDecimals(true);

        uint256 proposalId = _createWithTally(_counts(500, 0));
        assertTrue(plugin.canExecute(proposalId), "missing decimals() must degrade to scale 1");
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
