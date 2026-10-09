// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {VotingFaucet} from "../src/testnet/VotingFaucet.sol";
import {MockCrispProgram, MockFeeToken, MockInterfold, MockVotesToken} from "./mocks/CrispMocks.sol";

/// @notice The faucet must hand out exactly the floor a new CRISP proposal requests, so one claim
///         makes a fresh wallet eligible, and stop at `MAX_WEIGHT` floors however the FOLD is held.
contract VotingFaucetTest is Test {
    MockFeeToken internal fold;
    MockFeeToken internal feeToken;
    MockVotesToken internal votesToken;
    VotingFaucet internal faucet;

    address internal alice = makeAddr("alice");

    /// @dev The supply at the previous clock timepoint, the one the plugin's floor reads. The current
    ///      supply differs, so reading the wrong timepoint changes every amount below.
    uint256 internal constant SNAPSHOT_SUPPLY = 1000 ether;
    /// @dev CRISP's floor for `SNAPSHOT_SUPPLY` at the insecure-512 plaintext modulus `t = 100`.
    uint256 internal constant FLOOR = SNAPSHOT_SUPPLY / 100 + 1;
    uint256 internal constant UNIT = FLOOR + FLOOR / 100;
    uint256 internal constant FEE_AMOUNT = 1000e6;

    function setUp() public {
        vm.warp(1_000_000);

        fold = new MockFeeToken();
        feeToken = new MockFeeToken();
        votesToken = new MockVotesToken(5000 ether);
        votesToken.setClock(uint48(block.timestamp));
        votesToken.setSupplyAt(block.timestamp - 1, SNAPSHOT_SUPPLY);
        MockInterfold interfold = new MockInterfold(address(feeToken));

        DAO dao = DAO(
            payable(ProxyLib.deployUUPSProxy(
                    address(new DAO()), abi.encodeCall(DAO.initialize, (bytes(""), address(this), address(0), ""))
                ))
        );
        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(dao)),
            token: address(votesToken),
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(new MockCrispProgram()),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 0,
                minVoterVotingPower: 1,
                minParticipation: 50,
                supportThreshold: 50,
                minDuration: 3600
            })
        });
        CrispVoting plugin = CrispVoting(
            ProxyLib.deployUUPSProxy(address(new CrispVoting()), abi.encodeCall(CrispVoting.initialize, params))
        );

        faucet = new VotingFaucet(plugin, IERC20(address(fold)), IERC20(address(feeToken)), FEE_AMOUNT);
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
        votesToken.setVotes(alice, 2 * UNIT);

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
