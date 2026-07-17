# Interfold governance contracts

`DeployInterfoldDao.s.sol` creates the Interfold DAO and installs **five** plugins in one atomic
`createDao` call, sharing a single **FOLD** token. Proposals run through a **Staged Proposal
Processor (SPP)**: stage 0 = a voting body, stage 1 = a foundation veto window. **Read
[`../docs/architecture.md`](../docs/architecture.md) for the full mechanism** — this README is the
build/deploy reference.

| # | Plugin | Role | Source |
|---|--------|------|--------|
| 0 | CrispVoting | private stage-0 body | **forked** into `src/crisp/`, published fresh |
| 1 | TokenVoting v1.4 | public stage-0 body | Aragon canonical PluginRepo (by address) |
| 2 | SPP | private process | Aragon canonical PluginRepo (by address) |
| 3 | SPP | public process | Aragon canonical PluginRepo (by address) |
| 4 | Admin | wiring bootstrap (disarmed by `wire-spp`) | Aragon canonical PluginRepo (by address) |

The CRISP plugin is a **fork** of `crisp-aragon-plugin` vendored under `src/crisp/`. As a
governance SPP body it: uses a fixed **3-option (Yes/No/Abstain), token-weighted (`CUSTOM`)**
ballot; gates `createProposal` behind `CREATE_PROPOSAL_PERMISSION` (held by its SPP); charges the
E3 fee to a **creator-pays escrow** (`deposit`/`withdraw`/`feeCredits`, refunds via `claimRefund`)
instead of the caller; supports a **per-proposal voting duration**; and executes via a delegatecall
`Executor` so its `reportProposalResult` callback reports to the SPP as itself. It no longer holds
`EXECUTE_PERMISSION` on the DAO — only the SPPs execute.

Only the **canonical** plugins (TokenVoting, SPP, Admin) are referenced by published repo address +
version tag with install params ABI-encoded as bytes (`TokenVotingInstall.sol`, `SppInstall.sol`,
inline for Admin) — so their source is never compiled here (avoiding a `GovernanceERC20` version
clash).

Dependencies are declared directly by this project — git submodules under `lib/` (OSx,
OpenZeppelin, forge-std, ENS) pinned to the same commits the plugin used, plus npm packages
(`@enclave-e3/contracts`, `@aragon/token-voting-plugin`) in `package.json`. Run `make setup`
(`git submodule update --init --recursive` + `pnpm install`) to fetch everything.

## Setup

```bash
make setup   # git submodule update --init --recursive + pnpm install in the submodule
make build
make test    # unit test guarding the TokenVoting install-bytes layout
```

## Prerequisites

- **FOLD must already be deployed and implement `IVotes` (ERC20Votes).** Both setups receive it
  as an existing token and use it directly. If it were not `IVotes`, each setup would wrap it
  into its *own* `GovernanceWrappedERC20` → two different tokens → broken shared governance.
- OSx framework addresses (`DAO_FACTORY_ADDRESS`, `PLUGIN_REPO_FACTORY_ADDRESS`) and the
  canonical `PluginRepo` address + build for TokenVoting v1.4, the SPP, and the Admin plugin on
  the target network. Sepolia values are prefilled in `.env.example`; for other networks pick from
  <https://github.com/aragon/osx-commons/tree/main/configs/src/deployments/json>.

## Deploy

Three steps — the wiring runs with **no vote** by executing through the Admin bootstrap plugin,
which disarms itself at the end (see [`../docs/architecture.md`](../docs/architecture.md)).

```bash
cp .env.example .env   # framework + Interfold + canonical repo addresses prefilled; add key/RPC + FOUNDATION_ADDRESS
make predeploy         # simulate (no broadcast)
make deploy            # broadcast: 5-plugin DAO + Executor; logs every address
make sync-env          # parse deploy.log → write contracts/.env + app/.env
make wire-spp          # Admin executes the wiring in one tx (stages, grants, delegatecall, disarm)
```

`make deploy` logs the DAO, FOLD, the CRISP `PluginRepo`, the `Executor`, and the five installed
plugins. `make sync-env` copies them into both `.env` files for you. Optionally set
`CRISP_FEE_DEPOSIT_AMOUNT` before `wire-spp` to pre-escrow CRISP fee credit for the deployer.

### Stage timing (env, consumed by `wire-spp`)

| Var | Default | Meaning |
|-----|---------|---------|
| `SPP_PRIVATE_VOTE_DURATION` / `SPP_PUBLIC_VOTE_DURATION` | 3600 (1h) | stage-0 voting window |
| `SPP_ADVANCE_WINDOW` | 604800 (7d) | extra time to advance a passed stage 0 before it expires |
| `SPP_VETO_DURATION` | 172800 (2d) | stage-1 foundation veto window |
| `SPP_EXECUTE_WINDOW` | 2592000 (30d) | time to execute after the veto window before expiry |

The public path also sets stage-0 `minAdvance = voteDuration` so advancement waits for the full
window and decides on the final tally; the private path relies on CRISP tally availability
instead. All timing is changeable later by the DAO via `updateStages`.

## Wire outputs into `app/.env`

`make sync-env` writes these automatically; the mapping is:

| Script output                | Frontend env var                          |
| ---------------------------- | ----------------------------------------- |
| DAO                          | `NEXT_PUBLIC_DAO_ADDRESS`                  |
| FOLD token (shared)          | `NEXT_PUBLIC_TOKEN_ADDRESS`               |
| CRISP plugin (PRIVATE body)  | `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` |
| TokenVoting plugin (PUBLIC body) | `NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS` |
| SPP plugin (PRIVATE process) | `NEXT_PUBLIC_SPP_PRIVATE_ADDRESS`         |
| SPP plugin (PUBLIC process)  | `NEXT_PUBLIC_SPP_PUBLIC_ADDRESS`          |
| Deployment block (from logs) | `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK`     |

(`Executor` and `Admin plugin` are written to `contracts/.env` only — they're used by `wire-spp`,
not the frontend.)
