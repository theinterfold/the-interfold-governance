/**
 * Minimal ABI for Aragon's StagedProposalProcessor (SPP) v1.x, hand-vendored from
 * the plugin source (spp-plugin/src/StagedProposalProcessor.sol). Covers proposal
 * creation, stage/state introspection, advancing/executing and result reporting.
 */

const ActionComponents = [
  { name: "to", type: "address", internalType: "address" },
  { name: "value", type: "uint256", internalType: "uint256" },
  { name: "data", type: "bytes", internalType: "bytes" },
] as const;

export const StagedProposalProcessorAbi = [
  {
    type: "function",
    name: "createProposal",
    inputs: [
      { name: "_metadata", type: "bytes", internalType: "bytes" },
      {
        name: "_actions",
        type: "tuple[]",
        internalType: "struct Action[]",
        components: ActionComponents,
      },
      { name: "_allowFailureMap", type: "uint128", internalType: "uint128" },
      { name: "_startDate", type: "uint64", internalType: "uint64" },
      { name: "_proposalParams", type: "bytes[][]", internalType: "bytes[][]" },
    ],
    outputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "advanceProposal",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "execute",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancel",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "reportProposalResult",
    inputs: [
      { name: "_proposalId", type: "uint256", internalType: "uint256" },
      { name: "_stageId", type: "uint16", internalType: "uint16" },
      { name: "_resultType", type: "uint8", internalType: "enum StagedProposalProcessor.ResultType" },
      { name: "_tryAdvance", type: "bool", internalType: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "state",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint8", internalType: "enum StagedProposalProcessor.ProposalState" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canProposalAdvance",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canExecute",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasSucceeded",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposal",
    inputs: [{ name: "_proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct StagedProposalProcessor.Proposal",
        components: [
          { name: "allowFailureMap", type: "uint128", internalType: "uint128" },
          { name: "lastStageTransition", type: "uint64", internalType: "uint64" },
          { name: "currentStage", type: "uint16", internalType: "uint16" },
          { name: "stageConfigIndex", type: "uint16", internalType: "uint16" },
          { name: "executed", type: "bool", internalType: "bool" },
          { name: "canceled", type: "bool", internalType: "bool" },
          { name: "creator", type: "address", internalType: "address" },
          {
            name: "actions",
            type: "tuple[]",
            internalType: "struct Action[]",
            components: ActionComponents,
          },
          {
            name: "targetConfig",
            type: "tuple",
            internalType: "struct IPlugin.TargetConfig",
            components: [
              { name: "target", type: "address", internalType: "address" },
              { name: "operation", type: "uint8", internalType: "enum IPlugin.Operation" },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStages",
    inputs: [{ name: "_index", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct StagedProposalProcessor.Stage[]",
        components: [
          {
            name: "bodies",
            type: "tuple[]",
            internalType: "struct StagedProposalProcessor.Body[]",
            components: [
              { name: "addr", type: "address", internalType: "address" },
              { name: "isManual", type: "bool", internalType: "bool" },
              { name: "tryAdvance", type: "bool", internalType: "bool" },
              { name: "resultType", type: "uint8", internalType: "enum StagedProposalProcessor.ResultType" },
            ],
          },
          { name: "maxAdvance", type: "uint64", internalType: "uint64" },
          { name: "minAdvance", type: "uint64", internalType: "uint64" },
          { name: "voteDuration", type: "uint64", internalType: "uint64" },
          { name: "approvalThreshold", type: "uint16", internalType: "uint16" },
          { name: "vetoThreshold", type: "uint16", internalType: "uint16" },
          { name: "cancelable", type: "bool", internalType: "bool" },
          { name: "editable", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCurrentConfigIndex",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBodyProposalId",
    inputs: [
      { name: "_proposalId", type: "uint256", internalType: "uint256" },
      { name: "_stageId", type: "uint16", internalType: "uint16" },
      { name: "_body", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBodyResult",
    inputs: [
      { name: "_proposalId", type: "uint256", internalType: "uint256" },
      { name: "_stageId", type: "uint16", internalType: "uint16" },
      { name: "_body", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint8", internalType: "enum StagedProposalProcessor.ResultType" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposalTally",
    inputs: [
      { name: "_proposalId", type: "uint256", internalType: "uint256" },
      { name: "_stageId", type: "uint16", internalType: "uint16" },
    ],
    outputs: [
      { name: "approvals", type: "uint256", internalType: "uint256" },
      { name: "vetoes", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasExecutePermission",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasAdvancePermission",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ProposalCreated",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "creator", type: "address", indexed: true, internalType: "address" },
      { name: "startDate", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "endDate", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "metadata", type: "bytes", indexed: false, internalType: "bytes" },
      {
        name: "actions",
        type: "tuple[]",
        indexed: false,
        internalType: "struct Action[]",
        components: ActionComponents,
      },
      { name: "allowFailureMap", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProposalAdvanced",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "stageId", type: "uint16", indexed: true, internalType: "uint16" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProposalResultReported",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "stageId", type: "uint16", indexed: true, internalType: "uint16" },
      { name: "body", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubProposalCreated",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "stageId", type: "uint16", indexed: true, internalType: "uint16" },
      { name: "body", type: "address", indexed: true, internalType: "address" },
      { name: "bodyProposalId", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProposalExecuted",
    inputs: [{ name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProposalCanceled",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "stageId", type: "uint16", indexed: true, internalType: "uint16" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
] as const;
