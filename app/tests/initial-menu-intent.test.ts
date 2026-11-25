import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { INITIAL_MENU_INTENT } from "../components/nav/initialMenuIntent";

function beforeHydration() {
  const document = new EventTarget();
  const window = { location: { href: "/" } } as { location: { href: string }; takeGovernHeaderIntent?: () => "wallet" | "menu" | null };
  class KeyEvent extends Event {
    constructor(public key: string) { super("keyup"); }
  }
  let target: "menu" | "wallet" | "other" = "menu";
  // EventTarget sets event.target to the object on which dispatchEvent was called.
  Object.assign(document, { closest: (selector: string) => target === "menu" && selector.includes(".hamburger-react") ||
    target === "wallet" && selector === ".interfold-header-wallet" });
  runInNewContext(INITIAL_MENU_INTENT, { window, document, Element: EventTarget, KeyboardEvent: KeyEvent });
  return {
    click(control: typeof target) { target = control; document.dispatchEvent(new Event("click")); },
    key(key: string) { target = "menu"; document.dispatchEvent(new KeyEvent(key)); },
    navigate() { window.location.href = "/plugins/proposals/"; },
    consume: () => window.takeGovernHeaderIntent?.(),
  };
}

test("the initial menu tap is consumed once after hydration", () => {
  const header = beforeHydration();
  header.click("menu");
  expect(header.consume()).toBe("menu");
  expect(header.consume()).toBeUndefined();
});

test("repeated taps and keyboard activation preserve the intended menu state", () => {
  const header = beforeHydration();
  header.click("menu");
  header.click("menu");
  header.click("other");
  header.key("Tab");
  expect(header.consume()).toBeNull();
  const keyboard = beforeHydration();
  keyboard.click("menu"); // Native button dispatches click on Enter before keyup.
  keyboard.key("Enter");
  expect(keyboard.consume()).toBe("menu");
});

test("an early wallet request opens once and belongs to the page where it was made", () => {
  const header = beforeHydration();
  header.click("menu");
  header.click("wallet");
  header.click("wallet");
  expect(header.consume()).toBe("wallet");
  expect(header.consume()).toBeUndefined();
  const previous = beforeHydration();
  previous.click("wallet");
  previous.navigate();
  expect(previous.consume()).toBeNull();
});
