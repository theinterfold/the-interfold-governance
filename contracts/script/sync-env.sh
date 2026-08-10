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
# FOLD only changes if you redeployed the token; harmless to keep in sync.
set_env "${APP_ENV}" NEXT_PUBLIC_TOKEN_ADDRESS "${FOLD_ADDRESS}"
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
