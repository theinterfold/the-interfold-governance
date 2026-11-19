import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { GOVERN_HERO_PREWARM, governPrewarmScript } from "../motion/govern/prewarm.js";

function page({ hidden = false, reduced = false } = {}) {
  const workers: any[] = [],
    timeouts: Function[] = [];
  const context: any = {
    Symbol,
    Error,
    document: { hidden },
    matchMedia: () => ({ matches: reduced }),
    performance: { now: () => 150 },
    setTimeout: (fn: Function) => timeouts.push(fn),
    Worker: class {
      messages: any[] = [];
      terminated = false;
      constructor(
        public url: string,
        public options: any
      ) {
        workers.push(this);
      }
      postMessage(data: any) {
        this.messages.push(data);
      }
      terminate() {
        this.terminated = true;
      }
    },
  };
  return { context, workers, timeouts, run: () => runInNewContext(GOVERN_HERO_PREWARM, context) };
}
test("inline startup prepares one native worker and expires an unclaimed worker", () => {
  const p = page();
  p.run();
  p.run();
  expect(p.workers).toHaveLength(1);
  expect(p.workers[0].url).toBe("/govern-compact/worker.js");
  expect(p.workers[0].options.type).toBe("module");
  expect(p.workers[0].messages).toEqual([{ type: "prepare" }]);
  p.timeouts[0]();
  expect(p.workers[0].terminated).toBe(true);
  p.run();
  expect(p.workers).toHaveLength(2);
});
test("hidden pages and reduced motion do not download or start a solver", () => {
  for (const options of [{ hidden: true }, { reduced: true }]) {
    const p = page(options);
    p.run();
    expect(p.workers).toHaveLength(0);
  }
});

test("inline startup requests the same versioned worker as the renderer", () => {
 const p=page();runInNewContext(governPrewarmScript('?v=cursor-solver'),p.context);
 expect(p.workers[0].url).toBe('/govern-compact/worker.js?v=cursor-solver');
});
