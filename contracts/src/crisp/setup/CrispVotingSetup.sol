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

    /// @notice The wildcard grantee understood by OSx's `PermissionManager`. Redeclared here
    ///     because the canonical one is `internal` to `PermissionManager` and therefore not
    ///     reachable from a setup contract. Must stay identical to it.
    address internal constant ANY_ADDR = address(type(uint160).max);

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
        // Decode the installation params. `grantExecuteOnDao` distinguishes the two shapes this plugin is installed in. A
        // standalone process executes its own passed proposals and needs EXECUTE on the DAO; an
        // SPP body must never hold it (see the invariant below). It is an explicit install
        // parameter rather than a permission granted here and revoked by a later wiring step,
        // because a wiring step that is skipped, reverted or forgotten would leave the veto
        // bypassable — and nothing on-chain would say so.
        (
            ICrispVoting.PluginInitParams memory params,
            TokenSettings memory tokenSettings,
            GovernanceERC20.MintSettings memory mintSettings,
            bool grantExecuteOnDao
        ) = abi.decode(
            _installationParams, (ICrispVoting.PluginInitParams, TokenSettings, GovernanceERC20.MintSettings, bool)
        );

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

        // Request permissions. Base set: DAO -> SET_TARGET_CONFIG + MANAGER on the plugin (so
        // governance can point the plugin at the delegatecall Executor and tune voting settings),
        // plus CREATE_PROPOSAL to ANY_ADDR so the process is usable at all. EXECUTE on the DAO is
        // added only for a standalone process, and a mint permission only when a fresh token was
        // deployed.
        //
        // CREATE_PROPOSAL is granted to ANY_ADDR in both shapes: proposal creation is gated by
        // the plugin's own `minProposerVotingPower`, and a proposal created directly on an SPP
        // body is inert, since without EXECUTE it can never act on the DAO. Aragon's SPP wiring
        // narrows it to the SPP address anyway. Withholding it entirely is what left every
        // standalone install unusable: nobody could create a proposal on it, ever.
        //
        // INVARIANT: an SPP body must never receive EXECUTE_PERMISSION on the DAO. If it did, a
        // proposer could execute straight from stage 0 and skip the veto stage entirely.
        uint256 permissionCount = 3;
        if (grantExecuteOnDao) permissionCount++;
        if (tokenSettings.addr == address(0)) permissionCount++;

        PermissionLib.MultiTargetPermission[] memory permissions =
            new PermissionLib.MultiTargetPermission[](permissionCount);

        // The DAO can re-target the plugin's executor (setTargetConfig).
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.SET_TARGET_CONFIG_PERMISSION_ID()
        });

        // The DAO manages the voting settings.
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CrispVoting(plugin).MANAGER_PERMISSION_ID()
        });

        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: ANY_ADDR,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.CREATE_PROPOSAL_PERMISSION_ID()
        });

        uint256 next = 3;

        if (grantExecuteOnDao) {
            permissions[next++] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: _dao,
                who: plugin,
                condition: PermissionLib.NO_CONDITION,
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });
        }

        // Grant the `MINT_PERMISSION_ID` on the token to the DAO if deploying a new token
        if (tokenSettings.addr == address(0)) {
            // Minting is governance-only. This previously granted to ANY_ADDR
            // (`address(type(uint160).max)`) "for testing", which let anyone mint the
            // governance token and therefore manufacture voting power at will.
            permissions[next] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: token,
                who: _dao,
                condition: PermissionLib.NO_CONDITION,
                permissionId: GovernanceERC20(token).MINT_PERMISSION_ID()
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
        // Request reverting the granted permissions. Mirrors `prepareInstallation` exactly: a
        // permission granted there and not revoked here outlives the plugin, and an uninstalled
        // process that still holds EXECUTE on the DAO is a live hole.
        permissions = new PermissionLib.MultiTargetPermission[](4);

        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.SET_TARGET_CONFIG_PERMISSION_ID()
        });

        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.MANAGER_PERMISSION_ID()
        });

        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: ANY_ADDR,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.CREATE_PROPOSAL_PERMISSION_ID()
        });

        // Revoked unconditionally even though an SPP body had it revoked at wiring time: a
        // revoke of a permission that is not held is a no-op, whereas leaving a standalone
        // plugin's EXECUTE in place after uninstall would leave it able to act on the DAO.
        permissions[3] = PermissionLib.MultiTargetPermission({
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
