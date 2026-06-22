# Interfold governance contracts

`DeployInterfoldDao.s.sol` creates the Interfold DAO and installs **both** governance plugins
in one atomic `createDao` call, sharing a single **FOLD** token:

| Plugin           | Privacy | Source                                                |
| ---------------- | ------- | ----------------------------------------------------- |
| CrispVoting      | Private | **forked** into `src/crisp/` (governance variant), published fresh |
| TokenVoting v1.4 | Public  | Aragon canonical PluginRepo (referenced by address)   |

The CRISP plugin is a **fork** of `crisp-aragon-plugin` vendored under `src/crisp/` (only
`CrispVoting.sol` + `CrispVotingSetup.sol` are modified; the interfaces are unchanged copies).
Changes: `createProposal` always uses a **3-option (Yes/No/Abstain) ballot weighted by token +
delegate voting power (`CUSTOM`)**, and `execute` is gated by `EXECUTE_PROPOSAL_PERMISSION`
granted to a **foundation** address (veto power).

Dependencies are declared directly by this project — git submodules under `lib/` (OSx,
OpenZeppelin, forge-std, ENS) pinned to the same commits the plugin used, plus npm packages
(`@enclave-e3/contracts`, `@aragon/token-voting-plugin`) in `package.json`. Run `make setup`
(`git submodule update --init --recursive` + `pnpm install`) to fetch everything.

Aragon's `DAOFactory` grants each installed plugin `EXECUTE_PERMISSION` on the DAO, so both
plugins execute governance actions through the DAO (each plugin's `targetConfig.target` is
`address(0)`, which OSx 1.4 resolves to the DAO).

TokenVoting is referenced purely by its published repo address + version tag, with install
params ABI-encoded as bytes (`TokenVotingInstall.sol`) — so the v1.4 source is never compiled
here (avoiding the `GovernanceERC20` version clash with crisp-aragon-plugin's bundled copy).

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
  canonical TokenVoting v1.4 `PluginRepo` address + build for the target network. Pick from
  <https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json>.

## Deploy

```bash
cp .env.example .env   # fill in the values
make predeploy         # simulate
make deploy            # broadcast
```

The script logs the DAO, the shared FOLD token, the CRISP `PluginRepo`, and both installed
plugin addresses (index 0 = CRISP/private, index 1 = TokenVoting/public).

### Foundation veto

- **Private (CRISP):** baked in at install — `execute` requires `EXECUTE_PROPOSAL_PERMISSION`,
  granted to `FOUNDATION_ADDRESS` by the forked setup.
- **Public (TokenVoting):** the canonical plugin gates `execute` the same way but grants the
  permission to `ANY_ADDR` (anyone can execute). To match CRISP, run a one-time bootstrap after
  deploy — it creates a governance proposal that revokes `EXECUTE_PROPOSAL` from `ANY_ADDR` and
  grants it to the foundation:

  ```bash
  # set DAO_ADDRESS + TOKEN_VOTING_PLUGIN_ADDRESS (from the deploy output) in .env, then:
  make lock-public-execution
  ```

  The caller needs FOLD voting power; the proposal is created with a Yes vote + early execution,
  so a passing majority locks it down in one step. Reversible later via governance (the DAO is
  ROOT on the permission).

## Wire outputs into `app/.env`

| Script output                | Frontend env var                          |
| ---------------------------- | ----------------------------------------- |
| DAO                          | `NEXT_PUBLIC_DAO_ADDRESS`                  |
| FOLD token (shared)          | `NEXT_PUBLIC_TOKEN_ADDRESS`               |
| CRISP plugin (PRIVATE)       | `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` |
| TokenVoting plugin (PUBLIC)  | `NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS` |
| Deployment block (from logs) | `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK`     |
