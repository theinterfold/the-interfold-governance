// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.29;

import {IInterfold} from "./IInterfold.sol";

/// @title InterfoldCryptoConfig
/// @notice The crypto config ids that Interfold v0.20 admits for a request. A request asserts the id
///         of its parameter set and committee size, and `Interfold.request` reverts
///         `CryptoConfigChanged` when the id differs from `ActiveCryptoConfig.configIdForRequest`.
/// @dev Mirrors `BfvProtocol` (parameter-set indices and `SS_*_CONFIG_ID`) and
///      `ActiveCryptoConfig.configIdForRequest` of the Interfold v0.20.0 contracts. A protocol
///      release that changes these ids needs a new plugin build.
library InterfoldCryptoConfig {
    /// @notice The plugin's parameter set or committee size has no crypto config in this release.
    error UnsupportedCryptoConfig(uint8 paramSet, IInterfold.CommitteeSize committeeSize);

    /// @notice `secure-8192`, the only parameter set mainnet accepts.
    uint8 internal constant SECURE_PARAM_SET = 3;
    /// @notice `insecure-64`, accepted on Sepolia and local chains only.
    uint8 internal constant INSECURE_PARAM_SET = 4;

    bytes32 internal constant SS_INSECURE_64_MINIMUM_CONFIG_ID =
        0xd76c4f521394e6cbe1df28036cc5dd5590c6630a403525b5c2b052f9b91507f4;
    bytes32 internal constant SS_INSECURE_64_MICRO_CONFIG_ID =
        0x893989231b402942b005fecdbf9eae21b227d861085433293d0873547ea2816a;
    bytes32 internal constant SS_INSECURE_64_SMALL_CONFIG_ID =
        0x7fa922a08c5501592d02394205bb600219da3e168e0432f076465569116ccfe3;
    bytes32 internal constant SS_INSECURE_64_LARGE_CONFIG_ID =
        0xf7cd0828ce1f727085f5553ae162547513928ca5dc58d3799a49fa1e4591ce77;
    bytes32 internal constant SS_SECURE_8192_MINIMUM_CONFIG_ID =
        0x0acc89be9b1f39b0c1ee06493af3bad6f5685bf60e0f1cec7a733e95caaab87a;
    bytes32 internal constant SS_SECURE_8192_MICRO_CONFIG_ID =
        0xebe75e3c1ada2079e5a06e5853d710b67ac296959c6b67f7d82b44312574dd0b;
    bytes32 internal constant SS_SECURE_8192_SMALL_CONFIG_ID =
        0x41d2f2a41bfb17dfb292332d8283b3a9238f9fa8fdc4eecf87de4d777f95c891;
    bytes32 internal constant SS_SECURE_8192_LARGE_CONFIG_ID =
        0xf8ddf924e1ef60bf63d14a2bb39c7c259b4b054e75f6e2baf07bb268462d13ed;

    /// @notice The crypto config id that a request for `paramSet` and `committeeSize` must assert.
    /// @dev The id says nothing about whether the coordinator can form the committee: a size
    ///      without a threshold or verifier routes on the chain still fails at `request`.
    function configIdForRequest(uint8 paramSet, IInterfold.CommitteeSize committeeSize)
        internal
        pure
        returns (bytes32)
    {
        if (paramSet == INSECURE_PARAM_SET) {
            return _forCommittee(
                committeeSize,
                SS_INSECURE_64_MINIMUM_CONFIG_ID,
                SS_INSECURE_64_MICRO_CONFIG_ID,
                SS_INSECURE_64_SMALL_CONFIG_ID,
                SS_INSECURE_64_LARGE_CONFIG_ID
            );
        }
        if (paramSet == SECURE_PARAM_SET) {
            return _forCommittee(
                committeeSize,
                SS_SECURE_8192_MINIMUM_CONFIG_ID,
                SS_SECURE_8192_MICRO_CONFIG_ID,
                SS_SECURE_8192_SMALL_CONFIG_ID,
                SS_SECURE_8192_LARGE_CONFIG_ID
            );
        }
        revert UnsupportedCryptoConfig(paramSet, committeeSize);
    }

    function _forCommittee(
        IInterfold.CommitteeSize committeeSize,
        bytes32 minimum,
        bytes32 micro,
        bytes32 small,
        bytes32 large
    ) private pure returns (bytes32) {
        if (committeeSize == IInterfold.CommitteeSize.Minimum) return minimum;
        if (committeeSize == IInterfold.CommitteeSize.Micro) return micro;
        if (committeeSize == IInterfold.CommitteeSize.Small) return small;
        return large;
    }
}
