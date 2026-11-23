import { describe, expect, test } from "bun:test";
import { aztecRoundBlocker } from "../plugins/crispVoting/utils/aztec/round";

const open = { opened: true, keyPublished: true, closed: false, now: 150, inputStart: 100, inputEnd: 200 };

describe("whether a round accepts a ballot on Aztec", () => {
  test.each([
    ["inside the window of an open round with its key", {}, undefined],
    ["a round that has not reached Aztec", { opened: false, keyPublished: false }, "not reached Aztec"],
    ["a round whose key has not arrived", { keyPublished: false }, "committee key"],
    ["a closed round", { closed: true }, "closed on Aztec"],
    ["one second before the window", { now: 99 }, "not opened"],
    ["the first second of the window", { now: 100 }, undefined],
    ["the last second of the window", { now: 199 }, undefined],
    ["the end of the window", { now: 200 }, "window has closed"],
  ])("%s", (_name, change, reason) => {
    const blocker = aztecRoundBlocker({ ...open, ...change });
    if (reason === undefined) expect(blocker).toBeUndefined();
    else expect(blocker).toContain(reason);
  });
});
