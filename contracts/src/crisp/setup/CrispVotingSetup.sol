// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {IDAO, DAO} from "@aragon/osx/core/dao/DAO.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IPluginSetup, PluginSetup, PermissionLib} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "@aragon/token-voting-plugin/erc20/GovernanceWrappedERC20.sol";

import {CrispVoting} from "../CrispVoting.sol";
import {ICrispVoting} from "../ICrispVoting.sol";

/// @title CrispVotingSetup
/// @notice Manages the installation and unintallation of the CRISP plugin on a DAO.
/// @dev Release 1, Build 1
contract CrispVotingSetup is PluginSetup {
    using Address for address;
    using Clones for address;

    /// @notice The address of the `CrispVoting` base contract.
    // solhint-disable-next-line immutable-vars-naming
    CrispVoting public immutable crispVotingBase;

    /// @notice The address of the `GovernanceERC20` base contract.
    // solhint-disable-next-line immutable-vars-naming
    address public immutable governanceERC20Base;

    /// @notice The address of the `GovernanceWrappedERC20` base contract.
    // solhint-disable-next-line immutable-vars-naming
    address public immutable governanceWrappedERC20Base;

    /// @notice Configuration settings for a token used within the governance system.
    /// @param addr The token address. If set to `address(0)`, a new
    /// `GovernanceERC20` token is deployed.
    ///     If the address implements `IVotes`, it will be used directly; otherwise,
    ///     it is wrapped as `GovernanceWrappedERC20`.
    /// @param name The name of the token.
    /// @param symbol The symbol of the token.
    struct TokenSettings {
        address addr;
        string name;
        string symbol;
    }

    /// @notice Thrown if the passed token address is not a token contract.
    /// @param token The token address
    error TokenNotContract(address token);

    /// @notice Thrown if token address is not ERC20.
    /// @param token The token address
    error TokenNotERC20(address token);

    /// @notice The contract constructor deploying the plugin implementation contract
    ///     and receiving the governance token base contracts to clone from.
    /// @dev The implementation address is used to deploy UUPS proxies referencing it and
    /// to verify the plugin on the respective block explorers.
    /// @param _governanceERC20Base The base `GovernanceERC20` contract to create clones from.
    /// @param _governanceWrappedERC20Base The base `GovernanceWrappedERC20` contract to create
    /// clones from.
    /// @param _crispVoting The base `CrispVoting` implementation address
    constructor(
        GovernanceERC20 _governanceERC20Base,
        GovernanceWrappedERC20 _governanceWrappedERC20Base,
        address _crispVoting
    ) PluginSetup(_crispVoting) {
        crispVotingBase = CrispVoting(IMPLEMENTATION);
        governanceERC20Base = address(_governanceERC20Base);
        governanceWrappedERC20Base = address(_governanceWrappedERC20Base);
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(address _dao, bytes memory _installationParams)
        external
        returns (address plugin, PreparedSetupData memory preparedSetupData)
    {
        // Decode the installation params. `foundation` receives EXECUTE_PROPOSAL_PERMISSION_ID
        // (veto power over execution).
        (
            ICrispVoting.PluginInitParams memory params,
            TokenSettings memory tokenSettings,
            GovernanceERC20.MintSettings memory mintSettings,
            address foundation
        ) = abi.decode(
            _installationParams, (ICrispVoting.PluginInitParams, TokenSettings, GovernanceERC20.MintSettings, address)
        );

        require(foundation != address(0), "CrispVotingSetup: foundation is the zero address");

        address token = tokenSettings.addr;

        if (tokenSettings.addr != address(0)) {
            if (!token.isContract()) {
                revert TokenNotContract(token);
            }

            if (!_isERC20(token)) {
                revert TokenNotERC20(token);
            }

            if (!supportsIVotesInterface(token)) {
                token = governanceWrappedERC20Base.clone();
                // User already has a token. We need to wrap it in
                // GovernanceWrappedERC20 in order to make the token
                // include governance functionality.
                GovernanceWrappedERC20(token)
                    .initialize(IERC20Upgradeable(tokenSettings.addr), tokenSettings.name, tokenSettings.symbol);
            }
        } else {
            // Clone a `GovernanceERC20`.
            token = governanceERC20Base.clone();
            GovernanceERC20(token).initialize(IDAO(_dao), tokenSettings.name, tokenSettings.symbol, mintSettings);
        }

        params.dao = IDAO(_dao);
        params.token = token;

        // 1) Upgradeable plugin variant
        plugin = ProxyLib.deployUUPSProxy(implementation(), abi.encodeCall(CrispVoting.initialize, params));

        // Request permissions. Base set: plugin -> EXECUTE on DAO, foundation -> EXECUTE_PROPOSAL
        // on the plugin. Plus a mint permission when a fresh token was deployed.
        PermissionLib.MultiTargetPermission[] memory permissions =
            new PermissionLib.MultiTargetPermission[](tokenSettings.addr != address(0) ? 2 : 3);

        // The pugin has EXECUTE_PERMISSION_ID on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _dao,
            who: plugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });

        // The foundation holds EXECUTE_PROPOSAL_PERMISSION_ID on the plugin (veto power).
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: foundation,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CrispVoting(plugin).EXECUTE_PROPOSAL_PERMISSION_ID()
        });

        // Grant the `MINT_PERMISSION_ID` on the token to the DAO if deploying a new token
        if (tokenSettings.addr == address(0)) {
            bytes32 tokenMintPermission = GovernanceERC20(token).MINT_PERMISSION_ID();

            permissions[2] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: token,
                /// @notice For testing only, we are going to allow anyone to mint. This should be set to the DAO instead
                /// who: _dao,
                who: address(type(uint160).max),
                condition: PermissionLib.NO_CONDITION,
                permissionId: tokenMintPermission
            });
        }

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(address _dao, SetupPayload calldata _payload)
        external
        view
        returns (PermissionLib.MultiTargetPermission[] memory permissions)
    {
        // Request reverting the granted permissions
        permissions = new PermissionLib.MultiTargetPermission[](1);

        // the plugin has the Execute permission on the DAO. This needs to be revoked.
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _payload.plugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
    }

    /// @notice Unsatisfiably determines if the token is an IVotes interface.
    /// @dev Many tokens don't use ERC165 even though they still support IVotes.
    function supportsIVotesInterface(address token) public view returns (bool) {
        (bool success1, bytes memory data1) =
            token.staticcall(abi.encodeWithSelector(IVotesUpgradeable.getPastTotalSupply.selector, 0));
        (bool success2, bytes memory data2) =
            token.staticcall(abi.encodeWithSelector(IVotesUpgradeable.getVotes.selector, address(this)));
        (bool success3, bytes memory data3) =
            token.staticcall(abi.encodeWithSelector(IVotesUpgradeable.getPastVotes.selector, address(this), 0));

        return
            (success1 && data1.length == 0x20 && success2 && data2.length == 0x20 && success3 && data3.length == 0x20);
    }

    /// @notice Unsatisfiably determines if the contract is an ERC20 token.
    /// @dev It's important to first check whether token is a contract prior to this call.
    /// @param token The token address
    function _isERC20(address token) private view returns (bool) {
        (bool success, bytes memory data) =
            token.staticcall(abi.encodeCall(IERC20Upgradeable.balanceOf, (address(this))));
        return success && data.length == 0x20;
    }
}
