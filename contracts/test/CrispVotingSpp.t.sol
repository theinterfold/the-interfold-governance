// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {Executor} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {IStagedProposalProcessor} from "../src/crisp/IStagedProposalProcessor.sol";
import {E3} from "../src/crisp/IE3.sol";

// --- Mocks -----------------------------------------------------------------

contract MockFeeToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev IVotes-shaped token: fixed voting power / supply, enough for quorum math.
contract MockVotesToken {
    uint256 public totalSupplyValue = 100;

    function getVotes(address) external pure returns (uint256) {
        return 0; // the SPP holds no votes — proposer power checks must not apply anymore
    }

    function getPastVotes(address, uint256) external pure returns (uint256) {
        return 0;
    }

    function getPastTotalSupply(uint256) external view returns (uint256) {
        return totalSupplyValue;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// @dev Refund manager mock: pays the whole configured refund to msg.sender (the requester),
/// like the real E3RefundManager's claimRequesterRefund.
contract MockRefundManager {
    MockFeeToken internal immutable feeToken;
    mapping(uint256 => uint256) public refunds;
    mapping(uint256 => bool) public claimed;

    constructor(MockFeeToken _feeToken) {
        feeToken = _feeToken;
    }

    function setRefund(uint256 e3Id, uint256 amount) external {
        refunds[e3Id] = amount;
    }

    function claimRequesterRefund(uint256 e3Id) external returns (uint256 amount) {
        require(!claimed[e3Id], "AlreadyClaimed");
        amount = refunds[e3Id];
        require(amount > 0, "NoRefundAvailable");
        claimed[e3Id] = true;
        feeToken.mint(msg.sender, amount);
    }
}

contract MockInterfold {
    address public immutable feeTokenAddr;
    address public e3RefundManager;
    uint256 public constant FEE = 10 ether;
    uint256 public nextE3Id = 1;

    constructor(address _feeToken) {
        feeTokenAddr = _feeToken;
        e3RefundManager = address(new MockRefundManager(MockFeeToken(_feeToken)));
    }

    function feeToken() external view returns (address) {
        return feeTokenAddr;
    }

    function getE3Quote(IInterfold.E3RequestParams calldata) external pure returns (uint256) {
        return FEE;
    }

    function request(IInterfold.E3RequestParams calldata) external returns (uint256 e3Id, E3 memory e3) {
        // Pull the fee like the real coordinator does (the plugin forceApproves us).
        MockFeeToken(feeTokenAddr).transferFrom(msg.sender, address(this), FEE);
        e3Id = nextE3Id++;
    }
}

contract MockCrispProgram {
    mapping(uint256 => uint256[]) internal tallies;

    function setTally(uint256 e3Id, uint256[] memory counts) external {
        tallies[e3Id] = counts;
    }

    function decodeTally(uint256 e3Id) external view returns (uint256[] memory) {
        require(tallies[e3Id].length != 0, "tally not published");
        return tallies[e3Id];
    }
}

/// @dev Stands in for the SPP: exposes the parent proposal's creator (fee payer) and records
/// who called reportProposalResult.
contract MockSpp {
    address public lastReporter;
    uint256 public lastProposalId;
    uint16 public lastStageId;
    uint8 public lastResultType;
    bool public lastTryAdvance;

    mapping(uint256 => address) public creators;

    function setCreator(uint256 sppProposalId, address creator) external {
        creators[sppProposalId] = creator;
    }

    function getProposal(uint256 sppProposalId)
        external
        view
        returns (IStagedProposalProcessor.Proposal memory proposal)
    {
        proposal.creator = creators[sppProposalId];
    }

    function reportProposalResult(uint256 proposalId, uint16 stageId, uint8 resultType, bool tryAdvance) external {
        lastReporter = msg.sender;
        lastProposalId = proposalId;
        lastStageId = stageId;
        lastResultType = resultType;
        lastTryAdvance = tryAdvance;
    }
}

// --- Tests -------------------------------------------------------------------

contract CrispVotingSppTest is Test {
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
    // (allowFailureMap, votingDuration, credits) — votingDuration 0 => use the SPP/stage window.
    bytes internal constant DATA = abi.encode(uint256(0), uint256(0), uint256(0));

    function _data(uint256 votingDuration) internal pure returns (bytes memory) {
        return abi.encode(uint256(0), votingDuration, uint256(0));
    }

    function setUp() public {
        vm.roll(100); // snapshotBlock = block.number - 1 must be sane

        feeToken = new MockFeeToken();
        votesToken = new MockVotesToken();
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

        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(dao)),
            token: address(votesToken),
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(crispProgram),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 1, // deliberately non-zero: must NOT block the SPP anymore
                minVoterVotingPower: 1,
                minParticipation: 50,
                minDuration: MIN_DURATION
            })
        });

        plugin = CrispVoting(
            ProxyLib.deployUUPSProxy(address(new CrispVoting()), abi.encodeCall(CrispVoting.initialize, params))
        );

        // The SPP is the only grantee of CREATE_PROPOSAL (the wiring proposal does this on-chain).
        sppAddr = address(spp);
        dao.grant(address(plugin), sppAddr, plugin.CREATE_PROPOSAL_PERMISSION_ID());
        // The DAO (here: the test, acting as ROOT) can re-target the plugin's executor.
        dao.grant(address(plugin), address(this), plugin.SET_TARGET_CONFIG_PERMISSION_ID());

        // The parent SPP proposal was created by `creator` — the attested fee payer.
        spp.setCreator(SPP_PROPOSAL_ID, creator);
    }

    /// @dev Creator escrows fee credit: mint -> approve -> deposit.
    function _depositAs(address who, uint256 amount) internal {
        feeToken.mint(who, amount);
        vm.startPrank(who);
        feeToken.approve(address(plugin), amount);
        plugin.deposit(amount);
        vm.stopPrank();
    }

    /// @dev The metadata the SPP always sends to sub-bodies.
    function _sppMetadata() internal view returns (bytes memory) {
        return abi.encode(sppAddr, SPP_PROPOSAL_ID, uint16(0));
    }

    function _create() internal returns (uint256 proposalId) {
        Action[] memory actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (0, 1, 1, true))});
        vm.prank(sppAddr);
        proposalId = plugin.createProposal(_sppMetadata(), actions, 0, 0, DATA);
    }

    // --- createProposal gating ---

    function test_createProposalRevertsWithoutPermission() public {
        _depositAs(creator, 100 ether);
        Action[] memory actions = new Action[](0);
        vm.expectRevert(); // DaoUnauthorized
        plugin.createProposal(_sppMetadata(), actions, 0, 0, DATA);
    }

    function test_createProposalIgnoresProposerVotingPower() public {
        // minProposerVotingPower = 1 and the SPP has 0 votes: creation must still succeed.
        _depositAs(creator, 100 ether);
        uint256 proposalId = _create();
        assertEq(plugin.getProposal(proposalId).e3Id, 1);
    }

    /// @notice The property that matters: metadata cannot be forged to make somebody else pay.
    ///         Metadata the caller does not back by actually being the named SPP is treated as a
    ///         direct proposal, where the caller pays from its own escrow — so the named creator's
    ///         credit is never touched. Here the caller (the SPP) holds no voting power and no
    ///         credit, so it is rejected outright.
    function test_createProposalCannotForgeMetadataToSpendAnotherAccountsCredit() public {
        _depositAs(creator, 100 ether);
        Action[] memory actions = new Action[](0);

        // metadata naming a different SPP than the caller
        bytes memory forged = abi.encode(makeAddr("notTheSpp"), SPP_PROPOSAL_ID, uint16(0));
        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, sppAddr));
        plugin.createProposal(forged, actions, 0, 0, DATA);

        // metadata that is not the SPP encoding at all
        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, sppAddr));
        plugin.createProposal(bytes("free-form metadata"), actions, 0, 0, DATA);

        assertEq(plugin.feeCredits(creator), 100 ether, "the named creator's credit must be untouched");
    }

    // --- creator-pays escrow ---

    function test_depositAndWithdraw() public {
        _depositAs(creator, 25 ether);
        assertEq(plugin.feeCredits(creator), 25 ether);
        assertEq(feeToken.balanceOf(address(plugin)), 25 ether);

        vm.prank(creator);
        plugin.withdraw(10 ether);
        assertEq(plugin.feeCredits(creator), 15 ether);
        assertEq(feeToken.balanceOf(creator), 10 ether);

        // cannot withdraw more than credited
        vm.prank(creator);
        vm.expectRevert(); // arithmetic underflow
        plugin.withdraw(16 ether);
    }

    function test_createProposalRevertsWithoutCredit() public {
        Action[] memory actions = new Action[](0);
        vm.prank(sppAddr);
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.InsufficientFeeCredit.selector, creator, 10 ether, 0));
        plugin.createProposal(_sppMetadata(), actions, 0, 0, DATA);
    }

    function test_createProposalHonoursCustomVotingDuration() public {
        _depositAs(creator, 100 ether);

        Action[] memory actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (0, 1, 1, true))});

        // Creator picks a 5x-minDuration window; the SPP-supplied endDate (0 here) is overridden.
        uint64 custom = MIN_DURATION * 5;
        vm.prank(sppAddr);
        uint256 proposalId = plugin.createProposal(_sppMetadata(), actions, 0, 0, _data(custom));

        ICrispVoting.Proposal memory p = plugin.getProposal(proposalId);
        assertEq(p.parameters.endDate - p.parameters.startDate, custom);
    }

    function test_createProposalRevertsOnDurationBelowMinimum() public {
        _depositAs(creator, 100 ether);
        Action[] memory actions = new Action[](0);

        // A sub-minDuration window must revert (DateOutOfBounds), so the UI can't undercut it.
        vm.prank(sppAddr);
        vm.expectRevert();
        plugin.createProposal(_sppMetadata(), actions, 0, 0, _data(MIN_DURATION - 1));
    }

    function test_createProposalChargesSppProposalCreator() public {
        _depositAs(creator, 100 ether);
        uint256 proposalId = _create();

        assertEq(plugin.feeCredits(creator), 90 ether);
        assertEq(plugin.proposalPayer(proposalId), creator);
        assertEq(feeToken.balanceOf(address(interfold)), 10 ether);
        // the rest of the escrow stays on the plugin, still withdrawable
        assertEq(feeToken.balanceOf(address(plugin)), 90 ether);
    }

    // --- claimRefund: failed-E3 refunds are credited back to the payer ---

    function test_claimRefundCreditsPayer() public {
        _depositAs(creator, 10 ether);
        uint256 proposalId = _create();
        uint256 e3Id = plugin.getProposal(proposalId).e3Id;
        assertEq(plugin.feeCredits(creator), 0);

        MockRefundManager(interfold.e3RefundManager()).setRefund(e3Id, 10 ether);

        // permissionless; the credit goes to the recorded payer, never the caller
        vm.prank(makeAddr("randomClaimer"));
        uint256 amount = plugin.claimRefund(proposalId);

        assertEq(amount, 10 ether);
        assertEq(plugin.feeCredits(creator), 10 ether);
        assertEq(plugin.feeCredits(makeAddr("randomClaimer")), 0);

        // and the payer can withdraw it
        vm.prank(creator);
        plugin.withdraw(10 ether);
        assertEq(feeToken.balanceOf(creator), 10 ether);

        // double-claim guarded by the refund manager
        vm.expectRevert("AlreadyClaimed");
        plugin.claimRefund(proposalId);
    }

    function test_claimRefundRevertsForUnknownProposal() public {
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.NonexistentProposal.selector, 123));
        plugin.claimRefund(123);
    }

    // --- hasSucceeded (the SPP's tally staticcall) ---

    function test_hasSucceededTracksTally() public {
        _depositAs(creator, 100 ether);
        uint256 proposalId = _create();
        uint256 e3Id = plugin.getProposal(proposalId).e3Id;

        // no tally yet: the CRISP program reverts, and so does hasSucceeded — the SPP
        // tolerates this via a low-level staticcall (counts as "not succeeded").
        vm.expectRevert("tally not published");
        plugin.hasSucceeded(proposalId);

        // quorum reached (100 votes vs 50% of 100 supply) and yes > no.
        uint256[] memory counts = new uint256[](3);
        counts[0] = 60;
        counts[1] = 30;
        counts[2] = 10;
        crispProgram.setTally(e3Id, counts);
        assertTrue(plugin.hasSucceeded(proposalId));

        // failing tally: yes <= no.
        counts[0] = 30;
        counts[1] = 60;
        crispProgram.setTally(e3Id, counts);
        assertFalse(plugin.hasSucceeded(proposalId));
    }

    // --- execute: permissionless + delegatecall executor keeps msg.sender == plugin ---

    function test_executeIsPermissionlessAndReportsAsPlugin() public {
        _depositAs(creator, 100 ether);
        uint256[] memory counts = new uint256[](3);
        counts[0] = 60;
        counts[1] = 30;
        counts[2] = 10;

        // Point the plugin at the stateless Executor via delegatecall — the SPP-body wiring.
        plugin.setTargetConfig(
            IPlugin.TargetConfig({target: address(executor), operation: IPlugin.Operation.DelegateCall})
        );

        // targetConfig is snapshotted at creation, so create after re-targeting.
        Action[] memory actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (42, 1, 1, true))});
        vm.prank(sppAddr);
        uint256 stagedProposalId = plugin.createProposal(_sppMetadata(), actions, 0, 0, DATA);
        crispProgram.setTally(plugin.getProposal(stagedProposalId).e3Id, counts);

        vm.warp(block.timestamp + MIN_DURATION + 1);

        // anyone can execute — no permission gate anymore
        vm.prank(makeAddr("randomExecutor"));
        plugin.execute(stagedProposalId);

        // The callback must arrive at the SPP with the PLUGIN as msg.sender (delegatecall
        // through the Executor), otherwise the SPP would not credit the body's report.
        assertEq(spp.lastReporter(), address(plugin));
        assertEq(spp.lastProposalId(), 42);
        assertEq(spp.lastResultType(), 1);
        assertTrue(plugin.getProposal(stagedProposalId).executed);
    }
}
