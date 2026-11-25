// The shared header appears in the server HTML before React can handle input.
// Replay only the request to open a header control once React owns it.
type HeaderIntent = "menu" | "wallet" | null;
declare global {
  interface Window {
    takeGovernHeaderIntent?: () => HeaderIntent;
  }
}

function listenForMenuIntent() {
  let intent: HeaderIntent = null;
  const initialUrl = window.location.href;
  function toggle(event: Event) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".interfold-header-wallet")) intent = "wallet";
    else if (event.target.closest("#governance-mobile-controls .hamburger-react")) intent = intent === "menu" ? null : "menu";
    else return;
    event.stopPropagation();
  }
  document.addEventListener("click", toggle, true);
  window.takeGovernHeaderIntent = () => {
    document.removeEventListener("click", toggle, true);
    delete window.takeGovernHeaderIntent;
    return window.location.href === initialUrl ? intent : null;
  };
}

export const INITIAL_MENU_INTENT = `(${listenForMenuIntent.toString()})();`;
