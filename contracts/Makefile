.PHONY: setup build test predeploy deploy sync-env wire-spp lock-public-execution \
	publish-crisp-repo prepare-private-process install-private-process \
	grant-admin revoke-admin disarm-admin \
	deploy-executor safe-deploy-executor simulate-public-install simulate-public-governance \
	safe-prepare-public safe-install-public simulate-stage-change safe-update-stages simulate-approval-window dry-run-public print-rotation simulate-rotation simulate-body-execution simulate-quorum-change

# Which env file the broadcasting targets source. Defaults to the Sepolia `.env`;
# override per network, e.g.  make deploy ENV_FILE=.env.mainnet
# The whole deploy chain must use the SAME value:
#   make deploy ENV_FILE=.env.mainnet && make sync-env ENV_FILE=.env.mainnet && make wire-spp ENV_FILE=.env.mainnet
ENV_FILE ?= .env
# Where sync-env writes the frontend addresses. Override for a non-default app env.
# Relative paths resolve against the REPO ROOT (sync-env.sh), not contracts/ — so this is
# `app/.env`, not `../app/.env`, which would land outside the repo.
APP_ENV_FILE ?= app/.env
# Deploy log to write/parse. Override so a mainnet run does not clobber the Sepolia log.
DEPLOY_LOG ?= deploy.log

setup: ## Fetch Solidity deps (git submodules under lib/ + npm packages)
	git submodule update --init --recursive
	# --ignore-scripts: we only need the Solidity sources (@aragon/token-voting-plugin);
	# the skipped native builds (keccak, secp256k1, ...) are runtime web3 addons that
	# Foundry never uses.
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
# Sources the env file for RPC_URL only, so the script can ask whether the DAO's voting token is a
# BondedVotes adapter over the real token. Without it the probe is skipped and the adapter address
# lands in NEXT_PUBLIC_TOKEN_ADDRESS, which breaks delegation in the app while looking correct.
	set -a; . ./$(ENV_FILE); set +a; 	CONTRACTS_ENV=$(ENV_FILE) APP_ENV=$(APP_ENV_FILE) ./script/sync-env.sh $(DEPLOY_LOG)

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

print-crisp-install-data: ## Print CRISP + private-SPP install params for the Safe-only prepare flow (no broadcast)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--sig "printInstallData()"

print-private-actions: ## Print the phase-2 actions as proposal calldata (no broadcast; use if Admin is already disarmed)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPrivateProcess.s.sol:InstallPrivateProcessScript \
		--sig "printProposalActions()" --rpc-url $$RPC_URL -vvvv

# --- Multisig-signable actions (DAO execute rights held by the foundation Safe) -------
# One Safe Transaction Builder file per action, written to out/safe/. Each is loadable on its
# own, so you sign, verify on chain, then move to the next. The EOA `prepare` steps above are
# unchanged: they touch nothing the DAO owns and need no signature.
safe-deploy-crisp-stack: ## Safe action: deploy bases + CrispVoting impl + CrispVotingSetup via CREATE2 (one atomic batch)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "deployCrispStack()" --rpc-url $$RPC_URL

safe-deploy-setup: ## Safe action: deploy a plugin setup via the CREATE2 deployer
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "deploySetupViaCreate2()" --rpc-url $$RPC_URL

safe-create-repo: ## Safe action: mint the CRISP plugin repo with the Safe as maintainer
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "createRepo()" --rpc-url $$RPC_URL

# Read the InstallationPrepared event from the receipt afterwards: applyInstallation needs the
# plugin address, permissions and helpers hash it emits, and they cannot be predicted.
safe-prepare-install: ## Safe action: prepareInstallation for one plugin (see PLUGIN_PREFIX)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	PLUGIN_PREFIX=$(PLUGIN_PREFIX) PLUGIN_SLUG=$(PLUGIN_SLUG) \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "prepareInstall()" --rpc-url $$RPC_URL

# Reads the InstallationPrepared event straight from the prepare receipt, so the values
# applyInstallation re-derives its setup id from are never transcribed by hand.
#   make read-prepared TX=0x… PLUGIN_PREFIX=CRISP >> .env
read-prepared: ## Print the <PREFIX>_* env lines from a prepare transaction receipt
	set -a; . ./$(ENV_FILE); set +a; \
	./script/read-prepared.sh $(TX) $(PLUGIN_PREFIX) $$RPC_URL

# Emitted as ONE file: stages without grants, or grants without stages, is a broken process.
safe-wire: ## Safe action: SPP stages + CREATE_PROPOSAL grants + target config (atomic)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "wireProcess()" --rpc-url $$RPC_URL

# --- Install the PUBLIC process into an ALREADY-DEPLOYED, Admin-only DAO ---------------
# For a DAO the DAOFactory created with the Admin bootstrap alone, where TokenVoting and the
# public SPP are added afterwards through the PluginSetupProcessor. Order:
#   1. make deploy-executor              (EOA; prints EXECUTOR_ADDRESS -> write it into the env)
#      or make safe-deploy-executor      (no EOA: Safe file via CREATE2; address known pre-signing)
#   2. make simulate-public-install      (fork; asserts the end state before anything is signed)
#   3. make simulate-public-governance   (fork; drives a real proposal all the way to execution)
#   4. make safe-prepare-public          (two Safe files; execute them, then read the receipts)
#   5. make read-prepared TX=0x… PLUGIN_PREFIX=TOKEN_VOTING >> .env.mainnet
#      make read-prepared TX=0x… PLUGIN_PREFIX=SPP_PUBLIC   >> .env.mainnet
#   6. make safe-install-public          (ONE atomic Safe file: apply + wire)

