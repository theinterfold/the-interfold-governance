// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";

import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";
import {Utils} from "./Utils.sol";

/// @title PublishCrispBuild
/// @notice Publishes a new build of the CRISP plugin into the EXISTING repo, leaving the repo
///     address — the one the Aragon app has in `crispPlugin.repositoryAddresses` — unchanged.
///     `make deploy` cannot do this: it calls `createPluginRepoWithFirstVersion`, which mints a
///     brand-new repo at a new address and redeploys the whole Interfold DAO with it.
///
/// @dev Run this whenever `CrispVotingSetup` changes. The installation params it decodes are part
///     of a build's contract with its callers, so a setup that decodes a different tuple than the
///     published build MUST go out as a new build — an app updated ahead of the publish will fail
///     to install against the old one, and vice versa.
///
///     The build number is assigned by the repo (`createVersion` appends to the release), so the
///     first run against a repo with only the original build publishes build 2. The setup
///     published here deploys the proposal-creation `VotingPowerCondition` and returns it as
///     `helpers[0]`; build 1 returned no helpers. Installed plugins keep their build — the
///     setup has no update path — so the condition reaches a DAO only through a new install.
///
///     Requires MAINTAINER_PERMISSION_ID on the repo. Mainnet uses the Foundation Safe publisher.
///     Use this EOA publisher only when the configured key holds that permission.
contract PublishCrispBuild is Script {
    function run() public {
        address repoAddress = vm.envAddress("CRISP_PLUGIN_REPO");
        require(repoAddress != address(0), "CRISP_PLUGIN_REPO not set");

        // Mainnet publishes through the Foundation Safe (`make safe-publish-crisp-build`). This EOA
        // path may still run there, but only against the canonical repo: a mistyped repo address
        // would otherwise publish a build into a repo nobody installs from.
        if (block.chainid == 1) {
            require(repoAddress == Utils.MAINNET_CRISP_REPO, "CRISP_PLUGIN_REPO is not the mainnet CRISP repo");
        }

        // Read as a uint256 and bounded before the cast: `uint8(256)` would silently publish
        // release 0, which `createVersion` rejects only after the deployments have been paid for.
        uint256 releaseNumber = vm.envOr("CRISP_RELEASE", uint256(1));
        require(releaseNumber <= type(uint8).max, "CRISP_RELEASE does not fit in a uint8");
        uint8 release = uint8(releaseNumber);

        PluginRepo repo = PluginRepo(repoAddress);
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        // `createVersion` reverts for a sender without the maintainer permission, but only after
        // the implementation and setup have been deployed and paid for.
        require(
            repo.isGranted(repoAddress, vm.addr(privateKey), repo.MAINTAINER_PERMISSION_ID(), ""),
            "the sender does not hold MAINTAINER_PERMISSION on the repo"
        );

        vm.startBroadcast(privateKey);

        // A fresh implementation alongside the setup: the setup pins the implementation its
        // proxies point at, so publishing a setup built from this source against an
        // implementation deployed from older source would ship a build nobody has tested.
        // Existing DAOs are unaffected — their proxies keep pointing at their own implementation.
        address crispVoting = address(new CrispVoting());

        CrispVotingSetup setup = new CrispVotingSetup(crispVoting);

        (bytes memory buildMetadata, bytes memory releaseMetadata) = Utils.crispBuildMetadata();
        repo.createVersion(release, address(setup), buildMetadata, releaseMetadata);

        vm.stopBroadcast();

        PluginRepo.Tag memory latest = repo.getLatestVersion(release).tag;

        console2.log("CRISP repo:            ", repoAddress);
        console2.log("New CrispVotingSetup:  ", address(setup));
        console2.log("New CrispVoting impl:  ", crispVoting);
        console2.log("Published release:     ", latest.release);
        console2.log("Published build:       ", latest.build);
        console2.log("");
        console2.log("Next: set crispPlugin.installVersion in the Aragon app to this release/build.");
        console2.log("Installs of this build return the creation condition at preparedSetupData.helpers[0].");
    }
}
