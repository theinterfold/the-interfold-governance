import { describe, expect, test } from "bun:test";
import { decodeFunctionResult, type Hex } from "viem";
import { exitQueueAbi } from "../plugins/velocker/artifacts/exitQueue";
import { ticketExitDate } from "../plugins/velocker/utils/exitTicket";

// `queue(15)` on the mainnet exit queue 0x8095C0B90Be4abCBF5CA7371f588fe1637E02b7f: a `TicketV2`
// for a withdrawal that began at 1790804531 (0x6abd8233) with the 30-day cooldown (0x278d00).
const QUEUE_15: Hex = `0x${[
  "0000000000000000000000006ba00ecb3561f7e550927fa049e80373ebc2af95",
  "000000000000000000000000000000000000000000000000000000006abd8233",
  "0000000000000000000000000000000000000000000000000000000000278d00",
  "0000000000000000000000000000000000000000000000000000000000278d00",
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000000",
].join("")}`;

describe("Exit ticket", () => {
  test("can be withdrawn one cooldown after the withdrawal began, not when it began", () => {
    const ticket = decodeFunctionResult({ abi: exitQueueAbi, functionName: "queue", data: QUEUE_15 });
    expect(ticketExitDate(ticket)).toBe(1790804531 + 2592000);
  });
});
