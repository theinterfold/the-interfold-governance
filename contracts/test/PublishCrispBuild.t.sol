// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {ERC1967Proxy} from "../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {PublishCrispBuild} from "../script/PublishCrispBuild.s.sol";

contract PublishCrispBuildTest is Test {
    function test_publishingAnExistingReleaseDoesNotInventMetadata() public {
        uint256 key = 0xBEEF;
        address maintainer = vm.addr(key);
        PluginRepo repo = _repoWithMaintainer(maintainer);
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
