import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const contracts = fileURLToPath(new URL("..", import.meta.url));

test("mainnet templates produce the required CRISP policy", () => {
  for (const template of [".env.mainnet.example", ".env.mainnet.install"]) {
    const values = execFileSync(
      "bash",
      [
        "-c",
        'source "$1"; printf "%s\\n" "$MINIMUM_VOTER_VOTING_POWER" "$PARAM_SET" "$COMMITTEE_SIZE" "$MINIMUM_DURATION" "$SPP_PRIVATE_VOTE_DURATION"',
        "bash",
        path.join(contracts, template),
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");

    assert.equal(BigInt(values[0]), 71n * 10n ** 18n, template);
    assert.equal(values[1], "2", template);
    assert.equal(values[2], "2", template);
    assert.ok(BigInt(values[3]) >= 432000n, template);
    assert.ok(BigInt(values[4]) >= BigInt(values[3]), template);
  }
});

for (const [failure, expectedStatus, expectedCalls] of [
  ["printing_fails", false, ["print"]],
  ["only_crisp", false, ["print"]],
  ["only_spp", false, ["print"]],
  ["crisp_prepare_fails", false, ["print", "CRISP=0x1234"]],
  ["success", true, ["print", "CRISP=0x1234", "SPP_PRIVATE=0x5678"]],
]) {
  test(`private preparation: ${failure}`, () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "safe-prepare-"));
    try {
      mkdirSync(path.join(fixture, "bin"));
      writeFileSync(
        path.join(fixture, ".env.fixture"),
        [
          "CRISP_PROGRAM_ADDRESS=0x1111111111111111111111111111111111111111",
          "SPP_PRIVATE_METADATA_URI=ipfs://test",
          "RPC_URL=https://rpc.invalid",
          "CRISP_INSTALL_DATA=0xdead",
          "SPP_PRIVATE_INSTALL_DATA=0xbeef",
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(fixture, "bin/forge"),
        `#!/bin/sh
case "$*" in
  *printInstallData*)
    printf 'print\\n' >> "$CALL_LOG"
    [ "$FAILURE" = only_spp ] || printf 'CRISP_INSTALL_DATA=0x1234\\n'
    [ "$FAILURE" = only_crisp ] || printf 'SPP_PRIVATE_INSTALL_DATA=0x5678\\n'
    [ "$FAILURE" != printing_fails ] || exit 13
    ;;
  *)
    if [ "$PLUGIN_PREFIX" = CRISP ]; then
      printf 'CRISP=%s\\n' "$CRISP_INSTALL_DATA" >> "$CALL_LOG"
    else
      printf 'SPP_PRIVATE=%s\\n' "$SPP_PRIVATE_INSTALL_DATA" >> "$CALL_LOG"
    fi
    if [ "$FAILURE" = crisp_prepare_fails ] && [ "$PLUGIN_PREFIX" = CRISP ]; then
      exit 14
    fi
    ;;
esac
`,
        { mode: 0o755 },
      );

      const result = spawnSync(
        "make",
        ["-f", path.join(contracts, "Makefile"), "safe-prepare-private", "ENV_FILE=.env.fixture"],
        {
          cwd: fixture,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${path.join(fixture, "bin")}:${process.env.PATH}`,
            FAILURE: failure,
            CALL_LOG: path.join(fixture, "calls"),
          },
        },
      );

      assert.ifError(result.error);
      assert.equal(result.status === 0, expectedStatus, result.stdout + result.stderr);
      assert.deepEqual(readFileSync(path.join(fixture, "calls"), "utf8").trim().split("\n"), expectedCalls);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
