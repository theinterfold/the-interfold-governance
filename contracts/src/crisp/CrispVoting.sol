// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.29;

import {Action} from "@aragon/osx/core/dao/DAO.sol";
import {PluginUUPSUpgradeable} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {
    ProposalUpgradeable
} from "@aragon/osx-commons-contracts/src/plugin/extensions/proposal/ProposalUpgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IProposal} from "@aragon/osx-commons-contracts/src/plugin/extensions/proposal/IProposal.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IInterfold} from "./IInterfold.sol";
import {E3, IE3Program} from "./IE3.sol";
import {ICrispVoting} from "./ICrispVoting.sol";
import {ICRISP} from "./ICRISP.sol";

/// @title CrispVoting
/// @notice An Aragon OSx governance plugin that runs private, encrypted votes through Interfold's
/// CRISP E3 program. Proposal creation registers an E3 request with Interfold; once the tally is
/// decrypted and published by the CRISP program, the proposal can be executed if it meets the
/// quorum and winning-option criteria.
/// @dev In order for executed actions to run, the plugin needs to hold EXECUTE_PERMISSION_ID on the DAO.
/// @notice This plugin is inspired by MACI's voting plugin - https://github.com/privacy-ethereum/maci-voting-plugin-aragon/blob/main/src/MaciVoting.sol
contract CrispVoting is PluginUUPSUpgradeable, ProposalUpgradeable, ICrispVoting {
    /// @notice used to perform safe ERC20 operations
    using SafeERC20 for IERC20;

    /// @notice The manager permission id
    bytes32 public constant MANAGER_PERMISSION_ID = keccak256("MANAGER_PERMISSION");

    /// @notice Permission required to execute a passed proposal. Held by the Interfold
    /// foundation so it retains veto power (a passed proposal only runs once the foundation
    /// executes it). The DAO is ROOT on this permission and can grant/revoke it via governance.
    bytes32 public constant EXECUTE_PROPOSAL_PERMISSION_ID = keccak256("EXECUTE_PROPOSAL_PERMISSION");

    /// @notice The denominator for ratio calculations.
    uint256 internal constant RATIO_BASE = 100;

    /// @notice The interface id for the Crisp Voting plugin
    bytes4 internal constant CRISP_VOTING_INTERFACE_ID = this.initialize.selector ^ this.minProposerVotingPower.selector
        ^ this.totalVotingPower.selector ^ this.getVotingToken.selector ^ this.minParticipation.selector
        ^ this.minDuration.selector ^ this.getProposal.selector;

    /// @notice The interfold contract reference
    IInterfold public interfold;

    /// @notice The token used to pay for Interfold fees
    IERC20 public interfoldFeeToken;

    /// @notice An
    /// [OpenZeppelin `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes)
    /// compatible contract referencing the token being used for voting.
    IVotesUpgradeable private votingToken;

    /// @notice The voting settings
    VotingSettings private votingSettings;

    /// @notice A mapping between proposal IDs and proposal information.
    mapping(uint256 => Proposal) internal proposals;

    /// @notice The ciphernode threshold
    IInterfold.CommitteeSize private committeeSize;
    /// @notice The parameter set to use
    uint8 private paramSet;
    /// @notice The address of the E3 Program
    address private crispProgramAddress;
    /// @notice The ABI encoded compute provider parameters
    bytes private computeProviderParams;

    /// @notice Disables the initializers on the implementation contract to prevent
    /// it from being left uninitialized.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the plugin
    /// @param _params The plugin initialization parameters
    function initialize(PluginInitParams calldata _params) external initializer {
        __PluginUUPSUpgradeable_init(_params.dao);

        if (_params.interfold == address(0)) {
            revert ZeroAddress();
        }
        interfold = IInterfold(_params.interfold);
        votingToken = IVotesUpgradeable(_params.token);
        interfoldFeeToken = IERC20(interfold.feeToken());
        committeeSize = _params.committeeSize;
        paramSet = _params.paramSet;
        crispProgramAddress = _params.crispProgramAddress;
        computeProviderParams = _params.computeProviderParams;

        _updateVotingSettings(_params.votingSettings);
    }

    /// @inheritdoc ICrispVoting
    function updateVotingSettings(VotingSettings calldata _votingSettings) external auth(MANAGER_PERMISSION_ID) {
        _updateVotingSettings(_votingSettings);
    }

    /// @notice Creates a new E3 request in Interfold
    /// @dev This is a wrapper around the createProposal function as we need it to be payable
    /// as there will be charges for the E3 request in Interfold.
    /// @param _metadata The metadata of the proposal
    /// @param _actions The actions that will be executed if the proposal passes
    /// @param _startDate The start date of the proposal
    /// @param _endDate The end date of the proposal
    /// @param _data The additional abi-encoded data to include more necessary fields
    /// This includes whether to allow failures, and the interfold request start window details
    /// @return proposalId The id of the proposal
    function createProposal(
        bytes memory _metadata,
        Action[] memory _actions,
        uint64 _startDate,
        uint64 _endDate,
        bytes memory _data
    ) external returns (uint256 proposalId) {
        /// @notice Create a deterministic proposal id
        proposalId = _createProposalId(keccak256(abi.encode(_actions, _metadata)));

        /// @notice Get the proposal storage variable
        Proposal storage proposal = proposals[proposalId];

        {
            /// @notice Check if the proposal already exists first
            if (_proposalExists(proposalId)) {
                revert ProposalAlreadyExists(proposalId);
            }

            /// @notice Check if the sender has enough voting power
            uint256 _minProposerVotingPower = minProposerVotingPower();
            if (_minProposerVotingPower != 0) {
                if (votingToken.getVotes(_msgSender()) < _minProposerVotingPower) {
                    revert ProposalCreationForbidden(_msgSender());
                }
            }
        }

        /// @notice Validate and normalise the dates, enforcing the configured minimum duration.
        /// The validated values feed both the Interfold input window and the stored parameters.
        (_startDate, _endDate) = _validateProposalDates(_startDate, _endDate);

        {
            /// @notice Decode the data. Governance proposals are fixed to a standard
            /// Yes/No/Abstain ballot weighted by token voting power, so the per-proposal
            /// option count and credit mode from `_data` are ignored: we always use
            /// 3 options and CUSTOM (token + delegate weighted) credits.
            (uint256 _allowFailureMap,,, uint256 credits) = abi.decode(_data, (uint256, uint256, uint256, uint256));

            uint256 numOptions = 3;
            ICRISP.CreditMode creditMode = ICRISP.CreditMode.CUSTOM;

            bytes memory customParams = abi.encode(
                address(votingToken), votingSettings.minProposerVotingPower, numOptions, creditMode, credits
            );

            IInterfold.E3RequestParams memory requestParams = IInterfold.E3RequestParams({
                committeeSize: committeeSize,
                inputWindow: [uint256(_startDate), uint256(_endDate)],
                e3Program: IE3Program(crispProgramAddress),
                computeProviderParams: computeProviderParams,
                customParams: customParams,
                proofAggregationEnabled: false,
                paramSet: paramSet
            });

            // calculate the E3 fee
            uint256 fee = interfold.getE3Quote(requestParams);
            // take it from the caller
            interfoldFeeToken.safeTransferFrom(_msgSender(), address(this), fee);
            // approve the interfold contract to take the fee
            interfoldFeeToken.forceApprove(address(interfold), fee);

            // send the request to Interfold
            (uint256 e3Id,) = interfold.request(requestParams);

            /// @notice Store the data
            proposal.tally.counts = new uint256[](numOptions);
            proposal.parameters = ProposalParameters({
                numOptions: numOptions,
                startDate: _startDate,
                endDate: _endDate,
                // snapshot the previous block so voting power is read from a finalized block
                snapshotBlock: block.number - 1,
                minVotingPower: votingSettings.minProposerVotingPower,
                minParticipation: votingSettings.minParticipation,
                creditMode: creditMode
            });
            proposal.allowFailureMap = _allowFailureMap;
            proposal.targetConfig = getTargetConfig();
            proposal.e3Id = e3Id;
        }

        for (uint256 i = 0; i < _actions.length;) {
            proposal.actions.push(_actions[i]);
            unchecked {
                ++i;
            }
        }

        emit ProposalCreated(
            proposalId, _msgSender(), _startDate, _endDate, _metadata, _actions, proposal.allowFailureMap
        );
    }

    /// @inheritdoc IProposal
    /// @dev Gated by EXECUTE_PROPOSAL_PERMISSION_ID so only the foundation can execute a passed
    /// proposal (i.e. it can veto by declining to execute).
    function execute(uint256 _proposalId) external auth(EXECUTE_PROPOSAL_PERMISSION_ID) {
        if (!_proposalExists(_proposalId)) {
            revert NonexistentProposal(_proposalId);
        }

        Proposal storage proposal = proposals[_proposalId];

        // the voting window must have closed before a proposal can be executed
        if (block.timestamp < proposal.parameters.endDate) {
            revert ProposalExecutionForbidden(_proposalId);
        }

        uint256[] memory tallyCounts = ICRISP(crispProgramAddress).decodeTally(proposal.e3Id);

        // check if we can execute it using the freshly decoded tally
        if (!_canExecute(_proposalId, tallyCounts)) {
            revert ProposalExecutionForbidden(_proposalId);
        }

        /// @notice store the final tally
        proposal.tally.counts = tallyCounts;

        /// @notice we set the proposal as executed so it cannot be executed again
        proposal.executed = true;

        // just execute it
        _execute(
            proposal.targetConfig.target,
            bytes32(_proposalId),
            proposal.actions,
            proposal.allowFailureMap,
            proposal.targetConfig.operation
        );

        emit ProposalExecuted(_proposalId);
    }

    /// @notice Returns whether the proposal has succeeded or not.
    /// @dev A proposal has succeeded if it has already been executed or if it currently meets the
    /// execution criteria (quorum and the winning-option rules). This is independent of whether the
    /// proposal has actually been executed.
    /// @param _proposalId The id of the proposal.
    /// @return Whether the proposal has succeeded or not.
    function hasSucceeded(uint256 _proposalId) external view returns (bool) {
        if (!_proposalExists(_proposalId)) {
            revert NonexistentProposal(_proposalId);
        }

        if (proposals[_proposalId].executed) {
            return true;
        }

        return _canExecute(_proposalId);
    }

    /// @notice Returns the proposal data for a given proposal ID.
    /// @param _proposalId The ID of the proposal to retrieve.
    /// @return proposal_ The proposal data including execution status, parameters, tally results,
    /// actions, and other metadata.
    function getProposal(uint256 _proposalId) external view returns (Proposal memory proposal_) {
        proposal_ = proposals[_proposalId];
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(PluginUUPSUpgradeable, ProposalUpgradeable)
        returns (bool)
    {
        return _interfaceId == CRISP_VOTING_INTERFACE_ID || super.supportsInterface(_interfaceId);
    }

    /// @inheritdoc ICrispVoting
    function getVotingToken() public view returns (IVotesUpgradeable) {
        return votingToken;
    }

    /// @inheritdoc ICrispVoting
    function minParticipation() public view returns (uint32) {
        return votingSettings.minParticipation;
    }

    /// @inheritdoc ICrispVoting
    function minDuration() public view returns (uint64) {
        return votingSettings.minDuration;
    }

    /// @inheritdoc ICrispVoting
    function minProposerVotingPower() public view returns (uint256) {
        return votingSettings.minProposerVotingPower;
    }

    /// @inheritdoc ICrispVoting
    function totalVotingPower(uint256 _blockNumber) public view returns (uint256) {
        return votingToken.getPastTotalSupply(_blockNumber);
    }

    /// @inheritdoc IProposal
    function canExecute(uint256 _proposalId) public view returns (bool) {
        if (!_proposalExists(_proposalId)) {
            revert NonexistentProposal(_proposalId);
        }

        return _canExecute(_proposalId);
    }

    /// @notice Get the custom proposal parameters ABI.
    /// @dev Mirrors the `_data` payload decoded in `createProposal`.
    function customProposalParamsABI() external pure returns (string memory) {
        return "(uint256 allowFailureMap, uint256 numOptions, uint256 creditMode, uint256 credits)";
    }

    /// @notice Get the tally result
    /// @param _proposalId The id of the proposal
    /// @return The tally result
    function getTally(uint256 _proposalId) external view returns (TallyResults memory) {
        Proposal memory proposal = proposals[_proposalId];

        // if it's not executed then we wouldn't have saved the result
        if (!proposal.executed) {
            uint256[] memory counts = ICRISP(crispProgramAddress).decodeTally(proposal.e3Id);
            return TallyResults({counts: counts});
        }

        return proposals[_proposalId].tally;
    }

    /// @inheritdoc ICrispVoting
    function getWinningOption(uint256 _proposalId) external view returns (uint256) {
        uint256[] memory counts;

        if (proposals[_proposalId].executed) {
            counts = proposals[_proposalId].tally.counts;
        } else {
            counts = ICRISP(crispProgramAddress).decodeTally(proposals[_proposalId].e3Id);
        }

        uint256 maxCount = 0;
        uint256 winnerIndex = 0;

        for (uint256 i = 0; i < counts.length;) {
            if (counts[i] > maxCount) {
                maxCount = counts[i];
                winnerIndex = i;
            }
            unchecked {
                ++i;
            }
        }

        return winnerIndex;
    }

    /// @notice Validates and stores the voting settings.
    /// @dev `minParticipation` is a ratio expressed against `RATIO_BASE`, so it cannot exceed it.
    /// @param _votingSettings The voting settings to store.
    function _updateVotingSettings(VotingSettings memory _votingSettings) internal {
        if (_votingSettings.minParticipation > RATIO_BASE) {
            revert RatioOutOfBounds({limit: RATIO_BASE, actual: _votingSettings.minParticipation});
        }

        votingSettings = _votingSettings;

        emit VotingSettingsUpdated(
            _votingSettings.minProposerVotingPower, _votingSettings.minParticipation, _votingSettings.minDuration
        );
    }

    /// @notice Validates and returns the proposal vote dates, enforcing the minimum duration.
    /// @param _start The start date of the proposal vote. If 0, the current timestamp is used
    /// and the vote starts immediately.
    /// @param _end The end date of the proposal vote. If 0, `_start + minDuration` is used.
    /// @return startDate The validated start date of the proposal vote.
    /// @return endDate The validated end date of the proposal vote.
    function _validateProposalDates(uint64 _start, uint64 _end)
        internal
        view
        returns (uint64 startDate, uint64 endDate)
    {
        // block.timestamp cannot exceed uint64 for ~580 billion years, so the cast is safe.
        uint64 currentTimestamp = uint64(block.timestamp);

        if (_start == 0) {
            startDate = currentTimestamp;
        } else {
            startDate = _start;

            // the vote cannot start in the past, otherwise the minimum duration is meaningless
            if (startDate < currentTimestamp) {
                revert DateOutOfBounds({limit: currentTimestamp, actual: startDate});
            }
        }

        // checked arithmetic: an absurdly large `minDuration` simply reverts here, and the caller
        // can pick another date. Bounding `minDuration` on update would tighten this further.
        uint64 earliestEndDate = startDate + votingSettings.minDuration;

        if (_end == 0) {
            endDate = earliestEndDate;
        } else {
            endDate = _end;

            if (endDate < earliestEndDate) {
                revert DateOutOfBounds({limit: earliestEndDate, actual: endDate});
            }
        }
    }

    /// @notice Internal checks to determine whether a proposal can be executed or not.
    /// @dev Fetches the tally from the CRISP program before delegating to the counts-based check.
    /// @param _proposalId The ID of the proposal to be checked
    /// @return Returns `true` if the proposal can be executed, otherwise false
    function _canExecute(uint256 _proposalId) internal view returns (bool) {
        uint256[] memory counts = ICRISP(crispProgramAddress).decodeTally(proposals[_proposalId].e3Id);
        return _canExecute(_proposalId, counts);
    }

    /// @notice Internal checks to determine whether a proposal can be executed or not, given an
    /// already-decoded tally. Avoids a redundant `decodeTally` call on the execution path.
    /// @param _proposalId The ID of the proposal to be checked
    /// @param counts The decoded tally counts for the proposal
    /// @return Returns `true` if the proposal can be executed, otherwise false
    function _canExecute(uint256 _proposalId, uint256[] memory counts) internal view returns (bool) {
        Proposal memory proposal = proposals[_proposalId];

        // can't execute twice
        if (proposal.executed) {
            return false;
        }

        // Sum all votes for quorum check
        uint256 totalVotes = 0;
        for (uint256 i = 0; i < counts.length;) {
            totalVotes += counts[i];
            unchecked {
                ++i;
            }
        }

        // Check quorum: totalVotes * RATIO_BASE >= minParticipation * totalSupply
        uint256 _totalVotingPower = totalVotingPower(proposal.parameters.snapshotBlock);
        if (_totalVotingPower == 0) {
            return false;
        }

        bool quorumReached = totalVotes * RATIO_BASE >= uint256(votingSettings.minParticipation) * _totalVotingPower;
        if (!quorumReached) {
            return false;
        }

        // For 2-3 options: yes (index 0) must strictly beat no (index 1)
        return counts[0] > counts[1];
    }

    /// @notice Checks if proposal exists or not.
    /// @param _proposalId The ID of the proposal.
    /// @return Returns `true` if proposal exists, otherwise false.
    function _proposalExists(uint256 _proposalId) private view returns (bool) {
        return proposals[_proposalId].parameters.snapshotBlock != 0;
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables
    ///         without shifting down storage in the inheritance chain
    ///         (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[49] private __gap;
}
