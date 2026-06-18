# The Interfold Governance App

> Built on top of Aragon's [Governance App Template](https://github.com/aragon/gov-app-template) — credits to Aragon for the original codebase.

The frontend for the Interfold DAO governance. It presents a single, unified experience over **two** Aragon OSx plugins that share the **FOLD** ERC20Votes token:

| Plugin           | Privacy | What it does                                                          |
| ---------------- | ------- | -------------------------------------------------------------------- |
| CrispVoting      | Private | Encrypted ballots tallied by an Enclave ciphernode committee (CRISP). |
| TokenVoting v1.4 | Public  | Transparent on-chain Yes/No/Abstain voting weighted by FOLD.          |

Both plugins are installed on the same DAO with `EXECUTE_PERMISSION`, so either can execute governance actions through the DAO.

> This is the `app/` package of the [`the-interfold-governance`](../README.md) monorepo. The deploy scripts that create the DAO and install both plugins live in [`../contracts`](../contracts/README.md).

## What's in the app

- **Unified proposal list** — proposals from both plugins in one feed, each tagged **Private** or **Public**, with an All / Public / Private filter.
- **Single create page** — one form with a **Private (CRISP) / Public (Token)** toggle that routes to the right plugin.
- **Per-plugin detail/voting** — encrypted CRISP voting for private proposals, on-chain Yes/No/Abstain for public ones.

The folder-based plugin system lives in `plugins/`: `governance/` is the unified shell (the single registry entry), with `crispVoting/` and `tokenVoting/` as the private and public feature modules.

## Getting started

Requires [Bun](https://bun.sh/).

```bash
bun install
bun dev
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

```bash
# Core
NEXT_PUBLIC_DAO_ADDRESS=                  # the Interfold DAO
NEXT_PUBLIC_TOKEN_ADDRESS=                # FOLD (ERC20Votes / IVotes) — shared voting token
NEXT_PUBLIC_ENCLAVE_FEE_TOKEN_ADDRESS=    # token used to pay Enclave fees (CRISP)

# Plugins
NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS=  # PRIVATE proposals
NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS=  # PUBLIC proposals

# Indexing / network
NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK=      # block to start event queries from (speeds up loading)
NEXT_PUBLIC_SECONDS_PER_BLOCK=12
NEXT_PUBLIC_CHAIN_NAME=sepolia
NEXT_PUBLIC_WEB3_ENDPOINT=

# Enclave / CRISP
NEXT_PUBLIC_CRISP_SERVER_URL=

# Services
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_IPFS_ENDPOINTS=
NEXT_PUBLIC_PINATA_JWT=
```

Field notes:

- `NEXT_PUBLIC_TOKEN_ADDRESS` — FOLD, the ERC20Votes token both plugins read voting power from.
- `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` / `NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS` — the two installed plugins. Either may be empty if only one is deployed; the list/create UI adapts.
- `NEXT_PUBLIC_ENCLAVE_FEE_TOKEN_ADDRESS` / `NEXT_PUBLIC_CRISP_SERVER_URL` — only used by the private (CRISP) flow.
- `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK` — set to the DAO/plugin deployment block to avoid scanning from genesis.
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` — from [WalletConnect](https://walletconnect.com/).
- `NEXT_PUBLIC_IPFS_ENDPOINTS` / `NEXT_PUBLIC_PINATA_JWT` — for pinning proposal metadata to IPFS.

## License 📜

Released under the AGPL v3 License.
