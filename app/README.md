# The Interfold Governance App

> Built on top of Aragon's [Governance App Template](https://github.com/aragon/gov-app-template) — credits to Aragon for the original codebase.

The frontend for the Interfold DAO governance. Proposals run through **staged governance**: two
**Staged Proposal Processor (SPP)** processes, each wrapping a voting body in stage 0 and a
foundation veto in stage 1, sharing the **FOLD** ERC20Votes token. **See
[`../docs/architecture.md`](../docs/architecture.md) for the full mechanism.**

| Process       | Stage 0 body     | Privacy | What it does                                                            |
| ------------- | ---------------- | ------- | ----------------------------------------------------------------------- |
| SPP (private) | CrispVoting      | Private | Encrypted ballots tallied by an Interfold ciphernode committee (CRISP). |
| SPP (public)  | TokenVoting v1.4 | Public  | Transparent on-chain Yes/No/Abstain voting weighted by FOLD.            |

Proposals are created **on the SPP** (not the body). Only the SPPs hold `EXECUTE_PERMISSION` on
the DAO; the bodies just report their result up to the SPP, which executes after the veto window.

> This is the `app/` package of the [`the-interfold-governance`](../README.md) monorepo. The
> deploy + wiring scripts live in [`../contracts`](../contracts/README.md).

## What's in the app

- **Unified proposal list** — proposals from both SPP processes in one feed, each tagged
  **Private** or **Public**, with an All / Public / Private filter.
- **Create page** — a **Private (CRISP) / Public (Token)** toggle that creates on the matching SPP.
  The private form adds a **fee-credit widget** (deposit/withdraw the Interfold E3 fee escrow) and
  a **per-proposal voting-duration** picker.
- **Staged detail pages** — stage 0 shows the body's voting UI (encrypted CRISP / on-chain
  Yes/No/Abstain); stage 1 shows the **veto panel** (countdown, veto button for the foundation,
  advance/execute for anyone once the window passes, and a **Vetoed** state).

The folder-based plugin system lives in `plugins/`: `governance/` is the unified shell, `spp/` holds
the SPP hooks/components (stages, veto, advancement), and `crispVoting/` / `tokenVoting/` are the
private and public body modules.

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
NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS=  # token used to pay Interfold E3 fees (CRISP)

# SPP processes — proposals are created on these
NEXT_PUBLIC_SPP_PRIVATE_ADDRESS=          # PRIVATE process (wraps CrispVoting)
NEXT_PUBLIC_SPP_PUBLIC_ADDRESS=           # PUBLIC process (wraps TokenVoting)

# Stage-0 bodies — resolved for the voting UI (sub-proposals)
NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS=  # PRIVATE body
NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS=  # PUBLIC body

# Indexing / network
NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK=      # block to start event queries from (speeds up loading)
NEXT_PUBLIC_SECONDS_PER_BLOCK=12
NEXT_PUBLIC_CHAIN_NAME=sepolia
NEXT_PUBLIC_WEB3_ENDPOINT=

# Interfold / CRISP
NEXT_PUBLIC_CRISP_SERVER_URL=

# Services
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_IPFS_ENDPOINTS=
NEXT_PUBLIC_PINATA_JWT=
```

Field notes:

- `NEXT_PUBLIC_TOKEN_ADDRESS` — FOLD, the ERC20Votes token both plugins read voting power from.
- `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS` / `NEXT_PUBLIC_SPP_PUBLIC_ADDRESS` — the two SPP processes proposals are created on and the list scans for `ProposalCreated` events.
- `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` / `NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS` — the stage-0 bodies, resolved (via `getBodyProposalId`) to render each proposal's voting UI. Either pair may be empty if only one process is deployed; the UI adapts.
- `NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS` / `NEXT_PUBLIC_CRISP_SERVER_URL` — only used by the private (CRISP) flow.
- `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK` — set to the DAO/plugin deployment block to avoid scanning from genesis.
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` — from [WalletConnect](https://walletconnect.com/).
- `NEXT_PUBLIC_IPFS_ENDPOINTS` / `NEXT_PUBLIC_PINATA_JWT` — for pinning proposal metadata to IPFS.

## License 📜

Released under the AGPL v3 License.
