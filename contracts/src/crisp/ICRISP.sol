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
}
