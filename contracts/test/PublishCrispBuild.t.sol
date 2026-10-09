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
        PluginRepo implementation = new PluginRepo();
        PluginRepo repo = PluginRepo(
            address(new ERC1967Proxy(address(implementation), abi.encodeCall(PluginRepo.initialize, (maintainer))))
        );
        CrispVotingSetup firstSetup = new CrispVotingSetup(address(new CrispVoting()));
        vm.prank(maintainer);
        repo.createVersion(1, address(firstSetup), bytes("ipfs://published-build"), bytes("ipfs://published-release"));
        vm.setEnv("PRIVATE_KEY", vm.toString(key));
        vm.setEnv("CRISP_PLUGIN_REPO", vm.toString(address(repo)));
        vm.setEnv("CRISP_RELEASE", "1");
        vm.setEnv("CRISP_BUILD_METADATA_URI", "");
        vm.setEnv("CRISP_RELEASE_METADATA_URI", "");

        PublishCrispBuild publisher = new PublishCrispBuild();
        vm.recordLogs();
        publisher.run();
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
}
