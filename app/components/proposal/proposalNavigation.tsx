import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

type ViewTransition = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransition;
};
const NavigationContext = createContext<(() => boolean) | undefined>(undefined);
export const useProposalBack = () => useContext(NavigationContext);
const isList = (hash: string) => !hash || hash === "#/";
const isDetail = (hash: string) => /^#\/proposals\/(private|public)\/\d+$/.test(hash);

/** Keep the list's filters, expanded rows and scroll while its shareable detail URL is open. */
export function ProposalNavigation({
  hash,
  list,
  detail,
}: {
  hash: string;
  list: ReactNode;
  detail: (hash: string) => ReactNode;
}) {
  const [shown, setShown] = useState(hash);
  const [listVisited, setListVisited] = useState(isList(hash));
  const current = useRef(hash);
  const root = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const origin = useRef<HTMLAnchorElement | null>(null);
  const fromList = useRef(false);
  const active = useRef<ViewTransition>();
  const generation = useRef(0);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      generation.current += 1;
      active.current?.skipTransition();
      window.history.scrollRestoration = previous;
      delete document.documentElement.dataset.proposalNavigation;
    };
  }, []);

  useEffect(() => {
    if (hash === current.current) return;
    const previous = current.current;
    current.current = hash;
    const returning = isList(hash);
    const moving = (isList(previous) && isDetail(hash)) || (isDetail(previous) && returning);
    const run = ++generation.current;
    active.current?.skipTransition();
    if (isList(previous)) {
      listScroll.current = window.scrollY;
      origin.current =
        Array.from(root.current?.querySelectorAll<HTMLAnchorElement>(".proposal-title-link") ?? []).find(
          (link) => new URL(link.href).hash === hash
        ) ?? null;
      fromList.current = isDetail(hash);
    } else if (!returning) fromList.current = false;

    // Start outside React's effect commit so the update callback can commit the destination atomically.
    queueMicrotask(() => {
      if (run !== generation.current || !root.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const named: HTMLElement[] = [];
      const name = (element: HTMLElement | null | undefined, value: string) => {
        if (!element || !element.getClientRects().length) return;
        element.style.setProperty("view-transition-name", value);
        element.dataset.proposalTransition = String(run);
        named.push(element);
      };
      const nameShared = () => {
        const row = origin.current?.closest(".proposal-row");
        const header = root.current?.querySelector("[data-proposal-route]:not([hidden]) .proposal-reading-header");
        const source = isList(current.current) ? row : header;
        // Before updating the route the visible source can still be the other one.
        const visible = [source, row, header].find((node) => node && node.getClientRects().length);
        name(visible?.querySelector<HTMLElement>("h1, h2"), "proposal-title");
      };
      const clearNames = () =>
        named.forEach((element) => {
          if (element.dataset.proposalTransition !== String(run)) return;
          element.style.removeProperty("view-transition-name");
          delete element.dataset.proposalTransition;
        });
      const update = async () => {
        if (run !== generation.current) return;
        clearNames();
        flushSync(() => {
          setShown(hash);
          if (returning) setListVisited(true);
        });
        // Cached proposals are immediate. On a cold route, allow data to arrive before capturing the destination.
        await new Promise<void>((resolve) => {
          const ready = () =>
            returning ||
            !isDetail(hash) ||
            !!root.current?.querySelector("[data-proposal-route]:not([hidden]) [data-proposal-ready]");
          if (ready()) return resolve();
          const observer = new MutationObserver(() => {
            if (ready()) finish();
          });
          const timeout = window.setTimeout(() => finish(), 1200);
          const finish = () => {
            observer.disconnect();
            clearTimeout(timeout);
            resolve();
          };
          if (root.current) observer.observe(root.current, { childList: true, subtree: true });
        });
        if (run !== generation.current) return;
        window.scrollTo({ top: returning ? listScroll.current : 0, behavior: "instant" });
        if (!reduced && moving) nameShared();
      };
      const finish = () => {
        clearNames();
        if (run !== generation.current) return;
        delete document.documentElement.dataset.proposalNavigation;
        const focus = returning ? origin.current : root.current?.querySelector<HTMLElement>("[data-proposal-ready]");
        focus?.focus({ preventScroll: true });
        if (returning) fromList.current = false;
      };
      const start = (document as TransitionDocument).startViewTransition;
      if (start && moving && !reduced) {
        document.documentElement.dataset.proposalNavigation = returning ? "back" : "forward";
        nameShared();
        const transition = start.call(document, update);
        active.current = transition;
        void transition.ready.catch(() => {});
        void transition.finished.then(finish, finish);
      } else {
        void update().then(() => {
          if (run !== generation.current) return;
          if (moving && !reduced) {
            root.current?.animate(
              [
                { opacity: 0, transform: `translateY(${returning ? -12 : 12}px)` },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: 360,
                easing: "cubic-bezier(.2,.8,.2,1)",
              }
            );
          }
          finish();
        });
      }
    });
  }, [hash]);

  return (
    <NavigationContext.Provider
      value={() => {
        if (!fromList.current) return false;
        window.history.back();
        return true;
      }}
    >
      <div ref={root} className="proposal-route-shell">
        {listVisited && (
          <div data-proposal-route="list" hidden={!isList(shown)}>
            {list}
          </div>
        )}
        {!isList(shown) && <div data-proposal-route="detail">{detail(shown)}</div>}
      </div>
    </NavigationContext.Provider>
  );
}
