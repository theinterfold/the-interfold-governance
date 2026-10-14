import { describe, expect, test } from "bun:test";
import { resolvePresetForParams } from "../plugins/crispVoting/utils/committeeKey";

// Mainnet E3-3's registered parameters, checked at Ethereum block 26189148.
const secureParams = {
  degree: 8192n,
  plaintextModulus: 17000000n,
  moduli: [576460752317792257n, 576460752317399041n, 576460752316776449n],
};

describe("committee key parameter compatibility", () => {
  test("recognizes the secure parameters used by v0.19 mainnet rounds", async () => {
    expect(await resolvePresetForParams(secureParams)).toBe("SECURE_THRESHOLD_8192");
  });

  test("refuses a round with a different ciphertext modulus", async () => {
    expect(
      await resolvePresetForParams({ ...secureParams, moduli: [secureParams.moduli[0] + 1n, ...secureParams.moduli.slice(1)] })
    ).toBeUndefined();
  });
});
