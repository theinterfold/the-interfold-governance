// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {ERC1967Proxy} from "../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {MockFeeToken, MockInterfold} from "./mocks/CrispMocks.sol";
import {MockVotesAndBalanceToken} from "./CrispVotingCondition.t.sol";
import {PublishCrispBuild} from "../script/PublishCrispBuild.s.sol";

contract PublishCrispBuildTest is Test {
    function test_publishingAnExistingReleaseDoesNotInventMetadata() public {
        uint256 key = 0xBEEF;
        address maintainer = vm.addr(key);
        PluginRepo implementation = new PluginRepo();
        PluginRepo repo = PluginRepo(
            address(new ERC1967Proxy(address(implementation), abi.encodeCall(PluginRepo.initialize, (maintainer))))
        );
        CrispVotingSetup firstSetup = new CrispVotingSetup(address(new CrispVoting()));
        vm.prank(maintainer);
        repo.createVersion(1, address(firstSetup), bytes("ipfs://published-build"), bytes("ipfs://published-release"));
        PublishCrispBuild publisher = new PublishCrispBuild();
        vm.recordLogs();
        publisher.publish(_config(repo, key, 1));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        PluginRepo.Version memory latest = repo.getLatestVersion(1);
        assertEq(latest.tag.build, 2);
        assertEq(latest.buildMetadata, bytes(""));
        assertGt(latest.pluginSetup.code.length, 0);
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(repo)) {
                assertNotEq(logs[i].topics[0], keccak256("ReleaseMetadataUpdated(uint8,bytes)"));
            }
        }
    }

    /// @notice A published build 2 is the setup that deploys the proposal-creation condition: the
    ///         build 1 setup it follows returns no helpers, so an app reading `helpers[0]` needs
    ///         this build or later.
    function test_publishedBuildTwoReturnsTheCreationCondition() public {
        uint256 key = 0xBEEF;
        PluginRepo implementation = new PluginRepo();
        PluginRepo repo = PluginRepo(
            address(new ERC1967Proxy(address(implementation), abi.encodeCall(PluginRepo.initialize, (vm.addr(key)))))
        );
        address firstSetup = address(new CrispVotingSetup(address(new CrispVoting())));
        vm.prank(vm.addr(key));
        repo.createVersion(1, firstSetup, bytes(""), bytes("ipfs://r"));
        new PublishCrispBuild().publish(_config(repo, key, 1));

        PluginRepo.Version memory build2 = repo.getVersion(PluginRepo.Tag(1, 2));
        MockVotesAndBalanceToken token = new MockVotesAndBalanceToken();
        ICrispVoting.PluginInitParams memory params = ICrispVoting.PluginInitParams({
            dao: IDAO(address(0)),
            token: address(0),
            interfold: address(new MockInterfold(address(new MockFeeToken()))),
            committeeSize: IInterfold.CommitteeSize(0),
            paramSet: 0,
            crispProgramAddress: address(0xC0FFEE),
            computeProviderParams: bytes(""),
            votingSettings: ICrispVoting.VotingSettings({
                minProposerVotingPower: 1,
                minVoterVotingPower: 1,
                minParticipation: 50,
                supportThreshold: 50,
                minDuration: 3600
            })
        });
        (, IPluginSetup.PreparedSetupData memory data) = CrispVotingSetup(build2.pluginSetup)
            .prepareInstallation(makeAddr("dao"), abi.encode(params, address(token), false));

        assertEq(data.helpers.length, 1, "build 2 returns the creation condition at helpers[0]");
        assertGt(data.helpers[0].code.length, 0);
    }

    /// @dev Explicit inputs, not `vm.setEnv`: the environment is shared by tests that run in
    ///      parallel, so one test would read another's repo, key or release.
    function _config(PluginRepo repo, uint256 key, uint256 release)
        internal
        pure
        returns (PublishCrispBuild.Config memory)
    {
        return PublishCrispBuild.Config({
            repo: address(repo), release: release, privateKey: key, buildMetadata: "", releaseMetadata: ""
        });
    }

    function _repoWithMaintainer(address maintainer) internal returns (PluginRepo repo) {
        repo = PluginRepo(
            address(new ERC1967Proxy(address(new PluginRepo()), abi.encodeCall(PluginRepo.initialize, (maintainer))))
        );
    }

    function test_publishRefusesAReleaseThatDoesNotFitInAUint8() public {
        uint256 key = 0xBEEF;
        PluginRepo repo = _repoWithMaintainer(vm.addr(key));

        PublishCrispBuild publisher = new PublishCrispBuild();
        vm.expectRevert("CRISP_RELEASE does not fit in a uint8");
        // 257 would wrap to release 1 under a bare uint8 cast.
        publisher.publish(_config(repo, key, 257));
    }

    /// @notice A sender without MAINTAINER_PERMISSION is refused before anything is deployed.
    function test_publishRefusesASenderWithoutTheMaintainerPermission() public {
        PluginRepo repo = _repoWithMaintainer(vm.addr(0xBEEF));

        PublishCrispBuild publisher = new PublishCrispBuild();
        vm.expectRevert("the sender does not hold MAINTAINER_PERMISSION on the repo");
        publisher.publish(_config(repo, 0xBAD, 1));
        assertEq(repo.buildCount(1), 0, "nothing was published");
    }

    /// @notice On mainnet the EOA publisher only targets the canonical CRISP repo.
    function test_publishOnMainnetRefusesANonCanonicalRepo() public {
        uint256 key = 0xBEEF;
        PluginRepo repo = _repoWithMaintainer(vm.addr(key));
        vm.chainId(1);

        PublishCrispBuild publisher = new PublishCrispBuild();
        vm.expectRevert("CRISP_PLUGIN_REPO is not the mainnet CRISP repo");
        publisher.publish(_config(repo, key, 1));
    }
}