deploy-executor: ## Deploy the stateless Executor the bodies delegatecall into (EOA, no privileges)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript \
		--sig "deployExecutor()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

safe-deploy-executor: ## Safe action: deploy the Executor via CREATE2 (no EOA; address known pre-signing)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript \
		--sig "emitDeployExecutor()" --rpc-url $$RPC_URL

simulate-public-install: ## Fork-simulate the public install and assert the resulting permissions
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulate()"

simulate-public-governance: ## Fork-simulate a full proposal: create -> vote -> advance -> approve -> execute
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulateGovernance()"

safe-prepare-public: ## Safe actions: prepareInstallation for the TokenVoting body and the public SPP
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript \
		--sig "emitPrepare()" --rpc-url $$RPC_URL

# ATOMIC ON PURPOSE. Between an apply and a separate wiring tx, TokenVoting holds EXECUTE on the
# DAO while CREATE_PROPOSAL is open to any FOLD holder - i.e. a live bypass of the foundation
# stage. Never split this file into its constituent actions.
safe-install-public: ## Safe action: apply BOTH prepared installs and wire the process, in one tx
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript \
		--sig "emitApplyAndWire()" --rpc-url $$RPC_URL

# Retiming after the fact. The DAO holds UPDATE_STAGES on the SPP, so the windows are NOT frozen
# at install: edit the SPP_* durations in the env file and re-emit. Applies to proposals created
# after it lands; in-flight ones keep the config they were created under.
simulate-stage-change: ## Fork-simulate a stage-config change and prove in-flight proposals are unaffected
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulateStageChange()"

dry-run-public: ## Print all three Safe transactions on a fork, executing each as it goes
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "dryRun()"

simulate-body-execution: ## Fork-check INV-5: the body executes its sub-proposal via the Executor
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulateBodyExecution()"

simulate-quorum-change: ## Fork-check that raising the quorum mid-proposal does not affect open proposals
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulateQuorumChangeMidFlight()"

simulate-approval-window: ## Fork-check who may execute after the foundation approves, and for how long
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript --sig "simulateApprovalWindow()"

safe-update-stages: ## Safe action: rewrite the public SPP stage config from the current env timings
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/InstallPublicProcess.s.sol:InstallPublicProcessScript \
		--sig "emitUpdateStages()" --rpc-url $$RPC_URL

safe-grant-root: ## Safe action: grant ROOT on the DAO to the PluginSetupProcessor
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "grantRootToPsp()" --rpc-url $$RPC_URL

safe-revoke-root: ## Safe action: revoke ROOT from the PluginSetupProcessor (closes installs)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "revokeRootFromPsp()" --rpc-url $$RPC_URL

# PLUGIN_PREFIX selects which <PREFIX>_* prepared values to read; PLUGIN_SLUG names the file.
#   make safe-apply-install PLUGIN_PREFIX=SPP_PUBLIC PLUGIN_SLUG=01-install-spp-public
safe-apply-install: ## Safe action: applyInstallation for one prepared plugin (see PLUGIN_PREFIX)
	set -a; . ./$(ENV_FILE); set +a; mkdir -p safe-actions; \
	PLUGIN_PREFIX=$(PLUGIN_PREFIX) PLUGIN_SLUG=$(PLUGIN_SLUG) \
	forge script script/SafeActions.s.sol:SafeActionsScript \
		--sig "applyInstall()" --rpc-url $$RPC_URL

# --- Hand the Admin bootstrap from the deployer EOA to the foundation multisig -------
# Two steps ON PURPOSE. Between them both holders can drive the bootstrap, so the successor
# proves it can execute before the EOA gives up the only key. Never batch them.
#   1. make grant-admin      (EOA grants ADMIN_SUCCESSOR_ADDRESS)
#   2. successor executes a NO-OP proposal on the Admin plugin — must succeed
#   3. make revoke-admin     (EOA revokes itself)
# Rotation does NOT disarm; `make disarm-admin` is still outstanding afterwards.

print-rotation: ## Print the rotation calldata without broadcasting (drive it from a wallet/Safe/Aragon app)
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript --sig "printRotation()"

simulate-rotation: ## Fork-rehearse the full rotation: grant -> successor no-op -> revoke
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript --sig "simulateRotation()"

grant-admin: ## Rotation step 1: grant ADMIN_SUCCESSOR_ADDRESS the right to drive the Admin bootstrap
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript \
		--sig "grantAdminTo()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

revoke-admin: ## Rotation step 2: revoke the predecessor (default: this key). ONLY after the successor's no-op proposal succeeded.
	set -a; . ./$(ENV_FILE); set +a; \
	forge script script/WireSpp.s.sol:WireSppScript \
		--sig "revokeAdminFrom()" --rpc-url $$RPC_URL --broadcast --slow -vvvv

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
