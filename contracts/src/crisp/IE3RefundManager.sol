// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

/// @notice Minimal view of Interfold's E3RefundManager: when an E3 fails, the REQUESTER
/// (the CrispVoting plugin, since it called `interfold.request`) can claim its share of
/// the original payment back. The refund manager transfers to `msg.sender`, so the tokens
/// land back in the plugin's fee pot.
interface IE3RefundManager {
    /// @notice Requester claims their refund for a failed E3.
    /// @param e3Id The failed E3 ID.
    /// @return amount The amount claimed.
    function claimRequesterRefund(uint256 e3Id) external returns (uint256 amount);
}
