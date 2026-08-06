.PHONY: setup build test predeploy deploy sync-env wire-spp lock-public-execution

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

# `set -a; . ./.env; set +a` sources .env through the shell, which strips the
# surrounding quotes and exports clean values for forge's vm.env* reads.
predeploy: ## Simulate the dual-plugin DAO deployment (no broadcast)
	set -a; . ./.env; set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript --rpc-url $$RPC_URL -vvvv

deploy: ## Deploy: create the Interfold DAO with both plugins (tees output to deploy.log)
	set -a; . ./.env; set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv | tee deploy.log

sync-env: ## Patch app/.env + contracts/.env from the last deploy.log
	./script/sync-env.sh deploy.log

wire-spp: ## Bootstrap: proposal wiring SPP stages + permissions (run after deploy + sync-env)
	set -a; . ./.env; set +a; \
	forge script script/WireSpp.s.sol:WireSppScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv

publish-crisp-build: ## Publish a new CRISP build into the EXISTING plugin repo (run after changing CrispVotingSetup)
	set -a; . ./.env; set +a; \
	forge script script/PublishCrispBuild.s.sol:PublishCrispBuild \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv

# DEPRECATED: superseded by the SPP veto stage (wire-spp). Kept for reference only.
lock-public-execution: ## Bootstrap: create a proposal locking public execution to the foundation
	set -a; . ./.env; set +a; \
	forge script script/LockPublicExecution.s.sol:LockPublicExecutionScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv
