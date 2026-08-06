// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";

import {IDAO} from "@aragon/osx/core/dao/DAO.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "@aragon/token-voting-plugin/erc20/GovernanceWrappedERC20.sol";

import {CrispVoting} from "../src/crisp/CrispVoting.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";

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
///     Requires MAINTAINER_PERMISSION_ID on the repo, which `createPluginRepoWithFirstVersion`
///     granted to the original deployer. Run with the same PRIVATE_KEY.
contract PublishCrispBuild is Script {
    function run() public {
        address repoAddress = vm.envAddress("CRISP_PLUGIN_REPO");
        require(repoAddress != address(0), "CRISP_PLUGIN_REPO not set");

        PluginRepo repo = PluginRepo(repoAddress);
        uint8 release = uint8(vm.envOr("CRISP_RELEASE", uint256(1)));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // A fresh implementation alongside the setup: the setup pins the implementation its
        // proxies point at, so publishing a setup built from this source against an
        // implementation deployed from older source would ship a build nobody has tested.
        // Existing DAOs are unaffected — their proxies keep pointing at their own implementation.
        GovernanceERC20 governanceERC20Base = new GovernanceERC20(
            IDAO(address(0)),
            "",
            "",
            GovernanceERC20.MintSettings({receivers: new address[](0), amounts: new uint256[](0)})
        );
        GovernanceWrappedERC20 governanceWrappedERC20Base =
            new GovernanceWrappedERC20(IERC20Upgradeable(address(0)), "", "");
        address crispVoting = address(new CrispVoting());

        CrispVotingSetup setup = new CrispVotingSetup(governanceERC20Base, governanceWrappedERC20Base, crispVoting);

        // Metadata is not resolved on-chain; the app reads its own copy. Kept non-empty so the
        // build is distinguishable in explorers.
        repo.createVersion(release, address(setup), bytes("ipfs://crisp-build"), bytes("ipfs://crisp-release"));

        vm.stopBroadcast();

        PluginRepo.Tag memory latest = repo.getLatestVersion(release).tag;

        console2.log("CRISP repo:            ", repoAddress);
        console2.log("New CrispVotingSetup:  ", address(setup));
        console2.log("New CrispVoting impl:  ", crispVoting);
        console2.log("Published release:     ", latest.release);
        console2.log("Published build:       ", latest.build);
        console2.log("");
        console2.log("Next: set crispPlugin.installVersion in the Aragon app to this release/build.");
    }
}
