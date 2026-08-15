#!/usr/bin/env bash
#
# sync-env.sh — patch app/.env and contracts/.env from a `make deploy` run.
#
# The DAO + plugin addresses are only emitted to the deploy console log (they are
# created inside the DAOFactory, not as top-level broadcast deployments), so we
# parse them from the log. The deployment block comes from the broadcast receipt.
#
# Usage:
#   ./script/sync-env.sh [deploy.log]
#
# Defaults to ./deploy.log (written by `make deploy`).
#
# CONTRACTS_ENV and APP_ENV may be overridden to target a non-default env file —
# this is how `make sync-env ENV_FILE=.env.mainnet` keeps a mainnet run from
# patching the Sepolia `.env`. Relative paths resolve against contracts/ and the
# repo root respectively.

set -euo pipefail

CONTRACTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "${CONTRACTS_DIR}/.." && pwd)"
LOG_FILE="${1:-${CONTRACTS_DIR}/deploy.log}"
# Resolve to absolute so the values are stable regardless of the caller's cwd.
abs_path() { case "$1" in /*) printf '%s' "$1";; *) printf '%s/%s' "$2" "$1";; esac; }
APP_ENV="$(abs_path "${APP_ENV:-app/.env}" "${ROOT_DIR}")"
CONTRACTS_ENV="$(abs_path "${CONTRACTS_ENV:-.env}" "${CONTRACTS_DIR}")"

if [[ ! -f "${LOG_FILE}" ]]; then
  echo "error: deploy log not found: ${LOG_FILE}" >&2
  echo "run 'make deploy' first (it tees output to deploy.log), or pass the log path." >&2
  exit 1
fi

# Pull the address that follows a given console2.log label.
# A missing label is NOT an error — a public-only deploy logs no CRISP/private-SPP address.
# Without the `|| true` the empty grep would exit the whole script under `set -e`, because
# the exit status of an assignment is the exit status of its command substitution.
addr_for() {
  grep -F "$1" "${LOG_FILE}" 2>/dev/null | grep -oE '0x[a-fA-F0-9]{40}' | tail -1 || true
}

DAO_ADDRESS="$(addr_for 'DAO:')"
FOLD_ADDRESS="$(addr_for 'FOLD token (shared):')"
CRISP_PLUGIN="$(addr_for 'CRISP plugin (PRIVATE body):')"
TOKEN_VOTING_PLUGIN="$(addr_for 'TokenVoting plugin (PUBLIC body):')"
SPP_PRIVATE="$(addr_for 'SPP plugin (PRIVATE process):')"
SPP_PUBLIC="$(addr_for 'SPP plugin (PUBLIC process):')"
EXECUTOR="$(addr_for 'Executor (delegatecall target):')"
ADMIN_PLUGIN="$(addr_for 'Admin plugin (bootstrap):')"

# Deployment block: smallest receipt blockNumber (hex) in the latest broadcast.
# Newest run-latest.json under a chainId dir (excluding dry-run), by mtime.
RUN_JSON=""
_newest=0
while IFS= read -r f; do
  [[ "${f}" == *"/dry-run/"* ]] && continue
  m="$(stat -f %m "${f}" 2>/dev/null || stat -c %Y "${f}" 2>/dev/null || echo 0)"
  if (( m >= _newest )); then _newest="${m}"; RUN_JSON="${f}"; fi
done < <(find "${CONTRACTS_DIR}/broadcast/DeployInterfoldDao.s.sol" -name run-latest.json 2>/dev/null)
DEPLOY_BLOCK=""
if [[ -n "${RUN_JSON}" && -f "${RUN_JSON}" ]]; then
  # blockNumbers are hex strings ("0x..."); convert each to decimal, take the min.
  DEPLOY_BLOCK="$(jq -r '.receipts[].blockNumber' "${RUN_JSON}" 2>/dev/null \
    | while read -r bn; do printf '%d\n' "${bn}"; done \
    | sort -n | head -1 || true)"
fi

# The public body always exists. The CRISP body does NOT in a public-only (phased) deploy —
# `DEPLOY_PRIVATE_PROCESS=false` installs three plugins and never logs a CRISP address, so
# it is optional here. `set_env` skips empty values, leaving any existing entry untouched.
if [[ -z "${DAO_ADDRESS}" || -z "${TOKEN_VOTING_PLUGIN}" ]]; then
  echo "error: could not parse the required addresses from ${LOG_FILE}" >&2
  echo "  DAO=${DAO_ADDRESS} TOKENVOTING=${TOKEN_VOTING_PLUGIN}" >&2
  exit 1
fi

if [[ -z "${CRISP_PLUGIN}" || -z "${SPP_PRIVATE}" ]]; then
  echo "note: no private process in this deploy (public-only phase)." >&2
  echo "      CRISP_VOTING_PLUGIN_ADDRESS / SPP_PRIVATE_ADDRESS are left as-is." >&2
fi

# Set KEY=VALUE in an env file: replace the line if the key exists, else append.
set_env() {
  local file="$1" key="$2" value="$3"
  [[ -z "${value}" ]] && return 0
  touch "${file}"
  if grep -qE "^${key}=" "${file}"; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="${key}" -v v="${value}" -F= '
      $1==k { print k"="v; next }
      { print }
    ' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
  echo "  ${key}=${value}"
}

echo "Parsed from deploy:"
echo "  DAO                 ${DAO_ADDRESS}"
echo "  FOLD token          ${FOLD_ADDRESS:-<unchanged>}"
echo "  CRISP plugin        ${CRISP_PLUGIN}"
echo "  TokenVoting plugin  ${TOKEN_VOTING_PLUGIN}"
echo "  SPP private         ${SPP_PRIVATE:-<not found>}"
echo "  SPP public          ${SPP_PUBLIC:-<not found>}"
echo "  Executor            ${EXECUTOR:-<not found>}"
echo "  Admin plugin        ${ADMIN_PLUGIN:-<not found>}"
echo "  Deployment block    ${DEPLOY_BLOCK:-<not found>}"
echo

echo "Patching ${APP_ENV}:"
set_env "${APP_ENV}" NEXT_PUBLIC_DAO_ADDRESS "${DAO_ADDRESS}"
set_env "${APP_ENV}" NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS "${CRISP_PLUGIN}"
set_env "${APP_ENV}" NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS "${TOKEN_VOTING_PLUGIN}"
set_env "${APP_ENV}" NEXT_PUBLIC_SPP_PRIVATE_ADDRESS "${SPP_PRIVATE}"
set_env "${APP_ENV}" NEXT_PUBLIC_SPP_PUBLIC_ADDRESS "${SPP_PUBLIC}"
set_env "${APP_ENV}" NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK "${DEPLOY_BLOCK}"
# The DAO's *voting* token and the app's *user* token are not always the same contract.
#
# `FOLD_TOKEN_ADDRESS` may be a `BondedVotes` adapter, so that a round counts FOLD bonded as
# ciphernode collateral as well as FOLD held in a wallet. The adapter is read-only: `delegate()`
# reverts `DelegationNotSupported` and it emits no `DelegateChanged`. Writing it to
# NEXT_PUBLIC_TOKEN_ADDRESS therefore breaks delegation and empties the members list, while
# looking entirely correct.
#
# Probe `token()` to tell the two apart: an adapter answers with the underlying token, a plain
# ERC20Votes has no such function. Falls back to the previous behaviour when `cast` or an RPC is
# unavailable, since this script otherwise needs neither.
# CRISP program: propagated from the contracts env, which is the value the plugin was actually
# installed with (`Utils.readCrispEnv()` feeds it into `PluginInitParams`). Redeploying CRISP
# changes it, and a stale value points the app at a program the DAO's rounds do not run on.
if [[ -n "${CRISP_PROGRAM_ADDRESS:-}" ]]; then
  set_env "${APP_ENV}" NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS "${CRISP_PROGRAM_ADDRESS}"
fi

# Faucet: only exists on testnets, so absence is normal rather than an error. Redeploying the
# protocol replaces it, and a stale address silently dispenses nothing — the symptom is a faucet
# button that appears to work against a dead contract.
if [[ -n "${FAUCET_ADDRESS:-}" ]]; then
  set_env "${APP_ENV}" NEXT_PUBLIC_FAUCET_ADDRESS "${FAUCET_ADDRESS}"
fi

# The fee token is read from the plugin rather than the deploy log: the plugin caches it at
# `initialize` (`interfoldFeeToken = interfold.feeToken()`), so this is the exact contract a
# deposit will pull from. Left stale, the app approves one token and the plugin pulls another —
# the approval succeeds, the deposit reverts ERC20InsufficientAllowance, and nothing points at the
# address as the cause.
if command -v cast >/dev/null 2>&1 && [[ -n "${RPC_URL:-}" && -n "${CRISP_PLUGIN}" ]]; then
  FEE_TOKEN="$(cast call "${CRISP_PLUGIN}" 'interfoldFeeToken()(address)' --rpc-url "${RPC_URL}" 2>/dev/null || true)"
  if [[ "${FEE_TOKEN}" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    set_env "${APP_ENV}" NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS "${FEE_TOKEN}"
  fi
fi

UNDERLYING_TOKEN=""
if command -v cast >/dev/null 2>&1 && [[ -n "${RPC_URL:-}" ]]; then
  UNDERLYING_TOKEN="$(cast call "${FOLD_ADDRESS}" 'token()(address)' --rpc-url "${RPC_URL}" 2>/dev/null || true)"
fi

if [[ "${UNDERLYING_TOKEN}" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "  (${FOLD_ADDRESS} is a bonded-votes adapter over ${UNDERLYING_TOKEN})"
  set_env "${APP_ENV}" NEXT_PUBLIC_TOKEN_ADDRESS "${UNDERLYING_TOKEN}"
  set_env "${APP_ENV}" NEXT_PUBLIC_BONDED_VOTES_ADDRESS "${FOLD_ADDRESS}"
else
  # Either a plain token, or the probe could not run. Balances and votes then come from the token
  # itself, and bonded weight is invisible until NEXT_PUBLIC_BONDED_VOTES_ADDRESS is set by hand.
  set_env "${APP_ENV}" NEXT_PUBLIC_TOKEN_ADDRESS "${FOLD_ADDRESS}"
fi
# Deployment-derived values this script cannot resolve. Named explicitly, because every address
# that broke after the last redeploy broke by being silently stale, not by erroring.
for manual in NEXT_PUBLIC_TOKEN_DEPLOYMENT_BLOCK NEXT_PUBLIC_BRIDGE_ADDRESS; do
  echo "  note: ${manual} is not synced — update it by hand if the deployment changed"
done
echo

echo "Patching ${CONTRACTS_ENV}:"
set_env "${CONTRACTS_ENV}" DAO_ADDRESS "${DAO_ADDRESS}"
set_env "${CONTRACTS_ENV}" CRISP_VOTING_PLUGIN_ADDRESS "${CRISP_PLUGIN}"
set_env "${CONTRACTS_ENV}" TOKEN_VOTING_PLUGIN_ADDRESS "${TOKEN_VOTING_PLUGIN}"
set_env "${CONTRACTS_ENV}" SPP_PRIVATE_ADDRESS "${SPP_PRIVATE}"
set_env "${CONTRACTS_ENV}" SPP_PUBLIC_ADDRESS "${SPP_PUBLIC}"
set_env "${CONTRACTS_ENV}" EXECUTOR_ADDRESS "${EXECUTOR}"
set_env "${CONTRACTS_ENV}" ADMIN_PLUGIN_ADDRESS "${ADMIN_PLUGIN}"
echo

echo "Done. Review the diffs before committing."
