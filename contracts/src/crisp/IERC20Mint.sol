// SPDX-License-Identifier: LGPL-3.0-only
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.
pragma solidity >=0.8.27;

interface IERC20Mint {
    /// @notice Mints `amount` tokens to the `to` address.
    /// @param to The address to mint tokens to.
    /// @param amount The amount of tokens to mint.
    function mint(address to, uint256 amount) external;

    function approve(address spender, uint256 amount) external returns (bool);
}
