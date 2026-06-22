// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Test.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";

import {GovernanceERC20} from "@aragon/token-voting-plugin/erc20/GovernanceERC20.sol";

import {ICrispVoting} from "../src/crisp/ICrispVoting.sol";
import {IInterfold} from "../src/crisp/IInterfold.sol";
import {CrispVotingSetup} from "../src/crisp/setup/CrispVotingSetup.sol";

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
            minDuration: uint64(VM.envUint("MINIMUM_DURATION")),
            minParticipation: uint32(VM.envUint("MINIMUM_PARTICIPATION"))
        });
        crispEnvVariables.targetConfig = defaultTargetConfig;
        crispEnvVariables.committeeSize = IInterfold.CommitteeSize(uint8(VM.envUint("COMMITTEE_SIZE")));
        crispEnvVariables.computeProviderParams = VM.envBytes("COMPUTE_PROVIDER_PARAMS");
        crispEnvVariables.paramSet = uint8(VM.envUint("PARAM_SET"));
    }

    function getGovernanceTokenAndMintSettings()
        public
        returns (GovernanceERC20, CrispVotingSetup.TokenSettings memory, GovernanceERC20.MintSettings memory)
    {
        CrispVotingSetup.TokenSettings memory tokenSettings = CrispVotingSetup.TokenSettings({
            addr: address(0), // If set to `address(0)`, a new `GovernanceERC20` token is deployed
            name: VM.envString("TOKEN_NAME"),
            symbol: VM.envString("TOKEN_SYMBOL")
        });
        GovernanceERC20.MintSettings memory mintSettings =
            GovernanceERC20.MintSettings({receivers: new address[](3), amounts: new uint256[](3)});

        address[] memory receivers = VM.envAddress("MINT_SETTINGS_RECEIVERS", ",");
        uint256 amount = VM.envUint("MINT_SETTINGS_AMOUNT");
        mintSettings.receivers = receivers;
        mintSettings.amounts = new uint256[](receivers.length);
        for (uint256 i = 0; i < receivers.length; i++) {
            mintSettings.amounts[i] = amount;
        }

        GovernanceERC20 governanceERC20Base =
            new GovernanceERC20(IDAO(address(0x0)), tokenSettings.name, tokenSettings.symbol, mintSettings);
        return (governanceERC20Base, tokenSettings, mintSettings);
    }
}
