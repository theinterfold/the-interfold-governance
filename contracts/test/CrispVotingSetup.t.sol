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

    /// @notice Mirrors the real coordinator's `activeCryptoConfigId`, which the plugin reads when
    ///         building request params. Absent, every proposal path reverts.
    bytes32 public activeCryptoConfigId = keccak256("mock-crypto-config");

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

    /// @dev Defaults to the SPP-body shape (no EXECUTE on the DAO), which is what the Interfold
    ///      deployment installs and what the invariant tests below are about.
    function _encode(address tokenAddr) internal view returns (bytes memory) {
        return _encode(tokenAddr, false);
    }

    function _encode(address tokenAddr, bool grantExecuteOnDao) internal view returns (bytes memory) {
        address[] memory receivers = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        return abi.encode(
            _params(tokenAddr),
            CrispVotingSetup.TokenSettings({addr: tokenAddr, name: "Interfold", symbol: "FOLD"}),
            GovernanceERC20.MintSettings({receivers: receivers, amounts: amounts}),
            grantExecuteOnDao
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

        assertEq(data.permissions.length, 3, "existing token, SPP body => settings pair + CREATE_PROPOSAL");

        for (uint256 i = 0; i < data.permissions.length; i++) {
            assertEq(uint8(data.permissions[i].operation), uint8(PermissionLib.Operation.Grant), "must be a grant");
            assertEq(data.permissions[i].where, plugin, "must target the plugin");
        }

        // The settings pair is governance-only; proposal creation deliberately is not.
        assertEq(data.permissions[0].who, address(dao), "SET_TARGET_CONFIG is the DAO's");
        assertEq(data.permissions[1].who, address(dao), "MANAGER is the DAO's");
        assertEq(data.permissions[2].who, ANY_ADDR, "CREATE_PROPOSAL is open, subject to voting power");

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

    /// @notice A standalone process must be able to create proposals AND execute the ones that
    ///         pass, or installing it through the app produces an inert DAO. This is the case the
    ///         plugin was never installed in before: every deployment so far went through the SPP.
    function test_prepareInstallationGrantsCreateProposalToAnyAddrInBothShapes() public {
        bytes32 createProposal = keccak256("CREATE_PROPOSAL_PERMISSION");
        address token = address(new MockVotesErc20());

        bool[2] memory shapes = [false, true];
        for (uint256 i = 0; i < shapes.length; i++) {
            (address plugin, IPluginSetup.PreparedSetupData memory data) =
                setup.prepareInstallation(address(dao), _encode(token, shapes[i]));

            bool found;
            for (uint256 j = 0; j < data.permissions.length; j++) {
                if (data.permissions[j].permissionId == createProposal) {
                    found = true;
                    assertEq(data.permissions[j].who, address(type(uint160).max), "must be granted to ANY_ADDR");
                    assertEq(data.permissions[j].where, plugin, "granted on the plugin");
                }
            }
            assertTrue(found, "CREATE_PROPOSAL must be granted in both shapes");
        }
    }

    /// @notice The standalone counterpart of the invariant above: with the flag set, and only
    ///         then, the plugin may execute on the DAO.
    function test_prepareInstallationGrantsExecuteOnlyForAStandaloneProcess() public {
        bytes32 executePermission = keccak256("EXECUTE_PERMISSION");
        address token = address(new MockVotesErc20());

        (address plugin, IPluginSetup.PreparedSetupData memory data) =
            setup.prepareInstallation(address(dao), _encode(token, true));

        bool found;
        for (uint256 i = 0; i < data.permissions.length; i++) {
            if (data.permissions[i].permissionId == executePermission) {
                found = true;
                assertEq(data.permissions[i].where, address(dao), "EXECUTE is granted on the DAO");
                assertEq(data.permissions[i].who, plugin, "EXECUTE is granted to the plugin");
            }
        }
        assertTrue(found, "a standalone process must be able to execute its own proposals");
    }

    /// @notice Minting must be governance-gated. This previously granted to ANY_ADDR
    ///         "for testing", which would have let anyone mint the governance token and
    ///         manufacture voting power.
    function test_prepareInstallationGrantsMintToTheDaoOnlyNeverToAnyAddr() public {
        (, IPluginSetup.PreparedSetupData memory data) = setup.prepareInstallation(address(dao), _encode(address(0)));

        assertEq(data.permissions.length, 4, "fresh token => mint permission is also granted");

        // [0] SET_TARGET_CONFIG, [1] MANAGER, [2] CREATE_PROPOSAL, [3] MINT
        PermissionLib.MultiTargetPermission memory mintPerm = data.permissions[3];
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

        assertEq(revoked.length, 4, "every permission install grants must be revoked");
        for (uint256 i = 0; i < revoked.length; i++) {
            assertEq(uint8(revoked[i].operation), uint8(PermissionLib.Operation.Revoke), "must be a revoke");
        }

        assertEq(revoked[0].permissionId, setup.crispVotingBase().SET_TARGET_CONFIG_PERMISSION_ID());
        assertEq(revoked[0].where, plugin);
        assertEq(revoked[0].who, address(dao));

        assertEq(revoked[1].permissionId, setup.crispVotingBase().MANAGER_PERMISSION_ID());
        assertEq(revoked[1].where, plugin);
        assertEq(revoked[1].who, address(dao));

        assertEq(revoked[2].permissionId, keccak256("CREATE_PROPOSAL_PERMISSION"));
        assertEq(revoked[2].where, plugin);
        assertEq(revoked[2].who, ANY_ADDR);

        // Revoked unconditionally: a no-op for an SPP body that never held it, and the difference
        // between a clean uninstall and a plugin that can still act on the DAO for a standalone one.
        assertEq(revoked[3].permissionId, keccak256("EXECUTE_PERMISSION"));
        assertEq(revoked[3].where, address(dao));
        assertEq(revoked[3].who, plugin);
    }
}
