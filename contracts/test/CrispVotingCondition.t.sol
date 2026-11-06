// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPluginSetup, PermissionLib} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {IPermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/IPermissionCondition.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {
    DaoAuthorizableUpgradeable
} from "@aragon/osx-commons-contracts/src/permission/auth/DaoAuthorizableUpgradeable.sol";
import {RuledCondition} from "@aragon/osx-commons-contracts/src/permission/condition/extensions/RuledCondition.sol";
import {Executor} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {IStagedProposalProcessor} from "../src/crisp/IStagedProposalProcessor.sol";
import {WireSppScript} from "../script/WireSpp.s.sol";
import {MockCrispProgram, MockFeeToken, MockInterfold, MockSpp, MockVotesAndBalanceToken} from "./mocks/CrispMocks.sol";

/// @dev Stands in for a hostile contract on a standalone install: it names itself as the SPP and
///      attests that `victim` created the parent proposal.
contract SppSpoofer {
    address public victim;

    constructor(address _victim) {
        victim = _victim;
    }

    function getProposal(uint256) external view returns (IStagedProposalProcessor.Proposal memory proposal) {
        proposal.creator = victim;
    }

    function spoof(CrispVoting plugin) external returns (uint256) {
        return plugin.createProposal(
            abi.encode(address(this), uint256(1), uint16(0)), new Action[](0), 0, 0, abi.encode(uint256(0))
        );
    }
}

/// @dev Mirror of Aragon's `SPPRuleCondition` (staged-proposal-processor-plugin v1.1): the helper the
///      SPP's CREATE_PROPOSAL permission is granted behind. No rules admit everyone; otherwise rule 0
///      decides. The source is not a dependency of this repo, so the parts the tests rely on are
///      reproduced.
contract MirrorSppRuleCondition is DaoAuthorizableUpgradeable, RuledCondition {
    bytes32 public constant UPDATE_RULES_PERMISSION_ID = keccak256("UPDATE_RULES_PERMISSION");

    constructor(address _dao) {
        initialize(_dao);
    }

    function initialize(address _dao) public initializer {
        __DaoAuthorizableUpgradeable_init(IDAO(_dao));
    }

    function isGranted(address _where, address _who, bytes32 _permissionId, bytes calldata)
        external
        view
        returns (bool)
    {
        if (getRules().length == 0) return true;
        return _evalRule(0, _where, _who, _permissionId, new uint256[](0));
    }

    function updateRules(Rule[] calldata _rules) public auth(UPDATE_RULES_PERMISSION_ID) {
        _updateRules(_rules);
    }
}

contract CreationRuleHarness is WireSppScript {
    function ruleAction(address rulesCondition, address bodyCondition) external pure returns (Action memory) {
        return creationRuleAction(rulesCondition, bodyCondition);
    }
}

