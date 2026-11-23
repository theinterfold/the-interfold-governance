// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

/// @notice Pins the timing budget a 5-day private vote needs against the CRISP program's own
///         `_validateInputTiming` guards and the SPP's advance window.
///
/// @dev Every number here is MEASURED from the `sepolia-protocol-rehearsal` deployment
///      (Interfold `0xD8c916...B053`, CRISP program `0x3ACBC3...43D2`) — not chosen. The point of
///      the test is that the configuration is arithmetically consistent BEFORE a deploy, because
///      each of these failures is silent or expensive:
///
///      - a window below `availabilityFinalizationWindow` -> `InputWindowTooShort` at request time
///      - a commitment deadline inside the first hour   -> `VotingWindowTooShort`
///      - `computeWindow < availabilityFinalizationWindow` -> `ComputeWindowTooShort`
///      - a tally that lands after stage-0 `maxAdvance`  -> a validly tallied vote that can never
///        advance, with the E3 fee already burned
contract SepoliaTimingBudgetTest is Test {
    // --- measured on-chain (sepolia-protocol-rehearsal) ---------------------------
    uint256 internal constant RANDOMNESS_REQUEST_TIMEOUT = 1200; // CiphernodeRegistry
    uint256 internal constant SORTITION_SUBMISSION_WINDOW = 300; // CiphernodeRegistry
    uint256 internal constant DKG_WINDOW = 7200; // getTimeoutConfig[0]
    uint256 internal constant COMPUTE_WINDOW = 21_600; // getTimeoutConfig[1]
    uint256 internal constant DECRYPTION_WINDOW = 21_600; // getTimeoutConfig[2]
    uint256 internal constant AVAILABILITY_FINALIZATION_WINDOW = 10_800; // CRISPProgram

    // --- CRISPProgram constants --------------------------------------------------
    uint256 internal constant MIN_VOTING_DURATION = 3600; // CRISPProgram.MIN_VOTING_DURATION

    // --- the configuration under test --------------------------------------------
    // Two profiles share one timing model. Mainnet is the production target; the Sepolia
    // rehearsal shortens only the spans, never the committee/DA windows, so both must satisfy
    // the same guards. Keep these in step with contracts/.env* — a drift here is a live
    // mis-scheduling, not a test-only detail.
    uint256 internal constant SPP_PRIVATE_VOTE_DURATION = 5 days; // mainnet VOTING span
    uint256 internal constant MINIMUM_DURATION = 1 days; // CRISP plugin floor, voting-only

    /// @dev The Sepolia e2e profile: `SPP_PRIVATE_VOTE_DURATION=3600`, `MINIMUM_DURATION=0`.
    uint256 internal constant SEPOLIA_VOTE_DURATION = 3600;
    uint256 internal constant SEPOLIA_MINIMUM_DURATION = 0;

    uint256 internal constant SPP_ADVANCE_WINDOW = 7 days;

    /// @dev `CRISPProgram.earliestVotingStart()` = now + randomness + sortition + dkg.
    function _earliestStartShift() internal pure returns (uint256) {
        return RANDOMNESS_REQUEST_TIMEOUT + SORTITION_SUBMISSION_WINDOW + DKG_WINDOW;
    }

    /// @dev What `CrispVoting._buildRequestParams` sends Interfold: voting + the avail tail.
    function _inputWindowDuration() internal pure returns (uint256) {
        return SPP_PRIVATE_VOTE_DURATION + AVAILABILITY_FINALIZATION_WINDOW;
    }

    function test_theVotingSpanIsExactlyFiveDays() public pure {
        assertEq(SPP_PRIVATE_VOTE_DURATION, 432_000, "voting must be 5 days");
    }

    /// @notice The Sepolia e2e profile must satisfy every guard the mainnet profile does.
    ///         `MIN_VOTING_DURATION` is 3600 on the live program, so a 1-hour round sits exactly
    ///         on the boundary: `assertGe` is the real contract check, and any shorter Sepolia
    ///         span would revert `VotingWindowTooShort` on-chain rather than fail here.
    function test_theSepoliaProfileClearsTheSameOnChainGuards() public pure {
        assertEq(SEPOLIA_VOTE_DURATION, 3600, "sepolia e2e runs a 1-hour ballot");
        assertGe(SEPOLIA_VOTE_DURATION, SEPOLIA_MINIMUM_DURATION, "INV-37: stage window below the CRISP floor");
        // check 2: ballots stay open at least MIN_VOTING_DURATION after voting opens.
        assertGe(SEPOLIA_VOTE_DURATION, MIN_VOTING_DURATION, "VotingWindowTooShort at the 1h boundary");
        // check 1: the input window is voting + tail, so it must exceed the tail alone.
        assertGt(
            SEPOLIA_VOTE_DURATION + AVAILABILITY_FINALIZATION_WINDOW,
            AVAILABILITY_FINALIZATION_WINDOW,
            "InputWindowTooShort"
        );
        // A zero floor keeps short ad-hoc rounds possible without disabling the guard above.
        assertEq(SEPOLIA_MINIMUM_DURATION, 0, "sepolia floor is 0 by design");
    }

    /// @notice INV-37: the stage window must clear the plugin's own floor, or every private
    ///         createProposal reverts inside the SPP's try/catch and dies silently.
    function test_theStageWindowClearsTheCrispMinimumDuration() public pure {
        assertGe(SPP_PRIVATE_VOTE_DURATION, MINIMUM_DURATION, "INV-37: stage window below the CRISP floor");
    }

    /// @notice `MINIMUM_DURATION` is now a VOTING-only floor: the availability tail is added on
    ///         top by `_buildRequestParams`, so it must not be budgeted inside the minimum.
    function test_theMinimumDurationIsVotingOnlyAndLeavesRoomForTheTail() public pure {
        assertLt(MINIMUM_DURATION, SPP_PRIVATE_VOTE_DURATION, "the floor must not equal the configured span");
        // A voting-only floor plus the tail is what Interfold actually receives for a floor-length
        // round; it must still clear the program's own window check.
        assertGt(
            MINIMUM_DURATION + AVAILABILITY_FINALIZATION_WINDOW,
            AVAILABILITY_FINALIZATION_WINDOW,
            "a floor-length round must leave positive voting time"
        );
    }

    /// @notice `CRISPProgram._validateInputTiming` check 1.
    function test_theInputWindowExceedsTheAvailabilityFinalizationWindow() public pure {
        assertGt(
            _inputWindowDuration(), AVAILABILITY_FINALIZATION_WINDOW, "InputWindowTooShort: the tail fills the window"
        );
    }

    /// @notice `CRISPProgram._validateInputTiming` check 2: ballots must stay open at least
    ///         MIN_VOTING_DURATION after voting opens.
    function test_theCommitmentDeadlineLeavesAtLeastOneHourOfVoting() public pure {
        uint256 commitmentDeadlineOffset = _inputWindowDuration() - AVAILABILITY_FINALIZATION_WINDOW;
        assertEq(commitmentDeadlineOffset, SPP_PRIVATE_VOTE_DURATION, "ballots close exactly at the voting end");
        assertGe(commitmentDeadlineOffset, MIN_VOTING_DURATION, "VotingWindowTooShort");
    }

    /// @notice `CRISPProgram._validateInputTiming` check 3: the compute window must be able to
    ///         absorb a late availability receipt.
    function test_theComputeWindowCoversAnotherFinalizationWindow() public pure {
        assertGe(COMPUTE_WINDOW, AVAILABILITY_FINALIZATION_WINDOW, "ComputeWindowTooShort");
    }

    /// @notice The tally cannot be read until availability finalizes AND compute completes. That
    ///         whole span must fit inside stage-0 `maxAdvance`, measured from the stage start —
    ///         which is `createProposal`, BEFORE the earliestVotingStart shift. Otherwise the vote
    ///         tallies correctly and can never advance.
    function test_theTallyLandsInsideTheStageZeroAdvanceWindow() public pure {
        uint256 tallyReadableAt =
            _earliestStartShift() + SPP_PRIVATE_VOTE_DURATION + AVAILABILITY_FINALIZATION_WINDOW + COMPUTE_WINDOW;
        uint256 maxAdvance = SPP_PRIVATE_VOTE_DURATION + SPP_ADVANCE_WINDOW;

        assertLt(tallyReadableAt, maxAdvance, "the tally would land after stage-0 expiry");
        // Keep a real margin, not a one-second pass: a shrinking buffer here is the warning sign.
        assertGt(maxAdvance - tallyReadableAt, 2 days, "less than 2 days of advance headroom");
    }

    /// @notice The earliestVotingStart shift is ~2.4h on this deployment, NOT "a few hours" of
    ///         DKG alone — it also carries the randomness and sortition windows. It is charged
    ///         against the advance budget, so record the real number.
    function test_theEarliestStartShiftIsTheFullCommitteeSetupCost() public pure {
        assertEq(_earliestStartShift(), 8700, "randomness 1200 + sortition 300 + dkg 7200");
        assertGt(_earliestStartShift(), DKG_WINDOW, "the shift is more than the DKG window alone");
    }

    /// @notice Decryption runs after compute; the full private stage must still fit the advance
    ///         window even when every phase uses its whole budget.
    function test_theWorstCasePrivateStageFitsTheAdvanceWindow() public pure {
        uint256 worstCase = _earliestStartShift() + SPP_PRIVATE_VOTE_DURATION + AVAILABILITY_FINALIZATION_WINDOW
            + COMPUTE_WINDOW + DECRYPTION_WINDOW;
        uint256 maxAdvance = SPP_PRIVATE_VOTE_DURATION + SPP_ADVANCE_WINDOW;
        assertLt(worstCase, maxAdvance, "worst-case private stage outlives stage-0 expiry");
    }
}
