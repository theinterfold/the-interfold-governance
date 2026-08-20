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

        setup = new CrispVotingSetup(address(new CrispVoting()));
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
                minProposerVotingPower: 0,
                minVoterVotingPower: 0,
                minParticipation: 50,
                supportThreshold: 50,
                minDuration: 3600
            })
        });
    }

    /// @dev Defaults to the SPP-body shape (no EXECUTE on the DAO), which is what the Interfold
    ///      deployment installs and what the invariant tests below are about.
    function _encode(address tokenAddr) internal view returns (bytes memory) {
        return _encode(tokenAddr, false);
    }

    function _encode(address tokenAddr, bool grantExecuteOnDao) internal view returns (bytes memory) {
        return abi.encode(_params(tokenAddr), tokenAddr, grantExecuteOnDao);
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

    /// @notice There is deliberately NO wrap fallback: a silently wrapped voting token would
    ///         leave every holder unable to vote until they wrapped, so a non-IVotes token
    ///         fails the install loudly instead of installing something subtly broken.
    function test_prepareInstallationRejectsANonIVotesErc20InsteadOfWrapping() public {
        address token = address(new MockPlainErc20());
        assertFalse(setup.supportsIVotesInterface(token), "plain ERC20 is not IVotes");

        vm.expectRevert(abi.encodeWithSelector(CrispVotingSetup.TokenNotIVotes.selector, token));
        setup.prepareInstallation(address(dao), _encode(token));
    }

    /// @notice There is deliberately NO fresh-token path either: `address(0)` used to mean
    ///         "deploy a GovernanceERC20 for me" and now simply fails the contract check, so
    ///         the setup can never mint a voting token (and never needs a MINT permission).
    function test_prepareInstallationRejectsTheZeroAddressFreshTokenRequest() public {
        vm.expectRevert(abi.encodeWithSelector(CrispVotingSetup.TokenNotContract.selector, address(0)));
        setup.prepareInstallation(address(dao), _encode(address(0)));
    }

    // --- permission surface ---

    function test_prepareInstallationGrantsOnlySettingsPermissionsForAnExistingToken() public {
        address token = address(new MockVotesErc20());
        (address plugin, IPluginSetup.PreparedSetupData memory data) =
            setup.prepareInstallation(address(dao), _encode(token));

        assertEq(data.permissions.length, 3, "existing token, SPP body => settings pair + metadata, nothing else");

        for (uint256 i = 0; i < data.permissions.length; i++) {
            assertEq(uint8(data.permissions[i].operation), uint8(PermissionLib.Operation.Grant), "must be a grant");
            assertEq(data.permissions[i].where, plugin, "must target the plugin");
            assertEq(data.permissions[i].who, address(dao), "every SPP-body grant is the DAO's");
        }

        assertEq(data.permissions[0].permissionId, setup.crispVotingBase().SET_TARGET_CONFIG_PERMISSION_ID());
        assertEq(data.permissions[1].permissionId, CrispVoting(plugin).MANAGER_PERMISSION_ID());
        assertEq(data.permissions[2].permissionId, setup.crispVotingBase().SET_METADATA_PERMISSION_ID());
    }

    /// @notice The invariant that makes the SPP veto stage non-bypassable: the body
    ///         must never request EXECUTE_PERMISSION on the DAO. If it did, a proposer
    ///         could execute straight from stage 0 and skip the foundation entirely.
    function test_prepareInstallationNeverRequestsExecutePermissionOnTheDao() public {
        bytes32 executePermission = keccak256("EXECUTE_PERMISSION");

        address[1] memory tokens = [address(new MockVotesErc20())];
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

    /// @notice CREATE_PROPOSAL is shape-dependent (INV-3). A standalone process grants it to
    ///         ANY_ADDR (gated by `minProposerVotingPower`) or nobody could ever propose; an SPP
    ///         body grants it to NOBODY at install — the wiring grants the SPP, and an ANY_ADDR
    ///         wildcard would let a direct creator front-run the SPP's deterministic sub-proposal
    ///         id and brick the parent proposal.
    function test_prepareInstallationGrantsCreateProposalToAnyAddrOnlyStandalone() public {
        bytes32 createProposal = keccak256("CREATE_PROPOSAL_PERMISSION");
        address token = address(new MockVotesErc20());

        // SPP-body shape: no CREATE_PROPOSAL grant of any kind.
        (, IPluginSetup.PreparedSetupData memory bodyData) = setup.prepareInstallation(address(dao), _encode(token));
        for (uint256 j = 0; j < bodyData.permissions.length; j++) {
            assertTrue(
                bodyData.permissions[j].permissionId != createProposal,
                "an SPP body must not grant CREATE_PROPOSAL at install; the wiring grants the SPP"
            );
        }

        // Standalone shape: granted to ANY_ADDR on the plugin.
        (address plugin, IPluginSetup.PreparedSetupData memory data) =
            setup.prepareInstallation(address(dao), _encode(token, true));

        bool found;
        for (uint256 j = 0; j < data.permissions.length; j++) {
            if (data.permissions[j].permissionId == createProposal) {
                found = true;
                assertEq(data.permissions[j].who, address(type(uint160).max), "must be granted to ANY_ADDR");
                assertEq(data.permissions[j].where, plugin, "granted on the plugin");
            }
        }
        assertTrue(found, "a standalone install must grant CREATE_PROPOSAL to ANY_ADDR");
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

    /// @notice Minting is not merely governance-gated any more — the mint path is GONE. The
    ///         setup once granted MINT to ANY_ADDR "for testing" (anyone could manufacture
    ///         voting power), then to the DAO only; the lean setup deploys no token at all,
    ///         so no install, in either shape, may request a mint permission on anything.
    function test_prepareInstallationNeverRequestsAMintPermission() public {
        address token = address(new MockVotesErc20());
        bool[2] memory shapes = [false, true];
        for (uint256 i = 0; i < shapes.length; i++) {
            (address plugin, IPluginSetup.PreparedSetupData memory data) =
                setup.prepareInstallation(address(dao), _encode(token, shapes[i]));

            for (uint256 j = 0; j < data.permissions.length; j++) {
                assertTrue(
                    data.permissions[j].permissionId != keccak256("MINT_PERMISSION"),
                    "no install shape may request a mint permission"
                );
                assertTrue(data.permissions[j].where != token, "no permission may target the voting token");
                assertTrue(
                    data.permissions[j].where == plugin || data.permissions[j].where == address(dao),
                    "grants only on the plugin or the DAO"
                );
            }
        }
    }

    // --- uninstallation ---

    function test_prepareUninstallationRevokesExactlyWhatInstallGranted() public {
        address token = address(new MockVotesErc20());
        (address plugin,) = setup.prepareInstallation(address(dao), _encode(token));

        PermissionLib.MultiTargetPermission[] memory revoked = setup.prepareUninstallation(
            address(dao), IPluginSetup.SetupPayload({plugin: plugin, currentHelpers: new address[](0), data: bytes("")})
        );

        assertEq(revoked.length, 5, "every permission install grants must be revoked");
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

        assertEq(revoked[4].permissionId, setup.crispVotingBase().SET_METADATA_PERMISSION_ID());
        assertEq(revoked[4].where, plugin);
        assertEq(revoked[4].who, address(dao));

        // Revoked unconditionally: a no-op for an SPP body that never held it, and the difference
        // between a clean uninstall and a plugin that can still act on the DAO for a standalone one.
        assertEq(revoked[3].permissionId, keccak256("EXECUTE_PERMISSION"));
        assertEq(revoked[3].where, address(dao));
        assertEq(revoked[3].who, plugin);
    }
}
