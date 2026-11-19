import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { INITIAL_MENU_INTENT } from "../components/nav/initialMenuIntent";

function beforeHydration() {
  const document = new EventTarget();
  const window: { takeGovernMenuIntent?: () => boolean } = {};
  class KeyEvent extends Event {
    constructor(public key: string) { super("keyup"); }
  }
  let menuIsTarget = true;
  // EventTarget sets event.target to the object on which dispatchEvent was called.
  Object.assign(document, { closest: (selector: string) => menuIsTarget && selector.includes(".hamburger-react") });
  runInNewContext(INITIAL_MENU_INTENT, { window, document, Element: EventTarget, KeyboardEvent: KeyEvent });
  return {
    click(menu: boolean) { menuIsTarget = menu; document.dispatchEvent(new Event("click")); },
    key(key: string) { menuIsTarget = true; document.dispatchEvent(new KeyEvent(key)); },
    consume: () => window.takeGovernMenuIntent?.(),
  };
}

test("the initial menu tap is consumed once after hydration", () => {
  const header = beforeHydration();
  header.click(true);
  expect(header.consume()).toBe(true);
  expect(header.consume()).toBeUndefined();
});

test("repeated taps, wallet clicks, and keyboard activation preserve the intended menu state", () => {
  const header = beforeHydration();
  header.click(true);
  header.click(true);
  header.click(false);
  header.key("Tab");
  expect(header.consume()).toBe(false);
  const keyboard = beforeHydration();
  keyboard.key("Enter");
  expect(keyboard.consume()).toBe(true);
});
