// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {IInterfold} from "../../src/crisp/IInterfold.sol";
import {IStagedProposalProcessor} from "../../src/crisp/IStagedProposalProcessor.sol";
import {E3} from "../../src/crisp/IE3.sol";

/// @notice Shared test doubles for the CRISP plugin suites.
/// @dev Kept in one place so the Interfold / CRISP / SPP surfaces a test relies on are
///      described once. Each mock implements only what `CrispVoting` actually calls.

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

/// @notice IVotes-shaped token with configurable supply, decimals and ERC-6372 clock.
/// @dev `decimals` drives `_tallyScale()`; `clock()` drives `_tokenClock()`. Both can be
///      made to revert so the plugin's try/catch fallbacks are exercised.
contract MockVotesToken {
    uint256 public supply;
    uint8 internal dec;
    bool internal revertOnDecimals;
    bool internal hasClock;
    uint48 internal clockValue;

    constructor(uint256 _supply, uint8 _decimals) {
        supply = _supply;
        dec = _decimals;
    }

    function setSupply(uint256 _supply) external {
        supply = _supply;
    }

    function setRevertOnDecimals(bool v) external {
        revertOnDecimals = v;
    }

    /// @dev Enables an ERC-6372 timestamp clock, as FOLD (`mode=timestamp`) has.
    function setClock(uint48 _value) external {
        hasClock = true;
        clockValue = _value;
    }

    function clock() external view returns (uint48) {
        require(hasClock, "no clock()");
        return clockValue;
    }

    function decimals() external view returns (uint8) {
        require(!revertOnDecimals, "no decimals()");
        return dec;
    }

    /// @dev Voting power per account, defaulting to 0 so existing tests are unaffected.
    mapping(address => uint256) internal votes;

    function setVotes(address who, uint256 amount) external {
        votes[who] = amount;
    }

    function getVotes(address who) external view returns (uint256) {
        return votes[who];
    }

    function getPastVotes(address who, uint256) external view returns (uint256) {
        return votes[who];
    }

    function getPastTotalSupply(uint256) external view returns (uint256) {
        return supply;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// @notice Pays the whole configured refund to msg.sender, like E3RefundManager.claimRequesterRefund.
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
    uint256 public fee = 10 ether;
    uint256 public nextE3Id = 1;

    constructor(address _feeToken) {
        feeTokenAddr = _feeToken;
        e3RefundManager = address(new MockRefundManager(MockFeeToken(_feeToken)));
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function feeToken() external view returns (address) {
        return feeTokenAddr;
    }

    function getE3Quote(IInterfold.E3RequestParams calldata) external view returns (uint256) {
        return fee;
    }

    function request(IInterfold.E3RequestParams calldata) external returns (uint256 e3Id, E3 memory e3) {
        // Pull the fee like the real coordinator does (the plugin forceApproves us).
        MockFeeToken(feeTokenAddr).transferFrom(msg.sender, address(this), fee);
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

/// @notice Stands in for the SPP: exposes the parent proposal's creator (the fee payer)
///         and records who called reportProposalResult.
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
