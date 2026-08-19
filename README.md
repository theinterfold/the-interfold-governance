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
- An RPC endpoint (Alchemy/Infura) and a funded deployer key for the target network

## From a fresh clone

```bash
git clone <repo-url> the-interfold-governance
cd the-interfold-governance

bun install            # root tooling (Prettier)

cd contracts
make setup             # git submodules under lib/ + pnpm Solidity deps
make build
make test              # 68 tests; src/crisp/** is held at 100% coverage by CI

cd ../app
bun install
bun run build          # typecheck + build
```

That is the whole local setup — no deployment required to run the test suites. To point the app at
an existing deployment, fill `app/.env` from `app/.env.example`; to stand up your own, see
[Deploying to Sepolia](#deploying-to-sepolia) below.

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

Every deploy command takes `ENV_FILE` (default `.env`), so each network gets its own env file and
they never overwrite each other's addresses. **The whole chain must use the same value** — `deploy`,
`sync-env` and `wire-spp` each read it.

## Deploying to Sepolia

The single-phase flow: one `createDao` installs **five** plugins (two voting bodies, two SPP
processes, an Admin bootstrap), sharing the existing FOLD token. `wire-spp` then configures stages
and permissions **with no vote** by executing through the Admin plugin, which disarms itself as the
last action.

```bash
cd contracts
cp .env.example .env   # Sepolia framework + Interfold addresses are prefilled;
                       # add PRIVATE_KEY, RPC_URL, FOUNDATION_ADDRESS

make predeploy         # simulate (no broadcast) — read the trace before continuing
make deploy            # broadcast: 5-plugin DAO + Executor
make sync-env          # write deployed addresses into contracts/.env + app/.env
make wire-spp          # Admin executes the SPP wiring in one tx, then disarms — no vote
```

Strict order; everything except `sync-env` broadcasts. `sync-env` copies every address into
`app/.env` for you.

Sepolia defaults are **testing values** — 10-minute vote windows, quorum disabled
(`MINIMUM_PARTICIPATION=0`), and the faucet enabled. Do not carry them to mainnet.

## Deploying to mainnet

Mainnet is **phased**, because the private (CRISP) process depends on infrastructure — an Interfold
E3 coordinator, a CRISP program, a ciphernode set — that does not exist on mainnet yet. Public
governance goes live first; the private process is installed into the same live DAO later.

```
Phase 1  DAO + FOLD + TokenVoting body + one SPP + Admin bootstrap   (public governance live)
Phase 2  install the CRISP body + a second SPP into the live DAO     (private governance live)
Phase 2b hand the Admin bootstrap to the foundation multisig         (optional, two steps)
Phase 3  disarm the Admin bootstrap                                  (deliberate, separate step)
```

`contracts/.env.mainnet.example` is the production parameter set: OSx v1.4.0 factories, the
canonical mainnet plugin repos, and production quorum/timings (10% quorum, 3-day votes, 2-day
foundation window) rather than Sepolia's testing values. Every address in it was verified on-chain.

```bash
cd contracts
cp .env.mainnet.example .env.mainnet   # then fill the four TODO(mainnet) entries

make predeploy ENV_FILE=.env.mainnet
make deploy    ENV_FILE=.env.mainnet DEPLOY_LOG=deploy.mainnet.log
make sync-env  ENV_FILE=.env.mainnet DEPLOY_LOG=deploy.mainnet.log
make wire-spp  ENV_FILE=.env.mainnet
```

Four things must be filled before phase 1 can run — the template marks each `TODO(mainnet)`:
`FOLD_TOKEN_ADDRESS`, `FOUNDATION_ADDRESS` (**a multisig, never an EOA**), and — for phase 2 only —
`INTERFOLD_ADDRESS` and `CRISP_PROGRAM_ADDRESS`.

Phase 2 (`publish-crisp-repo` → `prepare-private-process` → `install-private-process`) and phase 3
(`disarm-admin`) are commands too. **Disarming is never bundled into a deploy or an install** — it
is always its own explicit step, so a failed install is never entangled with an irreversible revoke.

> Between phases 1 and 2 the Admin bootstrap stays **armed**, which is what lets phase 2 install
> plugins without a vote. During that window one key can execute anything on the DAO. Keep the
> treasury empty until phase 3 is done.

### Handing the bootstrap to the multisig (phase 2b, optional)

The bootstrap holds `EXECUTE` on the DAO; **who** may drive it is a separate permission
(`EXECUTE_PROPOSAL_PERMISSION` on the Admin plugin, granted to `ADMIN_ADDRESS` at install).
Rotating that grant moves the bootstrap from the deployer EOA to the foundation multisig without
touching the DAO's own permissions — so the EOA runs the scripted, retry-prone steps and only then
passes control on.

```bash
make grant-admin  ENV_FILE=.env.mainnet   # 1. EOA grants ADMIN_SUCCESSOR_ADDRESS
                                          # 2. successor executes a NO-OP proposal — must succeed
make revoke-admin ENV_FILE=.env.mainnet   # 3. EOA revokes itself
```

**Two commands on purpose.** Between them both holders can drive the bootstrap, so the successor
proves it can execute before the EOA gives up the only key. Batched, a misconfigured successor
leaves the bootstrap armed with nobody able to drive it. Step 2 is not optional: it is what
detects a grant that does not satisfy the plugin's auth check.

Rotation does **not** disarm — phase 3 is still outstanding afterwards. Note the tension worth
deciding before phase 2: rotate first and the multisig signs the 7-action install batch; rotate
after and the EOA is what installed the private process.

> One argument for _not_ rotating: with `SPP_STAGE1_MODE="approval"`, a lost foundation key
> freezes governance permanently. An armed bootstrap held by a **separate** key is the escape
> hatch from that. Put both in the same multisig and one signer set covers both failures.

**→ Full runbook, verification commands and failure modes:
[`docs/mainnet-deployment.md`](docs/mainnet-deployment.md).** The wiring and permission model are
explained in [`docs/architecture.md`](docs/architecture.md); the env reference is in
[`contracts/README.md`](contracts/README.md); the post-deploy security checks are in
[`SECURITY.md`](SECURITY.md).

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
