.PHONY: setup build test predeploy deploy sync-env wire-spp lock-public-execution \
	publish-crisp-repo prepare-private-process install-private-process disarm-admin

# Which env file the broadcasting targets source. Defaults to the Sepolia `.env`;
# override per network, e.g.  make deploy ENV_FILE=.env.mainnet
# The whole deploy chain must use the SAME value:
#   make deploy ENV_FILE=.env.mainnet && make sync-env ENV_FILE=.env.mainnet && make wire-spp ENV_FILE=.env.mainnet
ENV_FILE ?= .env
# Where sync-env writes the frontend addresses. Override for a non-default app env.
APP_ENV_FILE ?= ../app/.env
# Deploy log to write/parse. Override so a mainnet run does not clobber the Sepolia log.
DEPLOY_LOG ?= deploy.log

setup: ## Fetch Solidity deps (git submodules under lib/ + npm packages)
	git submodule update --init --recursive
	# --ignore-scripts: we only need the Solidity sources (@aragon/token-voting-plugin,
	# @enclave-e3/contracts); the skipped native builds (keccak, secp256k1, ...) are
	# runtime web3 addons that Foundry never uses.
	pnpm install --ignore-scripts

build: ## Compile
	forge build

test: ## Run tests
	forge test -vvv

# `set -a; . ./$(ENV_FILE); set +a` sources the env file through the shell, which strips
# the surrounding quotes and exports clean values for forge's vm.env* reads.
predeploy: ## Simulate the dual-plugin DAO deployment (no broadcast)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript --rpc-url $$RPC_URL -vvvv

deploy: ## Deploy: create the Interfold DAO with both plugins (tees output to $(DEPLOY_LOG))
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv | tee $(DEPLOY_LOG)

sync-env: ## Patch $(APP_ENV_FILE) + contracts/$(ENV_FILE) from the last deploy log
	CONTRACTS_ENV=$(ENV_FILE) APP_ENV=$(APP_ENV_FILE) ./script/sync-env.sh $(DEPLOY_LOG)

wire-spp: ## Bootstrap: proposal wiring SPP stages + permissions (run after deploy + sync-env)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv

# --- Phase 2: install the private process into a live, public-only DAO ---------------
# Run in order. Each step prints values that must be written into $(ENV_FILE) before the
# next one; see docs/mainnet-deployment.md. Requires the Admin bootstrap to still be armed
# (phase 1 ran wire-spp with DISARM_ADMIN=false).

publish-crisp-repo: ## Phase 2 step 1: deploy CrispVotingSetup + mint the CRISP PluginRepo (EOA)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--sig "publishCrispRepo()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

prepare-private-process: ## Phase 2 step 2: prepareInstallation for the CRISP body + private SPP (EOA, DAO untouched)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--sig "prepare()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

install-private-process: ## Phase 2 step 3: Admin applies both installs + wires the private process (does NOT disarm)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv

print-private-actions: ## Print the phase-2 actions as proposal calldata (no broadcast; use if Admin is already disarmed)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--sig "printProposalActions()" --rpc-url $$RPC_URL -vvvv

# Deliberately standalone: disarming is never bundled into a deploy or an install, so it is
# always an explicit, reviewed action. IRREVERSIBLE without a governance proposal.
disarm-admin: ## Revoke the Admin bootstrap's EXECUTE on the DAO (INV-29). Run when done installing.
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript \
		--sig "disarmAdmin()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

publish-crisp-build: ## Publish a new CRISP build into the EXISTING plugin repo (run after changing CrispVotingSetup)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/PublishCrispBuild.s.sol:PublishCrispBuild \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv

# DEPRECATED: superseded by the SPP veto stage (wire-spp). Kept for reference only.
lock-public-execution: ## Bootstrap: create a proposal locking public execution to the foundation
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/LockPublicExecution.s.sol:LockPublicExecutionScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv
