.PHONY: setup build test predeploy deploy

setup: ## Fetch the crisp-aragon-plugin submodule + its deps
	git submodule update --init --recursive
	# --ignore-scripts: we only need the Solidity sources (@aragon/token-voting-plugin,
	# @enclave-e3/contracts); the skipped native builds (keccak, secp256k1, ...) are
	# runtime web3 addons that Foundry never uses.
	cd lib/crisp-aragon-plugin && pnpm install --ignore-scripts

build: ## Compile
	forge build

test: ## Run tests
	forge test -vvv

# `set -a; . ./.env; set +a` sources .env through the shell, which strips the
# surrounding quotes and exports clean values for forge's vm.env* reads.
predeploy: ## Simulate the dual-plugin DAO deployment (no broadcast)
	set -a; . ./.env; set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript --rpc-url $$RPC_URL -vvvv

deploy: ## Deploy: create the Interfold DAO with both plugins
	set -a; . ./.env; set +a; \
	forge script script/DeployInterfoldDao.s.sol:DeployInterfoldDaoScript \
		--rpc-url $$RPC_URL --broadcast --slow -vvvv
