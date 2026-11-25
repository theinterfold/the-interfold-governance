import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { GOVERN_HYDRATION_GATE } from "../motion/govern/hydration-gate.js";

function page({ hidden = false, loading = false } = {}) {
  const listeners = new Map<string, Function>(),
    timers: Function[] = [],
    inserted: any[] = [];
  const placeholders = ["runtime.js", "framework.js", "app.js", "home.js"].map((src) => ({
    dataset: { governSrc: src },
    nonce: "test-nonce",
    attributes: [
      { name: "type", value: "application/x-interfold-deferred" },
      { name: "defer", value: "" },
      { name: "crossorigin", value: "anonymous" },
    ],
    replaceWith(script: any) {
      inserted.push(script);
    },
  }));
  const document = {
    hidden,
    readyState: loading ? "loading" : "complete",
    addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
    querySelectorAll: () => placeholders,
    createElement: () =>
      ({
        setAttribute(name: string, value: string) {
          this[name] = value;
        },
      }) as any,
  };
  const context = {
    Symbol,
    document,
    performance: { now: () => 150 },
    setTimeout: (fn: Function) => timers.push(fn),
    clearTimeout() {},
  };
  return {
    document,
    inserted,
    run: () => runInNewContext(GOVERN_HYDRATION_GATE, context),
    emit: (event: string) => listeners.get(event)?.(),
    expire: () => timers[0](),
  };
}
test("the artwork releases hydration once and preserves ordered scripts and security attributes", () => {
  const p = page();
  p.run();
  expect(p.inserted).toHaveLength(0);
  p.emit("govern:motion-ready");
  p.expire();
  p.run();
  expect(p.inserted.map((s) => s.src)).toEqual(["runtime.js", "framework.js", "app.js", "home.js"]);
  expect(
    p.inserted.every(
      (s) => s.async === false && s.nonce === "test-nonce" && s.crossorigin === "anonymous" && !s.type && !s.defer
    )
  ).toBe(true);
});
test("timeout, failure, interaction and a hidden document cannot indefinitely hold hydration", () => {
  for (const event of ["govern:motion-error", "pointerdown", "keydown", "timeout"]) {
    const p = page();
    p.run();
    if (event === "timeout") p.expire();
    else p.emit(event);
    expect(p.inserted).toHaveLength(4);
  }
  const p = page({ hidden: true });
  p.run();
  expect(p.inserted).toHaveLength(4);
});
test("an early interaction waits for parsing so it also restores later script placeholders", () => {
  const p = page({ loading: true });
  p.run();
  p.emit("pointerdown");
  expect(p.inserted).toHaveLength(0);
  p.document.readyState = "complete";
  p.emit("DOMContentLoaded");
  expect(p.inserted).toHaveLength(4);
});
