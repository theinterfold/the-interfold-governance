// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {TokenVotingInstall} from "../script/TokenVotingInstall.sol";

/// @notice Guards that the encoded bytes match the canonical TokenVoting v1.4
/// `prepareInstallation` tuple. The decode structs here are declared independently
/// (in the documented field order) so accidental drift in TokenVotingInstall is caught.
contract TokenVotingInstallTest is Test {
    struct VS {
        uint8 votingMode;
        uint32 supportThreshold;
        uint32 minParticipation;
        uint64 minDuration;
        uint256 minProposerVotingPower;
    }

    struct TS {
        address addr;
        string name;
        string symbol;
    }

    struct MS {
        address[] receivers;
        uint256[] amounts;
        bool ensureDelegationOnMint;
    }

    function test_encodesCanonicalV14InstallTuple() public pure {
        address fold = 0x1111111111111111111111111111111111111111;

        TokenVotingInstall.VotingSettings memory v = TokenVotingInstall.VotingSettings({
            votingMode: 1,
            supportThreshold: 600_000,
            minParticipation: 150_000,
            minDuration: 7200,
            minProposerVotingPower: 42
        });

        bytes memory data = TokenVotingInstall.encode(fold, v, 5);

        (
            VS memory vs,
            TS memory ts,
            MS memory ms,
            IPlugin.TargetConfig memory tc,
            uint256 minApprovals,
            bytes memory pluginMetadata,
            address[] memory excludedAccounts
        ) = abi.decode(data, (VS, TS, MS, IPlugin.TargetConfig, uint256, bytes, address[]));

        // Voting settings land in the right slots
        assertEq(vs.votingMode, 1, "votingMode");
        assertEq(vs.supportThreshold, 600_000, "supportThreshold");
        assertEq(vs.minParticipation, 150_000, "minParticipation");
        assertEq(vs.minDuration, 7200, "minDuration");
        assertEq(vs.minProposerVotingPower, 42, "minProposerVotingPower");

        // Existing FOLD passed through, no token deploy/mint
        assertEq(ts.addr, fold, "token addr == FOLD");
        assertEq(ms.receivers.length, 0, "no mint receivers");
        assertEq(ms.amounts.length, 0, "no mint amounts");
        assertEq(ms.ensureDelegationOnMint, false, "no ensureDelegationOnMint");

        // target == address(0) => DAO in OSx 1.4; Call operation
        assertEq(tc.target, address(0), "target == DAO sentinel");
        assertEq(uint8(tc.operation), uint8(IPlugin.Operation.Call), "operation == Call");

        assertEq(minApprovals, 5, "minApprovals");
        assertEq(pluginMetadata.length, 0, "empty pluginMetadata");
        assertEq(excludedAccounts.length, 0, "no excluded accounts");
    }
}
