/** The catalogue renders these real roles; font values live in globals.css. */
export const interfaceTypeRoles = [
  {
    name: "Document title",
    sample: "Delegation",
    className: "ui-card-title",
    token: "--ui-title-font",
    usage: "Proposal titles; panel headings use PanelHeader (20px/600).",
  },
  {
    name: "Section title",
    sample: "Voting power sources",
    className: "ui-section-title",
    token: "--ui-section-font",
    usage: "Total voting power, Your locks, Voting details and Actions.",
  },
  {
    name: "Supporting text",
    sample: "You keep ownership and control withdrawals.",
    className: "ui-body",
    token: "--ui-body-font",
    usage: "Explanations, summaries and supporting facts.",
  },
  {
    name: "Label / metadata",
    sample: "Wallet balance · Voting power",
    className: "ui-label",
    token: "--ui-label-font",
    usage: "Field labels, table headers, filters and metadata.",
  },
  {
    name: "List amount",
    sample: "25.10K FOLD",
    className: "ui-list-token-amount",
    token: "--ui-list-value-font",
    usage: "Locks and delegate voting power. Inter 16px/600, tabular numerals.",
  },
] as const;

export const interfaceReferences = [
  {
    name: "Base · one product family",
    href: "https://brand.base.org/sub-brands",
    lesson: "Keep shared type, colour and motion across product areas.",
  },
  {
    name: "Aave Pro · data hierarchy",
    href: "https://aave.com/blog/aave-pro-user-guide",
    lesson: "Separate the main value, supporting facts and transaction actions.",
  },
  {
    name: "Coinbase · My Assets",
    href: "https://www.coinbase.com/en-gb/blog/building-economic-freedom-one-pixel-at-a-time",
    lesson: "Consolidate account information into one scannable view.",
  },
] as const;
