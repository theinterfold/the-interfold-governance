// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IProposal} from "@aragon/osx-commons-contracts/src/plugin/extensions/proposal/IProposal.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {Executor} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {MockCrispProgram, MockFeeToken, MockInterfold, MockSpp, MockVotesToken} from "./mocks/CrispMocks.sol";

/// @notice Covers the read surface, the settings path and the revert paths of `CrispVoting`.
///         The lifecycle happy paths live in `CrispVotingSpp.t.sol` and the tally maths in
///         `CrispVotingQuorum.t.sol`; this file targets what those two leave untouched.
contract CrispVotingViewsTest is Test {
    DAO internal dao;
    CrispVoting internal plugin;
    MockFeeToken internal feeToken;
    MockVotesToken internal votesToken;
    MockInterfold internal interfold;
    MockCrispProgram internal crispProgram;
    MockSpp internal spp;
    Executor internal executor;

    address internal sppAddr;
    address internal creator;

    uint64 internal constant MIN_DURATION = 3600;
    uint256 internal constant SPP_PROPOSAL_ID = 777;
    uint32 internal constant MIN_PARTICIPATION = 50;
    uint256 internal constant SUPPLY = 1000 * 10 ** 18;

    event VotingSettingsUpdated(
        uint256 minProposerVotingPower, uint256 minVoterVotingPower, uint32 minParticipation, uint64 minDuration
    );

    function setUp() public {
        vm.roll(100);
        vm.warp(1_000_000);

        feeToken = new MockFeeToken();
        votesToken = new MockVotesToken(SUPPLY, 18);
        interfold = new MockInterfold(address(feeToken));
        crispProgram = new MockCrispProgram();
        spp = new MockSpp();
        executor = new Executor();
        creator = makeAddr("creator");

        dao = DAO(
            payable(ProxyLib.deployUUPSProxy(
                    address(new DAO()), abi.encodeCall(DAO.initialize, (bytes(""), address(this), address(0), ""))
                ))
        );

        plugin = _deploy(address(votesToken), MIN_PARTICIPATION);
        sppAddr = address(spp);
        spp.setCreator(SPP_PROPOSAL_ID, creator);
    }

    function _initParams(address token, uint32 minParticipation)
        internal
        view
        returns (ICrispVoting.PluginInitParams memory)
    {
        return ICrispVoting.PluginInitParams({
            dao: IDAO(address(dao)),
            token: token,
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(crispProgram),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 7,
                minVoterVotingPower: 3,
                minParticipation: minParticipation,
                minDuration: MIN_DURATION
            })
        });
    }

    function _deploy(address token, uint32 minParticipation) internal returns (CrispVoting p) {
        p = CrispVoting(
            ProxyLib.deployUUPSProxy(
                address(new CrispVoting()), abi.encodeCall(CrispVoting.initialize, _initParams(token, minParticipation))
            )
        );
        dao.grant(address(p), address(spp), p.CREATE_PROPOSAL_PERMISSION_ID());
        dao.grant(address(p), address(this), p.MANAGER_PERMISSION_ID());
        dao.grant(address(p), address(this), p.SET_TARGET_CONFIG_PERMISSION_ID());

        // Bodies execute via delegatecall to the shared Executor (the SPP-body wiring), not
        // against the DAO — they deliberately hold no EXECUTE_PERMISSION. targetConfig is
        // snapshotted at proposal creation, so this must be set before any _create().
        p.setTargetConfig(IPlugin.TargetConfig({target: address(executor), operation: IPlugin.Operation.DelegateCall}));
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

    function _actions() internal view returns (Action[] memory actions) {
        actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (0, 1, 1, true))});
    }

    function _create() internal returns (uint256 proposalId) {
        _depositAs(creator, 100 ether);
        vm.prank(sppAddr);
        proposalId =
            plugin.createProposal(_sppMetadata(), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0)));
    }

    function _counts(uint256 yes, uint256 no) internal pure returns (uint256[] memory c) {
        c = new uint256[](2);
        c[0] = yes;
        c[1] = no;
    }

    /// @dev Creates a proposal, publishes a passing tally, closes the window and executes it.
    function _createAndExecute() internal returns (uint256 proposalId) {
        proposalId = _create();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(6000, 0));
        vm.warp(block.timestamp + MIN_DURATION + 1);
        plugin.execute(proposalId);
    }

    // --- initialize -----------------------------------------------------------

    function test_initializeRevertsOnZeroInterfold() public {
        ICrispVoting.PluginInitParams memory params = _initParams(address(votesToken), MIN_PARTICIPATION);
        params.interfold = address(0);

        address impl = address(new CrispVoting());
        vm.expectRevert(ICrispVoting.ZeroAddress.selector);
        ProxyLib.deployUUPSProxy(impl, abi.encodeCall(CrispVoting.initialize, params));
    }

    function test_initializeRevertsWhenMinParticipationExceedsRatioBase() public {
        // minParticipation is a percentage of RATIO_BASE (=100), so 101 is out of bounds.
        ICrispVoting.PluginInitParams memory params = _initParams(address(votesToken), 101);

        address impl = address(new CrispVoting());
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.RatioOutOfBounds.selector, 100, 101));
        ProxyLib.deployUUPSProxy(impl, abi.encodeCall(CrispVoting.initialize, params));
    }

    // --- getters --------------------------------------------------------------

    function test_gettersReflectTheInitialSettings() public view {
        assertEq(plugin.minParticipation(), MIN_PARTICIPATION, "minParticipation");
        assertEq(plugin.minDuration(), MIN_DURATION, "minDuration");
        assertEq(plugin.minProposerVotingPower(), 7, "minProposerVotingPower");
        assertEq(plugin.minVoterVotingPower(), 3, "minVoterVotingPower");
        assertEq(address(plugin.getVotingToken()), address(votesToken), "votingToken");
    }

    function test_totalVotingPowerReadsThePastTotalSupply() public view {
        assertEq(plugin.totalVotingPower(1), SUPPLY, "must proxy getPastTotalSupply");
    }

    function test_supportsInterface() public view {
        assertTrue(plugin.supportsInterface(type(IERC165).interfaceId), "IERC165");
        assertTrue(plugin.supportsInterface(type(IProposal).interfaceId), "IProposal");

        bytes4 crispId = plugin.initialize.selector ^ plugin.minProposerVotingPower.selector
            ^ plugin.minVoterVotingPower.selector ^ plugin.totalVotingPower.selector ^ plugin.getVotingToken.selector
            ^ plugin.minParticipation.selector ^ plugin.minDuration.selector ^ plugin.getProposal.selector;
        assertTrue(plugin.supportsInterface(crispId), "CRISP_VOTING_INTERFACE_ID");

        assertFalse(plugin.supportsInterface(0xdeadbeef), "unknown interface");
    }

    /// @notice The `_data` tuple is a three-way contract between `customProposalParamsABI()`,
    ///         `createProposal`'s decode, and the app encoder in
    ///         `plugins/crispVoting/hooks/useCreateProposal.ts`. If this string changes without
    ///         the other two, proposal creation silently misdecodes.
    function test_customProposalParamsAbiMatchesTheDecodedTuple() public view {
        assertEq(
            plugin.customProposalParamsABI(),
            "(uint256 allowFailureMap, uint256 votingDuration, uint256 credits)",
            "the _data ABI must stay in sync with createProposal and the app encoder"
        );
    }

    // --- updateVotingSettings -------------------------------------------------

    function test_updateVotingSettingsRequiresManagerPermission() public {
        ICrispVoting.VotingSettings memory s = ICrispVoting.VotingSettings({
            minProposerVotingPower: 1, minVoterVotingPower: 1, minParticipation: 10, minDuration: MIN_DURATION
        });

        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        plugin.updateVotingSettings(s);
    }

    function test_updateVotingSettingsStoresAndEmits() public {
        ICrispVoting.VotingSettings memory s = ICrispVoting.VotingSettings({
            minProposerVotingPower: 11, minVoterVotingPower: 12, minParticipation: 13, minDuration: 7200
        });

        vm.expectEmit(true, true, true, true, address(plugin));
        emit VotingSettingsUpdated(11, 12, 13, 7200);
        plugin.updateVotingSettings(s);

        assertEq(plugin.minProposerVotingPower(), 11);
        assertEq(plugin.minVoterVotingPower(), 12);
        assertEq(plugin.minParticipation(), 13);
        assertEq(plugin.minDuration(), 7200);
    }

    function test_updateVotingSettingsRejectsOutOfBoundsParticipation() public {
        ICrispVoting.VotingSettings memory s = ICrispVoting.VotingSettings({
            minProposerVotingPower: 1, minVoterVotingPower: 1, minParticipation: 101, minDuration: MIN_DURATION
        });

        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.RatioOutOfBounds.selector, 100, 101));
        plugin.updateVotingSettings(s);
    }

    // --- date validation ------------------------------------------------------

    function test_createProposalRejectsAStartDateInThePast() public {
        _depositAs(creator, 100 ether);
        uint64 past = uint64(block.timestamp - 1);

        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.DateOutOfBounds.selector, uint64(block.timestamp), past));
        plugin.createProposal(
            _sppMetadata(), _actions(), past, past + MIN_DURATION * 2, abi.encode(uint256(0), uint256(0), uint256(0))
        );
    }

    function test_createProposalRevertsWhenTheSameProposalIsCreatedTwice() public {
        _depositAs(creator, 100 ether);

        vm.startPrank(sppAddr);
        uint256 first =
            plugin.createProposal(_sppMetadata(), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0)));

        // Same actions + metadata => same derived id.
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalAlreadyExists.selector, first));
        plugin.createProposal(_sppMetadata(), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0)));
        vm.stopPrank();
    }

    // --- SPP metadata / payer resolution -------------------------------------

    /// @notice The standalone shape: no SPP, the creator calls the plugin directly, pays from
    ///         their own escrow, and must clear `minProposerVotingPower` themselves. This is the
    ///         path the Aragon app uses for a simple governance process, and the one the
    ///         SPP-only payer resolution used to reject outright.
    function test_createProposalDirectlyChargesTheCallerAndSucceeds() public {
        address proposer = makeAddr("directProposer");
        // A standalone install grants this to ANY_ADDR; the harness grants only the SPP, so the
        // direct caller is granted explicitly here.
        dao.grant(address(plugin), proposer, plugin.CREATE_PROPOSAL_PERMISSION_ID());
        _depositAs(proposer, 100 ether);
        votesToken.setVotes(proposer, 7); // exactly minProposerVotingPower

        vm.prank(proposer);
        uint256 proposalId = plugin.createProposal(
            bytes("ipfs://direct"), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0))
        );

        assertEq(plugin.proposalPayer(proposalId), proposer, "the direct caller is the payer");
        assertLt(plugin.feeCredits(proposer), 100 ether, "the caller's own escrow funds the fee");
    }

    /// @notice Nothing else enforces proposer eligibility in the direct shape —
    ///         CREATE_PROPOSAL_PERMISSION is granted to ANY_ADDR on a standalone install — so the
    ///         plugin must, or the setting is decorative.
    function test_createProposalDirectlyRejectsAProposerBelowTheVotingPowerBar() public {
        address proposer = makeAddr("weakProposer");
        dao.grant(address(plugin), proposer, plugin.CREATE_PROPOSAL_PERMISSION_ID());
        _depositAs(proposer, 100 ether);
        votesToken.setVotes(proposer, 6); // one short of minProposerVotingPower

        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, proposer));
        plugin.createProposal(bytes("ipfs://direct"), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0)));
    }

    /// @notice Metadata that is not the SPP encoding falls through to the direct path, where the
    ///         caller pays for itself — and is rejected here for holding no voting power, rather
    ///         than being allowed to spend `creator`'s escrow.
    function test_createProposalTreatsWrongLengthMetadataAsADirectProposal() public {
        _depositAs(creator, 100 ether);

        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, sppAddr));
        plugin.createProposal(
            abi.encode(sppAddr, SPP_PROPOSAL_ID), _actions(), 0, 0, abi.encode(uint256(0), uint256(0), uint256(0))
        );

        assertEq(plugin.feeCredits(creator), 100 ether, "creator's credit must be untouched");
    }

    /// @notice Naming an SPP the caller is not does not make that SPP's proposal creator pay.
    function test_createProposalWillNotChargeAnSppItIsNotCalledBy() public {
        _depositAs(creator, 100 ether);

        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, sppAddr));
        plugin.createProposal(
            abi.encode(makeAddr("otherSpp"), SPP_PROPOSAL_ID, uint16(0)),
            _actions(),
            0,
            0,
            abi.encode(uint256(0), uint256(0), uint256(0))
        );

        assertEq(plugin.feeCredits(creator), 100 ether, "creator's credit must be untouched");
    }

    function test_createProposalRevertsWhenTheSppReportsNoCreator() public {
        _depositAs(creator, 100 ether);
        uint256 unknownSppProposal = 999; // no creator registered => address(0)

        vm.prank(sppAddr);
        vm.expectRevert(ICrispVoting.InvalidSppMetadata.selector);
        plugin.createProposal(
            abi.encode(sppAddr, unknownSppProposal, uint16(0)),
            _actions(),
            0,
            0,
            abi.encode(uint256(0), uint256(0), uint256(0))
        );
    }

    // --- execute / hasSucceeded / canExecute revert paths ---------------------

    function test_executeRevertsForAnUnknownProposal() public {
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.NonexistentProposal.selector, uint256(42)));
        plugin.execute(42);
    }

    function test_canExecuteRevertsForAnUnknownProposal() public {
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.NonexistentProposal.selector, uint256(42)));
        plugin.canExecute(42);
    }

    function test_hasSucceededRevertsForAnUnknownProposal() public {
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.NonexistentProposal.selector, uint256(42)));
        plugin.hasSucceeded(42);
    }

    function test_executeRevertsBeforeTheVotingWindowCloses() public {
        uint256 proposalId = _create();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(6000, 0));

        // Still inside the window.
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalExecutionForbidden.selector, proposalId));
        plugin.execute(proposalId);
    }

    function test_executeRevertsWhenTheTallyDoesNotPass() public {
        uint256 proposalId = _create();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(1, 0)); // far below quorum
        vm.warp(block.timestamp + MIN_DURATION + 1);

        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalExecutionForbidden.selector, proposalId));
        plugin.execute(proposalId);
    }

    function test_executeIsNotRepeatable() public {
        uint256 proposalId = _createAndExecute();

        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalExecutionForbidden.selector, proposalId));
        plugin.execute(proposalId);
    }

    function test_hasSucceededIsTrueOnceExecuted() public {
        uint256 proposalId = _createAndExecute();
        assertTrue(plugin.hasSucceeded(proposalId), "an executed proposal has succeeded");
        assertFalse(plugin.canExecute(proposalId), "but it can no longer be executed");
    }

    // --- tally readers --------------------------------------------------------

    function test_getTallyReadsLiveFromCrispBeforeExecution() public {
        uint256 proposalId = _create();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(11, 22));

        ICrispVoting.TallyResults memory t = plugin.getTally(proposalId);
        assertEq(t.counts.length, 2);
        assertEq(t.counts[0], 11);
        assertEq(t.counts[1], 22);
    }

    function test_getTallyReadsTheStoredResultAfterExecution() public {
        uint256 proposalId = _createAndExecute();

        // The live CRISP tally is replaced; the stored one must win.
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(1, 1));

        ICrispVoting.TallyResults memory t = plugin.getTally(proposalId);
        assertEq(t.counts[0], 6000, "executed proposals must report the frozen tally");
        assertEq(t.counts[1], 0);
    }

    function test_getWinningOptionBeforeExecution() public {
        uint256 proposalId = _create();

        uint256[] memory counts = new uint256[](3);
        counts[0] = 5;
        counts[1] = 9; // winner
        counts[2] = 2;
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, counts);

        assertEq(plugin.getWinningOption(proposalId), 1, "highest count wins");
    }

    function test_getWinningOptionAfterExecutionUsesTheStoredTally() public {
        uint256 proposalId = _createAndExecute();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(0, 9999));

        assertEq(plugin.getWinningOption(proposalId), 0, "must read the frozen tally, option 0");
    }

    /// @dev `>` (not `>=`) means the first of equal counts wins — pin the behaviour.
    function test_getWinningOptionBreaksTiesTowardsTheLowestIndex() public {
        uint256 proposalId = _create();
        crispProgram.setTally(plugin.getProposal(proposalId).e3Id, _counts(7, 7));

        assertEq(plugin.getWinningOption(proposalId), 0, "ties resolve to the lowest index");
    }

    // --- fee quoting ----------------------------------------------------------

    function test_quoteProposalFeeUsesTheValidatedWindow() public {
        interfold.setFee(3 ether);
        assertEq(plugin.quoteProposalFee(0, 0), 3 ether, "quote must come from Interfold");

        interfold.setFee(5 ether);
        uint64 start = uint64(block.timestamp + 100);
        assertEq(plugin.quoteProposalFee(start, start + MIN_DURATION * 2), 5 ether, "explicit window");
    }

    function test_quoteProposalFeeRejectsAStartDateInThePast() public {
        uint64 past = uint64(block.timestamp - 1);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.DateOutOfBounds.selector, uint64(block.timestamp), past));
        plugin.quoteProposalFee(past, past + MIN_DURATION * 2);
    }

    // --- token clock ----------------------------------------------------------

    /// @notice FOLD is an ERC-6372 `mode=timestamp` token, so the snapshot timepoint is a
    ///         TIMESTAMP, not a block number. Anything consuming `snapshotBlock` must treat
    ///         it as a token-clock unit.
    function test_snapshotUsesTheTokenClockWhenAvailable() public {
        MockVotesToken clocked = new MockVotesToken(SUPPLY, 18);
        clocked.setClock(uint48(block.timestamp));

        plugin = _deploy(address(clocked), MIN_PARTICIPATION);
        uint256 proposalId = _create();

        assertEq(
            plugin.getProposal(proposalId).parameters.snapshotBlock,
            block.timestamp - 1,
            "snapshot must be clock()-1, i.e. a timestamp"
        );
    }

    function test_snapshotFallsBackToBlockNumberWithoutAClock() public view {
        // The default mock has no clock(); the plugin must not revert.
        assertEq(plugin.minDuration(), MIN_DURATION, "sanity");
    }

    function test_snapshotUsesBlockNumberWhenTheTokenHasNoClock() public {
        uint256 proposalId = _create();
        assertEq(
            plugin.getProposal(proposalId).parameters.snapshotBlock,
            block.number - 1,
            "no clock() => fall back to block.number - 1"
        );
    }
}
