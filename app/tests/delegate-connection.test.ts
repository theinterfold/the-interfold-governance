import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { createDelegateConnection } from "../plugins/velocker/utils/delegateConnection";

const chosen = "0x0000000000000000000000000000000000000012" as const;

function selection() {
  const reviews: (Address | undefined)[] = [];
  let cancellations = 0;
  const request = createDelegateConnection(
    chosen,
    (target) => reviews.push(target),
    () => cancellations++
  );
  return {
    request,
    reviews,
    get cancellations() {
      return cancellations;
    },
  };
}

describe("Selecting a delegate before connecting", () => {
  test("keeps the chosen delegate and waits for the wallet dialog to close before reviewing once", () => {
    const flow = selection();
    // Opening the connector is not the same as connecting a wallet.
    flow.request.update({ connected: false, modalOpen: false });
    flow.request.update({ connected: false, modalOpen: true });
    flow.request.update({ connected: true, modalOpen: true });
    expect(flow.reviews).toEqual([]);
    flow.request.update({ connected: true, modalOpen: false });
    flow.request.update({ connected: true, modalOpen: false });
    expect(flow.reviews).toEqual([chosen]);
    expect(flow.cancellations).toBe(0);
  });

  test("closing without connecting discards the choice, including a later unrelated connection", () => {
    const flow = selection();
    flow.request.update({ connected: false, modalOpen: true });
    flow.request.update({ connected: false, modalOpen: false });
    flow.request.update({ connected: true, modalOpen: false });
    expect(flow.reviews).toEqual([]);
    expect(flow.cancellations).toBe(1);
  });

  test("a rejected connection is cleared even when opening never reached the visible state", () => {
    const flow = selection();
    flow.request.cancel();
    flow.request.cancel();
    flow.request.update({ connected: true, modalOpen: false });
    expect(flow.reviews).toEqual([]);
    expect(flow.cancellations).toBe(1);
    const retry = selection();
    retry.request.update({ connected: true, modalOpen: false });
    expect(retry.reviews).toEqual([chosen]);
  });

  test("navigating away invalidates delayed connection callbacks", () => {
    const flow = selection();
    flow.request.update({ connected: false, modalOpen: true });
    flow.request.dispose();
    flow.request.update({ connected: true, modalOpen: false });
    flow.request.cancel();
    expect(flow.reviews).toEqual([]);
    expect(flow.cancellations).toBe(0);
  });
});
