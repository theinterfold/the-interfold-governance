# The Interfold Governance

Monorepo for **The Interfold** DAO governance — a governance app on the [Aragon OSx](https://www.aragon.org/osx) stack where proposals can be **public** (transparent on-chain token voting) or **private** (encrypted ballots tallied by the Interfold's [CRISP](https://blog.theinterfold.com/crisp-private-voting-secret-ballot-fhe-zkp-mpc/) protocol). Both modes share one **FOLD** ERC20Votes token and execute through the same DAO.

```
the-interfold-governance/
  app/        Next.js frontend — unified UI over both voting plugins
  contracts/  Foundry — DAO + plugin deployment scripts and tests
```

## How it works

The DAO uses **staged governance**. Proposals aren't created directly on a voting plugin — they
run through a **Staged Proposal Processor (SPP)** with two stages:

```
stage 0  — voting body approves      (CRISP encrypted vote / TokenVoting public vote)
stage 1  — foundation veto window    (optimistic: passes unless the foundation vetoes)
           → SPP executes on the DAO
```

There are **two SPP processes** — one wrapping the private (CRISP) body, one wrapping the public
(TokenVoting) body — sharing the same **FOLD** (`ERC20Votes` / `IVotes`) token, so voting power
(including delegation) is identical across both.

| Plugin          | Privacy | Ballot                                | Role                                |
| --------------- | ------- | ------------------------------------- | ----------------------------------- |
| CrispVoting     | Private | Yes / No / Abstain, encrypted (CRISP) | stage-0 body of the private process |
| TokenVoting 1.4 | Public  | Yes / No / Abstain, on-chain          | stage-0 body of the public process  |

- **Token-weighted, delegated voting.** Votes are weighted by FOLD voting power at the proposal
  snapshot. The CRISP fork is a fixed 3-option (Yes/No/Abstain), token-weighted (`CUSTOM`) ballot.
- **Optimistic foundation veto.** Stage 1 gives the foundation a veto window; a passed proposal
  executes unless the foundation vetoes it (a veto lets it expire). The bodies can no longer
  execute on the DAO directly — only the SPPs do — which is what makes the veto non-bypassable.
- **Creator-pays private proposals.** CRISP proposals charge an Interfold E3 fee to the creator's
  prepaid escrow on the plugin, with a per-proposal voting duration. Public proposals are free.

**→ Full mechanism: [`docs/architecture.md`](docs/architecture.md).** Component detail in
[`app/README.md`](app/README.md) and [`contracts/README.md`](contracts/README.md).

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

The app shows proposals from both SPP processes in one list (tagged **Private** / **Public**), a
create form with a privacy toggle (the private form has a fee-credit widget and a per-proposal
voting-duration picker), staged detail pages (stage-0 voting + a stage-1 veto panel), and a
**Delegation** page (delegate to yourself or others, browse delegates by voting power).

## Contracts (`contracts/`)

```bash
cd contracts
make setup             # fetch Solidity deps (git submodules under lib/ + pnpm packages)
make build
make test
```

### Deploy

`DeployInterfoldDao` creates the Interfold DAO and installs **five** plugins in one atomic
`createDao` (two voting bodies, two SPP processes, and an Admin bootstrap plugin), sharing the
existing FOLD token. `wire-spp` then configures the stages and permissions **with no vote** by
executing through the Admin plugin, which disarms itself as the last step.

```bash
cp .env.example .env   # Sepolia framework + Interfold addresses are prefilled; add your key/RPC + FOUNDATION_ADDRESS
make predeploy         # simulate (no broadcast)
make deploy            # broadcast: 5-plugin DAO + Executor
make sync-env          # write deployed addresses into contracts/.env + app/.env
make wire-spp          # Admin executes the SPP wiring in one tx, then disarms — no vote
```

`sync-env` copies every address into `app/.env` for you. The wiring and permission model are
explained in [`docs/architecture.md`](docs/architecture.md); the env reference is in
[`contracts/README.md`](contracts/README.md).

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
Interfold contracts.

Some components retain their upstream licenses and are **not** relicensed:

- `contracts/src/crisp/CrispVoting.sol` and `setup/CrispVotingSetup.sol` — **AGPL-3.0** (forked
  from gnosisguild's `crisp-aragon-plugin`).
- `app/` — **AGPL-3.0** (built on Aragon's gov-app-template).
