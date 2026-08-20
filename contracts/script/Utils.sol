// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Test.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";

library Utils {
    // the canonical hevm cheat‑code address
    Vm public constant VM = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    struct CrispEnvVariables {
        address interfold;
        address crispProgramAddress;
        ICrispVoting.VotingSettings votingSettings;
        IPlugin.TargetConfig targetConfig;
        IInterfold.CommitteeSize committeeSize;
        uint8 paramSet;
        bytes computeProviderParams;
    }

    function readCrispEnv() public view returns (CrispEnvVariables memory crispEnvVariables) {
        IPlugin.TargetConfig memory defaultTargetConfig =
            IPlugin.TargetConfig({target: address(0), operation: IPlugin.Operation.Call});

        crispEnvVariables.interfold = VM.envAddress("INTERFOLD_ADDRESS");
        crispEnvVariables.crispProgramAddress = VM.envAddress("CRISP_PROGRAM_ADDRESS");
        crispEnvVariables.votingSettings = ICrispVoting.VotingSettings({
            minProposerVotingPower: VM.envUint("MINIMUM_PROPOSER_VOTING_POWER"),
            minVoterVotingPower: VM.envUint("MINIMUM_VOTER_VOTING_POWER"),
            minDuration: uint64(VM.envUint("MINIMUM_DURATION")),
            minParticipation: uint32(VM.envUint("MINIMUM_PARTICIPATION"))
        });
        crispEnvVariables.targetConfig = defaultTargetConfig;
        crispEnvVariables.committeeSize = IInterfold.CommitteeSize(uint8(VM.envUint("COMMITTEE_SIZE")));
        crispEnvVariables.computeProviderParams = VM.envBytes("COMPUTE_PROVIDER_PARAMS");
        crispEnvVariables.paramSet = uint8(VM.envUint("PARAM_SET"));
    }
}
