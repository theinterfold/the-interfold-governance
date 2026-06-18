# Interfold governance contracts

`DeployInterfoldDao.s.sol` creates the Interfold DAO and installs **both** governance plugins
in one atomic `createDao` call, sharing a single **FOLD** token:

| Plugin           | Privacy | Source                          |
| ---------------- | ------- | ------------------------------- |
| CrispVoting      | Private | submodule `lib/crisp-aragon-plugin` (published fresh) |
| TokenVoting v1.4 | Public  | Aragon canonical PluginRepo (referenced by address)   |

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

## Wire outputs into `app/.env`

| Script output                | Frontend env var                          |
| ---------------------------- | ----------------------------------------- |
| DAO                          | `NEXT_PUBLIC_DAO_ADDRESS`                  |
| FOLD token (shared)          | `NEXT_PUBLIC_TOKEN_ADDRESS`               |
| CRISP plugin (PRIVATE)       | `NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS` |
| TokenVoting plugin (PUBLIC)  | `NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS` |
| Deployment block (from logs) | `NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK`     |
