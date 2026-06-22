# The Interfold Governance

Monorepo for **The Interfold** DAO governance — a governance app on the [Aragon OSx](https://www.aragon.org/osx) stack where proposals can be **public** (transparent on-chain token voting) or **private** (encrypted ballots tallied by [Enclave](https://enclave.gg)'s CRISP protocol). Both modes share one **FOLD** ERC20Votes token and execute through the same DAO.

```
the-interfold-governance/
  app/        Next.js frontend — unified UI over both voting plugins
  contracts/  Foundry — DAO + plugin deployment scripts and tests
```

## How it works

The DAO is governed by **two Aragon OSx plugins**, both installed with `EXECUTE_PERMISSION` so either can execute actions through the DAO. They share the same **FOLD** (`ERC20Votes` / `IVotes`) token, so voting power — including delegation — is identical across both.

| Plugin          | Privacy | Ballot                                | Source                                                  |
| --------------- | ------- | ------------------------------------- | ------------------------------------------------------- |
| CrispVoting     | Private | Yes / No / Abstain, encrypted (CRISP) | forked into `contracts/src/crisp/` (governance variant) |
| TokenVoting 1.4 | Public  | Yes / No / Abstain, on-chain          | Aragon canonical PluginRepo (referenced by address)     |

- **Token-weighted, delegated voting.** Both plugins weight votes by FOLD voting power at the proposal snapshot. The CRISP fork is hard-wired to a 3-option (Yes/No/Abstain), token-weighted (`CUSTOM`) ballot.
- **Foundation veto.** The CRISP plugin's `execute` is gated by `EXECUTE_PROPOSAL_PERMISSION`, held by the foundation — a passed private proposal only runs once the foundation executes it. The DAO is ROOT on that permission and can grant/revoke it via governance.

See [`app/README.md`](app/README.md) and [`contracts/README.md`](contracts/README.md) for component detail.

## Prerequisites

- [Bun](https://bun.sh) — the frontend
- [Foundry](https://getfoundry.sh) (`forge`, `cast`) — the contracts
- [pnpm](https://pnpm.io) — installs the contracts' npm Solidity deps (`make setup`)
- An RPC endpoint (Alchemy/Infura) and a funded deployer key for the target network (Sepolia)

## Frontend (`app/`)

```bash
cd app
bun install
cp .env.example .env   # fill in DAO + plugin addresses, FOLD, RPC, WalletConnect, Pinata
bun dev                # http://localhost:3000
```

The app shows proposals from both plugins in one list (tagged **Private** / **Public**), a single create form with a privacy toggle, per-plugin voting/detail pages, and a **Delegation** page (delegate to yourself or others, browse delegates by voting power).

## Contracts (`contracts/`)

```bash
cd contracts
make setup             # fetch Solidity deps (git submodules under lib/ + pnpm packages)
make build
make test
```

### Deploy

`DeployInterfoldDao` creates the Interfold DAO and installs **both** plugins in one atomic `createDao`, sharing the existing FOLD token.

```bash
cp .env.example .env   # Sepolia framework + Interfold addresses are prefilled; add your key/RPC + FOUNDATION_ADDRESS
make predeploy         # simulate (no broadcast)
make deploy            # broadcast
```

The script logs the DAO, the CRISP plugin, the TokenVoting plugin, and the deployment block — copy those into `app/.env`. Full prerequisites and the output → env mapping are in [`contracts/README.md`](contracts/README.md).

## Linting & formatting

Root scripts format/lint the whole monorepo — Prettier for the app + root docs, `forge fmt` for the contracts.

```bash
bun install            # at the repo root (installs Prettier)
bun run format         # write: app (prettier) + contracts (forge fmt) + root docs
bun run lint           # check: app (next lint) + contracts (forge fmt --check) + root docs
```

Per-area subsets are also available: `format:app`, `lint:app`, `format:contracts`, `lint:contracts`.

## License

Interfold-authored code in this repo is **LGPL-3.0-only** (see [LICENSE](LICENSE)), matching the
Interfold / Enclave contracts.

Some components retain their upstream licenses and are **not** relicensed:

- `contracts/src/crisp/CrispVoting.sol` and `setup/CrispVotingSetup.sol` — **AGPL-3.0** (forked
  from gnosisguild's `crisp-aragon-plugin`).
- `app/` — **AGPL-3.0** (built on Aragon's gov-app-template).
