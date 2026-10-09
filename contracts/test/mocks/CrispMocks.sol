// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {IInterfold} from "../../src/crisp/IInterfold.sol";
import {ICRISP} from "../../src/crisp/ICRISP.sol";
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

/// @notice IVotes-shaped token with configurable supply and ERC-6372 clock.
/// @dev `clock()` drives `_tokenClock()` and can be left unset so the plugin's `block.number`
///      fallback is exercised. `getPastTotalSupply` answers per timepoint once `setSupplyAt`
///      records one, so tests can tell which snapshot a caller read.
contract MockVotesToken {
    uint256 public supply;
    bool internal hasClock;
    uint48 internal clockValue;
    mapping(uint256 => uint256) internal supplyAt;
    mapping(uint256 => bool) internal hasSupplyAt;

    constructor(uint256 _supply) {
        supply = _supply;
    }

    function setSupply(uint256 _supply) external {
        supply = _supply;
    }

    /// @dev Records the total supply `getPastTotalSupply(timepoint)` reports for one timepoint.
    function setSupplyAt(uint256 timepoint, uint256 _supply) external {
        supplyAt[timepoint] = _supply;
        hasSupplyAt[timepoint] = true;
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

    function getPastTotalSupply(uint256 timepoint) external view returns (uint256) {
        return hasSupplyAt[timepoint] ? supplyAt[timepoint] : supply;
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

        uint256[] memory insecureModuli = new uint256[](2);
        insecureModuli[0] = 0xffffee001;
        insecureModuli[1] = 0xffffc4001;
        paramSetRegistry[0] = abi.encode(ICRISP.BfvParameters(512, 100, insecureModuli, "3"));

        uint256[] memory secureModuli = new uint256[](3);
        secureModuli[0] = 0x0800000000db4001;
        secureModuli[1] = 0x0800000000d54001;
        secureModuli[2] = 0x0800000000cbc001;
        paramSetRegistry[2] =
            abi.encode(ICRISP.BfvParameters(8192, 17000000, secureModuli, "17723039943798878305460955570711717478400"));
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function feeToken() external view returns (address) {
        return feeTokenAddr;
    }

    /// @notice Mirrors the coordinator's public `paramSetRegistry` mapping. The plugin decodes the
    ///         BFV parameters registered for its parameter set (plaintext modulus `t`) and hashes
    ///         the bytes into the crypto config id it asserts. Sets 0 and 2 start out as the
    ///         protocol's `BFV_PARAMS.insecure512` and `BFV_PARAMS.secure8192`.
    mapping(uint8 => bytes) public paramSetRegistry;

    function setParamSet(uint8 paramSet, bytes calldata encodedParams) external {
        paramSetRegistry[paramSet] = encodedParams;
    }

    /// @notice The last request's asserted fee limits, so tests can pin what the plugin promises.
    address public lastExpectedFeeToken;
    bytes32 public lastExpectedCryptoConfigId;
    uint256 public lastMaxFee;
    uint256 public lastInputWindowStart;
    uint256 public lastInputWindowEnd;

    function getE3Quote(IInterfold.E3RequestParams calldata) external view returns (uint256) {
        return fee;
    }

    /// @notice The `customParams` of the most recent request, so tests can assert the exact shape
    ///         `CRISPProgram.validate` will decode. Discarding them let the encoding drift
    ///         unnoticed: the plugin builds a tuple no test ever looked at.
    bytes public lastCustomParams;

    /// @notice The E3 parameters of the most recent request, so tests can assert an
    ///         `updateE3Settings` really changes what future requests carry.
    IInterfold.CommitteeSize public lastCommitteeSize;
    uint8 public lastParamSet;
    bytes public lastComputeProviderParams;

    function request(IInterfold.E3RequestParams calldata params) external returns (uint256 e3Id, E3 memory e3) {
        // Pull the fee like the real coordinator does (the plugin forceApproves us).
        MockFeeToken(feeTokenAddr).transferFrom(msg.sender, address(this), fee);
        lastCustomParams = params.customParams;
        lastExpectedFeeToken = address(params.expectedFeeToken);
        lastExpectedCryptoConfigId = params.expectedCryptoConfigId;
        lastMaxFee = params.maxFee;
        lastInputWindowStart = params.inputWindow[0];
        lastInputWindowEnd = params.inputWindow[1];
        lastCommitteeSize = params.committeeSize;
        lastParamSet = params.paramSet;
        lastComputeProviderParams = params.computeProviderParams;
        e3Id = nextE3Id++;
        // Like the coordinator, hand the program the registered parameter bytes so it records the
        // round exactly as `CRISPProgram.validate` does.
        MockCrispProgram(address(params.e3Program))
            .initRound(e3Id, params.customParams, paramSetRegistry[params.paramSet]);
    }
}

/// @notice Records a round the way `CRISPProgram._initRound` / `_initCredits` do for a CUSTOM,
///         ONCHAIN round, including the two reverts that bound the floor and the divisor.
contract MockCrispProgram {
    error VotingPowerDivisorBelowMinimum(uint256 divisor, uint256 minimum);
    error MinVotingPowerBelowScale();

    /// @notice The divisor recorded for each E3 by `initRound`. Tests may overwrite it.
    mapping(uint256 => uint256) public votingPowerDivisorOf;

    /// @notice Overwrites a recorded divisor, to model a program that records something else
    ///         (or nothing, with 0) for an E3.
    function setVotingPowerDivisor(uint256 e3Id, uint256 divisor) external {
        votingPowerDivisorOf[e3Id] = divisor;
    }

    /// @notice The part of `CRISPProgram.validate` that fixes a round's scale. Mirrors
    ///         `_initRound` / `_initCredits` for a CUSTOM round: the snapshot is the token's
    ///         previous ERC-6372 timepoint (`block.number - 1` without `clock()`), the minimum
    ///         divisor is `supply / t + 1`, a requested divisor of 0 records that minimum, and an
    ///         ONCHAIN round whose floor is below the divisor is refused.
    function initRound(uint256 e3Id, bytes calldata customParams, bytes calldata e3ProgramParams) external {
        (address token, uint256 minVotingPower,,,, uint256 censusMode, uint256 requestedDivisor) =
            abi.decode(customParams, (address, uint256, uint256, uint256, uint256, uint256, uint256));
        uint256 plaintextModulus = abi.decode(e3ProgramParams, (ICRISP.BfvParameters)).plaintextModulus;

        uint256 snapshot;
        try MockVotesToken(token).clock() returns (uint48 current) {
            snapshot = current == 0 ? 0 : current - 1;
        } catch {
            snapshot = block.number - 1;
        }

        uint256 minimum = MockVotesToken(token).getPastTotalSupply(snapshot) / plaintextModulus + 1;
        uint256 divisor = requestedDivisor == 0 ? minimum : requestedDivisor;
        if (divisor < minimum) revert VotingPowerDivisorBelowMinimum(divisor, minimum);
        if (censusMode == uint256(ICRISP.CensusMode.ONCHAIN) && minVotingPower < divisor) {
            revert MinVotingPowerBelowScale();
        }

        votingPowerDivisorOf[e3Id] = divisor;
    }

    mapping(uint256 => uint256[]) internal tallies;
    uint256 public votingStartDelay;
    uint256 public availabilityFinalizationWindow = 3 hours;

    function setVotingStartDelay(uint256 delay) external {
        votingStartDelay = delay;
    }

    function setAvailabilityFinalizationWindow(uint256 window) external {
        availabilityFinalizationWindow = window;
    }

    function earliestVotingStart() external view returns (uint256) {
        return block.timestamp + votingStartDelay;
    }

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
