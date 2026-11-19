// The shared header appears in the server HTML before React can handle input.
// Keep only the intended menu state. Wallet actions are always handled live.
declare global {
  interface Window {
    takeGovernMenuIntent?: () => boolean;
  }
}

function listenForMenuIntent() {
  let open = false;
  function toggle(event: Event) {
    if (!(event.target instanceof Element) || !event.target.closest("#governance-mobile-controls .hamburger-react")) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter") return;
    event.stopPropagation();
    open = !open;
  }
  document.addEventListener("click", toggle, true);
  document.addEventListener("keyup", toggle, true);
  window.takeGovernMenuIntent = () => {
    document.removeEventListener("click", toggle, true);
    document.removeEventListener("keyup", toggle, true);
    delete window.takeGovernMenuIntent;
    return open;
  };
}

export const INITIAL_MENU_INTENT = `(${listenForMenuIntent.toString()})();`;
