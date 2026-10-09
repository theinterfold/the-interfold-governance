// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC6372Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC6372Upgradeable.sol";

import {CrispVoting} from "../crisp/CrispVoting.sol";

/// @notice The layout in which the Interfold coordinator ABI-encodes a parameter set's BFV
///         parameters (`paramSetRegistry`). The faucet reads only `plaintextModulus`.
struct BfvParameters {
    uint256 degree;
    uint256 plaintextModulus;
    uint256[] moduli;
    string error1Variance;
}

/// @title VotingFaucet
/// @notice Testnet faucet for CRISP voters. Each call tops the caller's FOLD up to the next whole
///         multiple of the voting floor plus 1%, to at most `MAX_WEIGHT` floors, and sends
///         `AMOUNT_FEE_TOKEN` fee tokens when the caller holds less than that.
/// @dev The floor is the one `CrispVoting._buildRequestParams` requests for a proposal created now,
///      read from the plugin at call time. The 1% covers small supply growth before the next
///      proposal. FOLD held is wallet FOLD plus `getVotes` on the plugin's voting token (a
///      BondedVotes adapter: locked and bonded FOLD), so locking FOLD does not reopen the faucet.
contract VotingFaucet {
    using SafeERC20 for IERC20;

    /// @notice The most voting floors of FOLD the faucet tops an account up to.
    uint256 public constant MAX_WEIGHT = 5;

    /// @notice The CRISP voting plugin whose floor sets the drop size.
    CrispVoting public immutable plugin;

    /// @notice The token testers lock to vote.
    IERC20 public immutable fold;

    /// @notice The token proposal creators pay the E3 fee with.
    IERC20 public immutable feeToken;

    /// @notice The fee tokens sent to a caller that holds less than this amount.
    uint256 public immutable AMOUNT_FEE_TOKEN;

    /// @notice The caller holds `MAX_WEIGHT` floors of FOLD and at least `AMOUNT_FEE_TOKEN`.
    error NothingToClaim();

    /// @notice The faucet holds less of `token` than the claim needs.
    error FaucetEmpty(IERC20 token);

    constructor(CrispVoting _plugin, IERC20 _fold, IERC20 _feeToken, uint256 _amountFeeToken) {
        plugin = _plugin;
        fold = _fold;
        feeToken = _feeToken;
        AMOUNT_FEE_TOKEN = _amountFeeToken;
    }

    /// @notice Sends the caller `foldShortfall(caller)` FOLD, and `AMOUNT_FEE_TOKEN` fee tokens when
    ///         it holds less than that.
    function faucet() external {
        uint256 foldAmount = foldShortfall(msg.sender);
        bool needsFeeToken = feeToken.balanceOf(msg.sender) < AMOUNT_FEE_TOKEN;
        if (foldAmount == 0 && !needsFeeToken) revert NothingToClaim();

        if (foldAmount != 0) _send(fold, foldAmount);
        if (needsFeeToken) _send(feeToken, AMOUNT_FEE_TOKEN);
    }

    /// @notice The FOLD the next `faucet()` call sends `account`: the amount that lifts its FOLD to
    ///         the next whole multiple of the voting floor plus 1%, or 0 at `MAX_WEIGHT`.
    function foldShortfall(address account) public view returns (uint256) {
        uint256 unit = votingFloor();
        unit += unit / 100;
        uint256 held = fold.balanceOf(account) + plugin.getVotingToken().getVotes(account);
        uint256 weight = held / unit + 1;
        return weight > MAX_WEIGHT ? 0 : weight * unit - held;
    }

    /// @notice The voting power a voter needs in a proposal created now:
    ///         `max(minVoterVotingPower, supply / t + 1)`, with `supply` read at the voting token's
    ///         previous clock timepoint and `t` the plaintext modulus of the plugin's parameter set.
    function votingFloor() public view returns (uint256) {
        IVotesUpgradeable token = plugin.getVotingToken();
        (, uint8 paramSet,) = plugin.getE3Settings();
        uint256 t = abi.decode(plugin.interfold().paramSetRegistry(paramSet), (BfvParameters)).plaintextModulus;
        uint256 divisor = token.getPastTotalSupply(IERC6372Upgradeable(address(token)).clock() - 1) / t + 1;
        uint256 minVoterVotingPower = plugin.minVoterVotingPower();
        return minVoterVotingPower > divisor ? minVoterVotingPower : divisor;
    }

    function _send(IERC20 token, uint256 amount) private {
        if (token.balanceOf(address(this)) < amount) revert FaucetEmpty(token);
        token.safeTransfer(msg.sender, amount);
    }
}
