// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {BfvParameters, VotingFaucet} from "../src/testnet/VotingFaucet.sol";
import {MockFeeToken} from "./mocks/CrispMocks.sol";

/// @notice Plays the three contracts the faucet reads the floor from: the CRISP plugin, the
///         Interfold parameter registry (`t = 100`) and the timestamp-clock voting token.
/// @dev Like OpenZeppelin `Votes`, `getPastTotalSupply` refuses the current timepoint, so a faucet
///      that read the live supply instead of the plugin's snapshot reverts here.
contract FloorSource {
    uint256 internal immutable supply;
    mapping(address => uint256) public getVotes;

    constructor(uint256 _supply) {
        supply = _supply;
    }

    function setVotes(address account, uint256 votes) external {
        getVotes[account] = votes;
    }

    function getVotingToken() external view returns (address) {
        return address(this);
    }

    function getE3Settings() external pure returns (uint8, uint8, bytes memory) {
        return (0, 0, "");
    }

    function interfold() external view returns (address) {
        return address(this);
    }

    function minVoterVotingPower() external pure returns (uint256) {
        return 1;
    }

    function paramSetRegistry(uint8) external pure returns (bytes memory) {
        return abi.encode(BfvParameters(512, 100, new uint256[](0), "3"));
    }

    function clock() external view returns (uint48) {
        return uint48(block.timestamp);
    }

    function getPastTotalSupply(uint256 timepoint) external view returns (uint256) {
        require(timepoint < block.timestamp, "future lookup");
        return supply;
    }
}

/// @notice The faucet must hand out exactly the floor a new CRISP proposal requests, so one claim
///         makes a fresh wallet eligible, and stop at `MAX_WEIGHT` floors however the FOLD is held.
contract VotingFaucetTest is Test {
    MockFeeToken internal fold;
    MockFeeToken internal feeToken;
    FloorSource internal source;
    VotingFaucet internal faucet;

    address internal alice = makeAddr("alice");

    uint256 internal constant SUPPLY = 1000 ether;
    /// @dev CRISP's floor for `SUPPLY` at the insecure-512 plaintext modulus `t = 100`.
    uint256 internal constant FLOOR = SUPPLY / 100 + 1;
    uint256 internal constant UNIT = FLOOR + FLOOR / 100;
    uint256 internal constant FEE_AMOUNT = 1000e6;

    function setUp() public {
        vm.warp(1_000_000);

        fold = new MockFeeToken();
        feeToken = new MockFeeToken();
        source = new FloorSource(SUPPLY);

        faucet = new VotingFaucet(
            CrispVoting(address(source)), IERC20(address(fold)), IERC20(address(feeToken)), FEE_AMOUNT
        );
        fold.mint(address(faucet), 100 * UNIT);
        feeToken.mint(address(faucet), 10 * FEE_AMOUNT);
    }

    function test_FirstClaimSendsTheFloorPlusOnePercent() public {
        vm.prank(alice);
        faucet.faucet();

        assertEq(fold.balanceOf(alice), UNIT);
        assertEq(feeToken.balanceOf(alice), FEE_AMOUNT);
    }

    function test_ClaimsCountLockedFoldAndStopAtMaxWeight() public {
        // Alice holds half a floor in her wallet and two floors locked.
        fold.mint(alice, UNIT / 2);
        source.setVotes(alice, 2 * UNIT);

        vm.startPrank(alice);
        faucet.faucet();
        faucet.faucet();
        faucet.faucet();
        // Wallet plus locked FOLD is now five floors: no more FOLD.
        assertEq(fold.balanceOf(alice), 3 * UNIT);
        assertEq(faucet.foldShortfall(alice), 0);

        // At the cap only the fee token still tops up.
        feeToken.transfer(address(0xdead), FEE_AMOUNT);
        faucet.faucet();
        assertEq(fold.balanceOf(alice), 3 * UNIT);
        assertEq(feeToken.balanceOf(alice), FEE_AMOUNT);

        vm.expectRevert(VotingFaucet.NothingToClaim.selector);
        faucet.faucet();
        vm.stopPrank();
    }

    function test_RevertsWhenTheFaucetCannotCoverTheShortfall() public {
        vm.prank(address(faucet));
        fold.transfer(address(0xdead), 99 * UNIT + 1);

        vm.expectRevert(abi.encodeWithSelector(VotingFaucet.FaucetEmpty.selector, address(fold)));
        vm.prank(alice);
        faucet.faucet();
    }
}
