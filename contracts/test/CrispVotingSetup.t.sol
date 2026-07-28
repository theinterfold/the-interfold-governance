// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPluginSetup, PermissionLib} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";
import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "@aragon/token-voting-plugin/erc20/GovernanceWrappedERC20.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

// --- Mocks -----------------------------------------------------------------

/// @dev Plain ERC20: has balanceOf, but none of the IVotes surface, so the setup
///      must wrap it in a GovernanceWrappedERC20.
contract MockPlainErc20 {
    mapping(address => uint256) public balanceOf;

    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }
}

/// @dev A contract that is not an ERC20 at all — `balanceOf` reverts.
contract MockNotErc20 {
    function balanceOf(address) external pure returns (uint256) {
        revert("not a token");
    }
}

/// @dev IVotes-shaped token: used directly, never wrapped.
contract MockVotesErc20 {
    mapping(address => uint256) public balanceOf;

    function getPastTotalSupply(uint256) external pure returns (uint256) {
        return 0;
    }

    function getVotes(address) external pure returns (uint256) {
        return 0;
    }

    function getPastVotes(address, uint256) external pure returns (uint256) {
        return 0;
    }
}

contract MockInterfoldMinimal {
    function feeToken() external view returns (address) {
        return address(this);
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
}

// --- Tests -----------------------------------------------------------------

/// @notice Covers `CrispVotingSetup`, the install/uninstall permission surface.
///         These grants decide who can mint the governance token and who can
///         re-point the plugin's executor, so they are the highest-consequence
///         code in the repo.
contract CrispVotingSetupTest is Test {
    /// @dev Aragon's wildcard grantee. A permission granted here applies to EVERY address.
    address internal constant ANY_ADDR = address(type(uint160).max);

    DAO internal dao;
    CrispVotingSetup internal setup;
    MockInterfoldMinimal internal interfold;

    function setUp() public {
        dao = DAO(
            payable(ProxyLib.deployUUPSProxy(
                    address(new DAO()), abi.encodeCall(DAO.initialize, (bytes(""), address(this), address(0), ""))
                ))
        );

        interfold = new MockInterfoldMinimal();

        setup = new CrispVotingSetup(
            new GovernanceERC20(
                IDAO(address(dao)), "base", "BASE", GovernanceERC20.MintSettings(new address[](0), new uint256[](0))
            ),
            new GovernanceWrappedERC20(IERC20Upgradeable(address(new MockPlainErc20())), "wbase", "WBASE"),
            address(new CrispVoting())
        );
    }

    function _params(address token) internal view returns (ICrispVoting.PluginInitParams memory params) {
        params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(0)), // overwritten by the setup
            token: token, // overwritten by the setup
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(0xC0FFEE),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 0, minVoterVotingPower: 0, minParticipation: 50, minDuration: 3600
            })
        });
    }

    function _encode(address tokenAddr) internal view returns (bytes memory) {
        address[] memory receivers = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        return abi.encode(
            _params(tokenAddr),
            CrispVotingSetup.TokenSettings({addr: tokenAddr, name: "Interfold", symbol: "FOLD"}),
            GovernanceERC20.MintSettings({receivers: receivers, amounts: amounts})
        );
    }

    // --- token handling ---

    function test_prepareInstallationRevertsWhenTokenIsNotAContract() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(CrispVotingSetup.TokenNotContract.selector, eoa));
        setup.prepareInstallation(address(dao), _encode(eoa));
    }

    function test_prepareInstallationRevertsWhenTokenIsNotErc20() public {
        address notToken = address(new MockNotErc20());
        vm.expectRevert(abi.encodeWithSelector(CrispVotingSetup.TokenNotERC20.selector, notToken));
        setup.prepareInstallation(address(dao), _encode(notToken));
    }

    function test_prepareInstallationUsesAnIVotesTokenDirectly() public {
        address token = address(new MockVotesErc20());
        assertTrue(setup.supportsIVotesInterface(token), "should detect IVotes");

        (address plugin,) = setup.prepareInstallation(address(dao), _encode(token));
        assertEq(address(CrispVoting(plugin).getVotingToken()), token, "IVotes token must be used unwrapped");
    }

    function test_prepareInstallationWrapsAPlainErc20() public {
        address token = address(new MockPlainErc20());
        assertFalse(setup.supportsIVotesInterface(token), "plain ERC20 is not IVotes");

        (address plugin,) = setup.prepareInstallation(address(dao), _encode(token));
        address used = address(CrispVoting(plugin).getVotingToken());
        assertTrue(used != token, "plain ERC20 must be wrapped");
        assertEq(address(GovernanceWrappedERC20(used).underlying()), token, "wrapper must point at the original");
    }

    // --- permission surface ---

    function test_prepareInstallationGrantsOnlySettingsPermissionsForAnExistingToken() public {
        address token = address(new MockVotesErc20());
        (address plugin, IPluginSetup.PreparedSetupData memory data) =
            setup.prepareInstallation(address(dao), _encode(token));

        assertEq(data.permissions.length, 2, "existing token => no mint permission");

        for (uint256 i = 0; i < data.permissions.length; i++) {
            assertEq(uint8(data.permissions[i].operation), uint8(PermissionLib.Operation.Grant), "must be a grant");
            assertEq(data.permissions[i].where, plugin, "must target the plugin");
            assertEq(data.permissions[i].who, address(dao), "only the DAO may hold these");
        }

        assertEq(data.permissions[0].permissionId, setup.crispVotingBase().SET_TARGET_CONFIG_PERMISSION_ID());
        assertEq(data.permissions[1].permissionId, CrispVoting(plugin).MANAGER_PERMISSION_ID());
    }

    /// @notice The invariant that makes the SPP veto stage non-bypassable: the body
    ///         must never request EXECUTE_PERMISSION on the DAO. If it did, a proposer
    ///         could execute straight from stage 0 and skip the foundation entirely.
    function test_prepareInstallationNeverRequestsExecutePermissionOnTheDao() public {
        bytes32 executePermission = keccak256("EXECUTE_PERMISSION");

        address[2] memory tokens = [address(new MockVotesErc20()), address(0)];
        for (uint256 t = 0; t < tokens.length; t++) {
            (, IPluginSetup.PreparedSetupData memory data) = setup.prepareInstallation(address(dao), _encode(tokens[t]));

            for (uint256 i = 0; i < data.permissions.length; i++) {
                assertTrue(
                    data.permissions[i].permissionId != executePermission,
                    "the CRISP body must never be granted EXECUTE_PERMISSION"
                );
                assertTrue(data.permissions[i].where != address(dao), "no permission may target the DAO itself");
            }
        }
    }

    /// @notice Minting must be governance-gated. This previously granted to ANY_ADDR
    ///         "for testing", which would have let anyone mint the governance token and
    ///         manufacture voting power.
    function test_prepareInstallationGrantsMintToTheDaoOnlyNeverToAnyAddr() public {
        (, IPluginSetup.PreparedSetupData memory data) = setup.prepareInstallation(address(dao), _encode(address(0)));

        assertEq(data.permissions.length, 3, "fresh token => mint permission is also granted");

        PermissionLib.MultiTargetPermission memory mintPerm = data.permissions[2];
        assertEq(mintPerm.permissionId, keccak256("MINT_PERMISSION"), "third grant must be the mint permission");
        assertEq(mintPerm.who, address(dao), "mint must be granted to the DAO");
        assertTrue(mintPerm.who != ANY_ADDR, "mint must NEVER be granted to ANY_ADDR");
    }

    // --- uninstallation ---

    function test_prepareUninstallationRevokesExactlyWhatInstallGranted() public {
        address token = address(new MockVotesErc20());
        (address plugin,) = setup.prepareInstallation(address(dao), _encode(token));

        PermissionLib.MultiTargetPermission[] memory revoked = setup.prepareUninstallation(
            address(dao), IPluginSetup.SetupPayload({plugin: plugin, currentHelpers: new address[](0), data: bytes("")})
        );

        assertEq(revoked.length, 2, "both plugin permissions must be revoked");
        for (uint256 i = 0; i < revoked.length; i++) {
            assertEq(uint8(revoked[i].operation), uint8(PermissionLib.Operation.Revoke), "must be a revoke");
            assertEq(revoked[i].where, plugin, "must target the plugin");
            assertEq(revoked[i].who, address(dao), "must revoke from the DAO");
        }

        assertEq(revoked[0].permissionId, setup.crispVotingBase().SET_TARGET_CONFIG_PERMISSION_ID());
        assertEq(revoked[1].permissionId, setup.crispVotingBase().MANAGER_PERMISSION_ID());
    }
}
