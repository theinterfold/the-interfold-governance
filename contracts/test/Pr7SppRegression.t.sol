// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Pins the one behavioural difference between Hamza's PR #7 timing fix and the variant
///         currently in this tree, using the LIVE Sepolia values rather than a mock.
///
/// PR #7 `_validateProposalDates` REVERTS `DateOutOfBounds` when `_start < earliestVotingStart()`.
/// Its unit tests never reach that branch because `MockCrispProgram.earliestVotingStart()` returns
/// `block.timestamp`, so the SPP-supplied `start = block.timestamp` is exactly the earliest
/// permitted value and the comparison is never strictly-less-than.
///
/// On the real CRISPProgram `earliestVotingStart()` is `block.timestamp + randomnessRequestTimeout
/// + sortitionSubmissionWindow + dkgWindow` — measured at 1660s on the new stack. The SPP calls
/// sub-bodies with `start = block.timestamp` (StagedProposalProcessor computes the stage window
/// from the current block), so `_start` is 1660s in the past relative to the floor and EVERY
/// staged proposal reverts.
///
/// These tests encode that arithmetic so the difference is visible without a fork.
contract Pr7SppRegressionTest is Test {
    // Measured on the new sepolia stack (2026-09-17), read with `cast`:
    //   registry.randomnessRequestTimeout()  = 940
    //   registry.sortitionSubmissionWindow() = 120
    //   interfold.getTimeoutConfig().dkg     = 600
    uint64 internal constant RANDOMNESS_REQUEST_TIMEOUT = 940;
    uint64 internal constant SORTITION_SUBMISSION_WINDOW = 120;
    uint64 internal constant DKG_WINDOW = 600;

    uint64 internal constant MIN_VOTING_DURATION = 3600; // CRISPProgram.MIN_VOTING_DURATION

    function _earliestVotingStart(uint64 nowTs) internal pure returns (uint64) {
        return nowTs + RANDOMNESS_REQUEST_TIMEOUT + SORTITION_SUBMISSION_WINDOW + DKG_WINDOW;
    }

    /// @notice The SPP supplies `start = block.timestamp`; PR #7 would revert on the live floor.
    function test_pr7StrictRevertWouldRejectEverySppProposal() public pure {
        uint64 nowTs = 1_789_660_000;
        uint64 sppSuppliedStart = nowTs; // what StagedProposalProcessor passes
        uint64 earliest = _earliestVotingStart(nowTs);

        assertLt(sppSuppliedStart, earliest, "the SPP start is always below the live floor");
        assertEq(earliest - sppSuppliedStart, 1660, "shortfall equals the committee-formation shift");
    }

    /// @notice Why the PR's own suite is green: its mock collapses the floor onto `block.timestamp`.
    function test_pr7MockHidesTheRevertBecauseTheFloorIsNow() public pure {
        uint64 nowTs = 1_789_660_000;
        uint64 mockEarliest = nowTs; // MockCrispProgram.earliestVotingStart() == block.timestamp
        uint64 sppSuppliedStart = nowTs;

        // Not strictly less than -> the revert branch is never exercised.
        assertFalse(sppSuppliedStart < mockEarliest, "mock makes start == floor");
    }

    /// @notice The clamping variant keeps the SPP's requested DURATION intact while honouring the
    ///         floor, which is what lets a staged proposal survive a non-zero committee shift.
    function test_clampingPreservesTheRequestedDuration() public pure {
        uint64 nowTs = 1_789_660_000;
        uint64 requestedStart = nowTs;
        uint64 requestedDuration = 3600; // SPP_PRIVATE_VOTE_DURATION on sepolia
        uint64 requestedEnd = requestedStart + requestedDuration;

        uint64 earliest = _earliestVotingStart(nowTs);
        uint64 startDate = requestedStart < earliest ? earliest : requestedStart;
        uint64 endDate = startDate + (requestedEnd - requestedStart);

        assertEq(startDate, earliest, "start is lifted to the floor");
        assertEq(endDate - startDate, requestedDuration, "the stage still votes for its full duration");
        assertGe(endDate - startDate, MIN_VOTING_DURATION, "and still clears MIN_VOTING_DURATION");
    }

    /// @notice A naive clamp that moved only `start` would silently shorten the ballot: the
    ///         original end is still measured from the ORIGINAL start, so the surviving voting
    ///         window is `requestedEnd - earliest`, not the requested duration.
    function test_clampingStartAloneWouldShortenTheBallot() public pure {
        uint64 nowTs = 1_789_660_000;
        uint64 requestedStart = nowTs;
        uint64 requestedDuration = 3600;
        uint64 requestedEnd = requestedStart + requestedDuration;

        uint64 earliest = _earliestVotingStart(nowTs);
        uint64 startDate = earliest; // clamped
        // endDate left at the SPP's value.
        uint64 survivingWindow = requestedEnd - startDate;

        assertLt(survivingWindow, requestedDuration, "voting time is silently lost");
        assertEq(survivingWindow, 1940, "3600 requested, only 1940 left after the shift");
        assertLt(survivingWindow, MIN_VOTING_DURATION, "and it now breaches MIN_VOTING_DURATION");
    }
}