/// @notice Covers the proposal-creation condition `CrispVotingSetup` returns at `helpers[0]`. In a
///         staged process the SPP trusts it to decide who may create a proposal by voting power,
///         because `CrispVoting` skips its own `minProposerVotingPower` check for SPP calls.
contract CrispVotingConditionTest is Test {
    address internal constant ANY_ADDR = address(type(uint160).max);
    uint256 internal constant MIN_PROPOSER = 100 ether;
    uint256 internal constant SPP_PROPOSAL_ID = 777;

    DAO internal dao;
    CrispVotingSetup internal setup;
    MockVotesAndBalanceToken internal token;
    MockFeeToken internal feeToken;
    MockInterfold internal interfold;
    MockCrispProgram internal crispProgram;
    MockSpp internal spp;
    Executor internal executor;

    address internal creator;

    function setUp() public {
        vm.roll(100);

        dao = DAO(
            payable(ProxyLib.deployUUPSProxy(
                    address(new DAO()), abi.encodeCall(DAO.initialize, (bytes(""), address(this), address(0), ""))
                ))
        );

        token = new MockVotesAndBalanceToken();
        feeToken = new MockFeeToken();
        interfold = new MockInterfold(address(feeToken));
        crispProgram = new MockCrispProgram();
        spp = new MockSpp();
        executor = new Executor();
        creator = makeAddr("creator");

        setup = new CrispVotingSetup(address(new CrispVoting()));
    }

    function _install(bool grantExecuteOnDao, uint256 minProposerVotingPower)
        internal
        returns (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data)
    {
        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(0)), // overwritten by the setup
            token: address(0), // overwritten by the setup
            interfold: address(interfold),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(crispProgram),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: minProposerVotingPower,
                minVoterVotingPower: 1,
                minParticipation: 50,
                supportThreshold: 50,
                minDuration: 3600
            })
        });

        address pluginAddress;
        (pluginAddress, data) =
            setup.prepareInstallation(address(dao), abi.encode(params, address(token), grantExecuteOnDao));
        plugin = CrispVoting(pluginAddress);

        // The PluginSetupProcessor's apply step; the test contract is ROOT on the DAO.
        dao.applyMultiTargetPermissions(data.permissions);
    }

    function _condition(IPluginSetup.PreparedSetupData memory data) internal pure returns (IPermissionCondition) {
        return IPermissionCondition(data.helpers[0]);
    }

    function _isGranted(IPermissionCondition condition, address who) internal view returns (bool) {
        return condition.isGranted(address(spp), who, keccak256("CREATE_PROPOSAL_PERMISSION"), bytes(""));
    }

    // --- the helper ---

    /// @notice The layout the Aragon app reads: exactly one helper, the condition, at index 0.
    function test_prepareInstallationReturnsTheConditionAsTheOnlyHelperInBothShapes() public {
        bool[2] memory shapes = [false, true];
        for (uint256 i = 0; i < shapes.length; i++) {
            (, IPluginSetup.PreparedSetupData memory data) = _install(shapes[i], MIN_PROPOSER);

            assertEq(data.helpers.length, 1, "helpers[0] is the condition and nothing else");
            assertGt(data.helpers[0].code.length, 0, "the condition must be deployed");
            assertTrue(
                IERC165(data.helpers[0]).supportsInterface(type(IPermissionCondition).interfaceId),
                "the helper must be an OSx IPermissionCondition"
            );
        }
    }

    /// @notice Each install gets its own condition, bound to its own plugin: the same account is
    ///         judged against each plugin's own `minProposerVotingPower`.
    function test_conditionIsWiredToItsOwnPlugin() public {
        (, IPluginSetup.PreparedSetupData memory strictData) = _install(false, 100 ether);
        (, IPluginSetup.PreparedSetupData memory laxData) = _install(false, 5 ether);
        assertTrue(strictData.helpers[0] != laxData.helpers[0], "one condition per install");

        token.setVotes(creator, 50 ether);

        assertFalse(_isGranted(_condition(strictData), creator), "50 < 100 on the strict plugin");
        assertTrue(_isGranted(_condition(laxData), creator), "50 >= 5 on the lax plugin");
    }

    function test_conditionGrantsAtOrAboveMinProposerVotingPowerAndDeniesBelow() public {
        (, IPluginSetup.PreparedSetupData memory data) = _install(false, MIN_PROPOSER);
        IPermissionCondition condition = _condition(data);

        token.setVotes(creator, MIN_PROPOSER - 1);
        assertFalse(_isGranted(condition, creator), "one wei below the minimum");

        token.setVotes(creator, MIN_PROPOSER);
        assertTrue(_isGranted(condition, creator), "exactly the minimum");

        token.setVotes(creator, MIN_PROPOSER + 1);
        assertTrue(_isGranted(condition, creator), "above the minimum");

        assertFalse(_isGranted(condition, makeAddr("stranger")), "no voting power");
    }

    /// @notice The condition applies the plugin's own rule, not Aragon's: a holder with tokens but
    ///         no snapshot voting power (undelegated, or just borrowed) is refused, because the
    ///         direct creation path refuses them too.
    function test_conditionIgnoresLiveVotesAndBalance() public {
        (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data) = _install(false, MIN_PROPOSER);
        IPermissionCondition condition = _condition(data);

        token.setBalance(creator, 10 * MIN_PROPOSER);
        assertFalse(_isGranted(condition, creator), "a balance alone confers nothing");

        token.setLiveVotes(creator, 10 * MIN_PROPOSER);
        assertFalse(_isGranted(condition, creator), "votes borrowed after the snapshot confer nothing");
        assertFalse(plugin.isProposerEligible(creator), "and the plugin's own rule agrees");

        token.setVotes(creator, MIN_PROPOSER);
        assertTrue(_isGranted(condition, creator), "snapshot votes do");
    }

    /// @notice The condition, the plugin's view and the direct creation path are one rule: wherever
    ///         the condition admits an account, a direct creation is not refused for eligibility.
    function test_conditionMatchesThePluginsDirectCreationRule() public {
        (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data) = _install(true, MIN_PROPOSER);
        IPermissionCondition condition = _condition(data);
        vm.prank(address(dao));
        plugin.setTargetConfig(IPlugin.TargetConfig({target: address(executor), operation: IPlugin.Operation.Call}));

        uint256[3] memory powers = [MIN_PROPOSER - 1, MIN_PROPOSER, MIN_PROPOSER + 1];
        for (uint256 i = 0; i < powers.length; i++) {
            token.setVotes(creator, powers[i]);
            assertEq(_isGranted(condition, creator), plugin.isProposerEligible(creator), "view == condition");

            vm.prank(creator);
            if (powers[i] < MIN_PROPOSER) {
                vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, creator));
            } else {
                vm.expectRevert(
                    abi.encodeWithSelector(ICrispVoting.InsufficientFeeCredit.selector, creator, 10 ether, 0)
                );
            }
            plugin.createProposal("", new Action[](0), 0, 0, abi.encode(uint256(0)));
        }
    }

    /// @notice Both install shapes record which one they are; the plugin trusts SPP attestations
    ///         only in the staged one.
    function test_setupRecordsTheInstallShapeInThePlugin() public {
        (CrispVoting body,) = _install(false, MIN_PROPOSER);
        (CrispVoting standalone,) = _install(true, MIN_PROPOSER);

        assertTrue(body.isStagedBody(), "an SPP body is staged");
        assertFalse(standalone.isStagedBody(), "a standalone process is not");
    }

    /// @notice A standalone install grants CREATE_PROPOSAL to ANY_ADDR, so a hostile contract can
    ///         name itself as the SPP and attest that a victim created the parent proposal. The
    ///         attestation must carry no weight there: the caller is treated as a direct creator.
    function test_standaloneInstallIgnoresASpoofedSppAttestation() public {
        (CrispVoting plugin,) = _install(true, MIN_PROPOSER);
        vm.prank(address(dao));
        plugin.setTargetConfig(IPlugin.TargetConfig({target: address(executor), operation: IPlugin.Operation.Call}));

        address victim = makeAddr("victim");
        feeToken.mint(victim, 100 ether);
        vm.startPrank(victim);
        feeToken.approve(address(plugin), 100 ether);
        plugin.deposit(100 ether);
        vm.stopPrank();

        SppSpoofer attacker = new SppSpoofer(victim);

        // The attacker holds no voting power: refused as a direct creator, victim untouched.
        vm.expectRevert(abi.encodeWithSelector(ICrispVoting.ProposalCreationForbidden.selector, address(attacker)));
        attacker.spoof(plugin);
        assertEq(plugin.feeCredits(victim), 100 ether, "the victim's credit is untouched");

        // With power but no credit of its own it still cannot bill the victim.
        token.setVotes(address(attacker), MIN_PROPOSER);
        vm.expectRevert(
            abi.encodeWithSelector(ICrispVoting.InsufficientFeeCredit.selector, address(attacker), 10 ether, 0)
        );
        attacker.spoof(plugin);
        assertEq(plugin.feeCredits(victim), 100 ether, "the victim's credit is still untouched");

        // With power and credit it pays for itself, never the victim.
        feeToken.mint(address(attacker), 100 ether);
        vm.startPrank(address(attacker));
        feeToken.approve(address(plugin), 100 ether);
        plugin.deposit(100 ether);
        vm.stopPrank();
        uint256 proposalId = attacker.spoof(plugin);

        assertEq(plugin.proposalPayer(proposalId), address(attacker), "the caller is the payer");
        assertEq(plugin.feeCredits(victim), 100 ether, "the victim's credit is never spent");
        assertEq(plugin.feeCredits(address(attacker)), 90 ether, "the attacker paid the fee");
    }

    /// @notice The condition reads the plugin on every call, so a governance change to
    ///         `minProposerVotingPower` applies to it immediately, in both directions.
    function test_conditionFollowsLaterMinProposerVotingPowerChanges() public {
        (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data) = _install(false, MIN_PROPOSER);
        IPermissionCondition condition = _condition(data);
        token.setVotes(creator, 150 ether);
        assertTrue(_isGranted(condition, creator));

        _setMinProposer(plugin, 200 ether);
        assertFalse(_isGranted(condition, creator), "raised above the creator's power");

        _setMinProposer(plugin, 150 ether);
        assertTrue(_isGranted(condition, creator), "lowered to exactly the creator's power");

        _setMinProposer(plugin, 0);
        assertTrue(_isGranted(condition, makeAddr("stranger")), "disabled");
    }

    function _setMinProposer(CrispVoting plugin, uint256 minProposerVotingPower) internal {
        // The DAO holds MANAGER_PERMISSION on the plugin from the install.
        vm.prank(address(dao));
        plugin.updateVotingSettings(
            ICrispVoting.VotingSettings({
                minProposerVotingPower: minProposerVotingPower,
                minVoterVotingPower: 1,
                minParticipation: 50,
                supportThreshold: 50,
                minDuration: 3600
            })
        );
    }

    // --- uninstall ---

    /// @notice Nothing grants the condition, so uninstall has nothing extra to revoke: the same
    ///         five revokes come back whether or not the payload carries the helper.
    function test_prepareUninstallationIgnoresTheHelperAndRevokesTheSameFivePermissions() public {
        (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data) = _install(true, MIN_PROPOSER);

        PermissionLib.MultiTargetPermission[] memory withoutHelpers = setup.prepareUninstallation(
            address(dao),
            IPluginSetup.SetupPayload({plugin: address(plugin), currentHelpers: new address[](0), data: ""})
        );
        PermissionLib.MultiTargetPermission[] memory withHelpers = setup.prepareUninstallation(
            address(dao), IPluginSetup.SetupPayload({plugin: address(plugin), currentHelpers: data.helpers, data: ""})
        );

        assertEq(withHelpers.length, 5);
        assertEq(abi.encode(withHelpers), abi.encode(withoutHelpers), "helpers do not change the revokes");
        for (uint256 i = 0; i < withHelpers.length; i++) {
            assertEq(withHelpers[i].condition, PermissionLib.NO_CONDITION, "no revoke references the condition");
            assertTrue(withHelpers[i].who != data.helpers[0], "the condition is never a permission party");
        }
    }

    // --- SPP-shaped install ---

    /// @notice The staged flow end to end: an SPP-body install, the SPP granted CREATE_PROPOSAL as
    ///         the wiring does, the helper used as the SPP's creation rule, and a sub-proposal
    ///         created by the SPP. The body must not re-check voting power against the SPP
    ///         (which holds none), so only the helper restricts the creator.
    function test_sppShapedInstallStillCreatesSubProposals() public {
        (CrispVoting plugin, IPluginSetup.PreparedSetupData memory data) = _install(false, MIN_PROPOSER);

        // Wiring: the SPP alone may create on the body, and the body runs through the Executor.
        dao.grant(address(plugin), address(spp), plugin.CREATE_PROPOSAL_PERMISSION_ID());
        vm.prank(address(dao));
        plugin.setTargetConfig(
            IPlugin.TargetConfig({target: address(executor), operation: IPlugin.Operation.DelegateCall})
        );

        // The SPP's own creation rule is the helper, as the Aragon app builds it.
        bytes32 sppCreatePermission = keccak256("CREATE_PROPOSAL_PERMISSION");
        dao.grantWithCondition(address(spp), ANY_ADDR, sppCreatePermission, _condition(data));

        token.setVotes(creator, MIN_PROPOSER - 1);
        assertFalse(dao.isGranted(address(spp), creator, sppCreatePermission, ""), "below minimum: SPP rule refuses");

        token.setVotes(creator, MIN_PROPOSER);
        assertTrue(dao.isGranted(address(spp), creator, sppCreatePermission, ""), "at minimum: SPP rule admits");

        // The SPP, holding no voting power itself, creates the sub-proposal charged to `creator`.
        spp.setCreator(SPP_PROPOSAL_ID, creator);
        feeToken.mint(creator, 100 ether);
        vm.startPrank(creator);
        feeToken.approve(address(plugin), 100 ether);
        plugin.deposit(100 ether);
        vm.stopPrank();

        Action[] memory actions = new Action[](1);
        actions[0] =
            Action({to: address(spp), value: 0, data: abi.encodeCall(MockSpp.reportProposalResult, (0, 1, 1, true))});
        vm.prank(address(spp));
        uint256 proposalId = plugin.createProposal(
            abi.encode(address(spp), SPP_PROPOSAL_ID, uint16(0)), actions, 0, 0, abi.encode(uint256(0))
        );

        assertEq(plugin.getProposal(proposalId).e3Id, 1, "the E3 was requested");
        assertEq(plugin.proposalPayer(proposalId), creator, "the SPP proposal's creator pays");
    }

    // --- the SPP's creation rule ---

    /// @notice The private install wires the body's condition as the SPP's only creation rule. Before
    ///         that action the SPP admits everyone (an SPP installed with no rules); after it, a
    ///         stranger with no votes is refused and an eligible holder is admitted, and a holder
    ///         with only borrowed (live) votes is refused.
    function test_wiredCreationRuleAdmitsOnlyEligibleHoldersOnTheSpp() public {
        (, IPluginSetup.PreparedSetupData memory data) = _install(false, MIN_PROPOSER);
        MirrorSppRuleCondition rules = new MirrorSppRuleCondition(address(dao));
        dao.grant(address(rules), address(dao), rules.UPDATE_RULES_PERMISSION_ID());
        bytes32 createPermission = keccak256("CREATE_PROPOSAL_PERMISSION");
        // What the SPP setup does: CREATE_PROPOSAL to ANY_ADDR behind its rule condition.
        dao.grantWithCondition(address(spp), ANY_ADDR, createPermission, IPermissionCondition(address(rules)));

        address stranger = makeAddr("stranger");
        assertTrue(dao.isGranted(address(spp), stranger, createPermission, ""), "no rules: everyone may create");

        // The wiring action, executed as the DAO exactly as the install batch does.
        Action memory action = new CreationRuleHarness().ruleAction(address(rules), data.helpers[0]);
        vm.prank(address(dao));
        (bool ok,) = action.to.call(action.data);
        assertTrue(ok, "the DAO may update the rules");

        token.setVotes(creator, MIN_PROPOSER);
        assertFalse(dao.isGranted(address(spp), stranger, createPermission, ""), "a stranger with no votes");
        assertFalse(
            dao.isGranted(address(spp), makeAddr("borrower"), createPermission, ""), "an account with no snapshot votes"
        );
        assertTrue(dao.isGranted(address(spp), creator, createPermission, ""), "an eligible holder");

        token.setLiveVotes(stranger, 10 * MIN_PROPOSER);
        assertFalse(dao.isGranted(address(spp), stranger, createPermission, ""), "borrowed votes do not count");
    }
}
