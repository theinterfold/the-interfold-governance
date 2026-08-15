// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

pragma solidity >=0.8.27;

/// @title ICRISP
interface ICRISP {
    /// @notice Decode the tally for a given e3Id
    /// @param e3Id The identifier for the e3 instance
    /// @return The decoded tally results as an array of uint256
    function decodeTally(uint256 e3Id) external view returns (uint256[] memory);

    /// @notice Enum to represent credit modes
    enum CreditMode {
        /// @notice Everyone has constant credits
        CONSTANT,
        /// @notice Credits are custom (can be based on token balance, etc)
        CUSTOM
    }

    /// @notice How the coordinator decides who is allowed to vote in a round.
    ///
    /// @dev Declared per round rather than inferred, because the two are indistinguishable from
    ///      outside and guessing wrong enfranchises the wrong people silently. Governance wants
    ///      TOKEN: eligibility is "held the voting token at the snapshot", which the coordinator
    ///      reconstructs from transfer logs without asking anyone.
    enum CensusMode {
        /// @notice The coordinator derives the electorate from holders of the voting token.
        TOKEN,
        /// @notice The coordinator asks the requesting contract via `getCensus(uint256)`. For
        ///         applications whose electorate is not a token balance — a subset of players, a
        ///         jury — and which therefore cannot be discovered.
        BY_REQUESTER,
        /// @notice No census at all. `CRISPProgram.publishInput` reads each voter's power straight
        ///         from the token at the round's snapshot and hands it to the circuit, so nothing
        ///         has to build or publish a Merkle tree. This is what removes the coordinator
        ///         from the eligibility path.
        ONCHAIN
    }
}
