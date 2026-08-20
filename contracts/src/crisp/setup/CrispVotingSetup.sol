// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {IDAO, DAO} from "@aragon/osx/core/dao/DAO.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IPluginSetup, PluginSetup, PermissionLib} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {CrispVoting} from "../CrispVoting.sol";
import {ICrispVoting} from "../ICrispVoting.sol";

/// @title CrispVotingSetup
/// @notice Manages the installation and unintallation of the CRISP plugin on a DAO.
/// @dev Release 1, Build 1.
///
///      Deliberately LEANER than the canonical TokenVotingSetup pattern it descends from: there
///      is no fresh-token deployment and no GovernanceWrappedERC20 wrap path. The plugin only
///      installs against an EXISTING IVotes token, and a token that fails the probe REVERTS the
///      install instead of being silently wrapped — a wrapped voting token would disenfranchise
///      every holder until they wrapped, which the deployment runbook treats as a bug. Removing
///      the paths removes the two base contracts they needed and makes the wrong outcome
///      unrepresentable rather than merely unlikely.
contract CrispVotingSetup is PluginSetup {
    using Address for address;

    /// @notice The address of the `CrispVoting` base contract.
    // solhint-disable-next-line immutable-vars-naming
    CrispVoting public immutable crispVotingBase;

    /// @notice The wildcard grantee understood by OSx's `PermissionManager`. Redeclared here
    ///     because the canonical one is `internal` to `PermissionManager` and therefore not
    ///     reachable from a setup contract. Must stay identical to it.
    address internal constant ANY_ADDR = address(type(uint160).max);

    /// @notice Thrown if the passed token address is not a token contract.
    /// @param token The token address
    error TokenNotContract(address token);

    /// @notice Thrown if token address is not ERC20.
    /// @param token The token address
    error TokenNotERC20(address token);

    /// @notice Thrown when the voting token does not answer the IVotes probe. There is no wrap
    /// fallback on purpose: installing a silently wrapped token would leave every holder unable
    /// to vote until they wrapped, so the install fails loudly instead.
    /// @param token The token address
    error TokenNotIVotes(address token);

    /// @notice The contract constructor referencing the plugin implementation contract.
    /// @dev The implementation address is used to deploy UUPS proxies referencing it and
    /// to verify the plugin on the respective block explorers.
    /// @param _crispVoting The base `CrispVoting` implementation address
    constructor(address _crispVoting) PluginSetup(_crispVoting) {
        crispVotingBase = CrispVoting(IMPLEMENTATION);
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
        (ICrispVoting.PluginInitParams memory params, address token, bool grantExecuteOnDao) =
            abi.decode(_installationParams, (ICrispVoting.PluginInitParams, address, bool));

        // An EXISTING IVotes token, or no install. `address(0)` fails the contract check, and a
        // token that cannot answer the IVotes probe reverts rather than being wrapped — the
        // probe passing is exactly what the post-install `getVotingToken()` runbook check
        // re-verifies from outside.
        if (!token.isContract()) {
            revert TokenNotContract(token);
        }

        if (!_isERC20(token)) {
            revert TokenNotERC20(token);
        }

        if (!supportsIVotesInterface(token)) {
            revert TokenNotIVotes(token);
        }

        params.dao = IDAO(_dao);
        params.token = token;

        // 1) Upgradeable plugin variant
        plugin = ProxyLib.deployUUPSProxy(implementation(), abi.encodeCall(CrispVoting.initialize, params));

        // Request permissions. Base set: DAO -> SET_TARGET_CONFIG + MANAGER + SET_METADATA on
        // the plugin (so governance can point the plugin at the delegatecall Executor, tune
        // voting settings and name the body). EXECUTE on the DAO and CREATE_PROPOSAL to ANY_ADDR
        // are added only for a standalone process. There is no mint permission: this setup never
        // deploys a token.
        //
        // CREATE_PROPOSAL is shape-dependent, and the SPP-body shape grants it to NOBODY here.
        // The wiring step grants it to the SPP (INV-3: proposals are created on the SPP, which
        // spawns the sub-proposal). Granting ANY_ADDR "because the wiring narrows it" was wrong
        // twice over: nothing ever revoked the wildcard, and a direct creator could front-run
        // the SPP's deterministic sub-proposal id in the same block, bricking the parent
        // proposal (its creation revert is swallowed by the SPP's try/catch). Only a standalone
        // install — where no SPP exists to gate creation — gets the ANY_ADDR grant, and there
        // the plugin's own `minProposerVotingPower` check is the gate.
        //
        // INVARIANT: an SPP body must never receive EXECUTE_PERMISSION on the DAO. If it did, a
        // proposer could execute straight from stage 0 and skip the veto stage entirely.
        uint256 permissionCount = 3;
        if (grantExecuteOnDao) permissionCount += 2;

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

        // The DAO names (and can later rename) the body: the same DAO-governed metadata surface
        // the SPP and canonical TokenVoting expose, read by the Aragon app.
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.SET_METADATA_PERMISSION_ID()
        });

        if (grantExecuteOnDao) {
            permissions[3] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: _dao,
                who: plugin,
                condition: PermissionLib.NO_CONDITION,
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });

            permissions[4] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Grant,
                where: plugin,
                who: ANY_ADDR,
                condition: PermissionLib.NO_CONDITION,
                permissionId: crispVotingBase.CREATE_PROPOSAL_PERMISSION_ID()
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
        permissions = new PermissionLib.MultiTargetPermission[](5);

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

        // Revoked unconditionally even though only the standalone shape granted it (the staged
        // shape's CREATE_PROPOSAL goes to the SPP at wiring time, which governance revokes when
        // it rewires): revoking a permission that is not held is a no-op.
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: ANY_ADDR,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.CREATE_PROPOSAL_PERMISSION_ID()
        });

        permissions[4] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: crispVotingBase.SET_METADATA_PERMISSION_ID()
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
