import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { proposalTransitionStyles, type ProposalPartPosition } from "./proposalTransition";

type ViewTransition = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransition;
};
const NavigationContext = createContext<(() => boolean) | undefined>(undefined);
export const useProposalBack = () => useContext(NavigationContext);
const isList = (hash: string) => !hash || hash === "#/";
const isDetail = (hash: string) => /^#\/proposals\/(private|public)\/\d+$/.test(hash);
const isCreate = (hash: string) => hash === "#/new";
const isPage = (hash: string) => isDetail(hash) || isCreate(hash);

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
    const moving = (isList(previous) && isPage(hash)) || (isPage(previous) && returning);
    const creating = isCreate(previous) || isCreate(hash);
    const run = ++generation.current;
    active.current?.skipTransition();
    const findOrigin = (routeHash: string) =>
      Array.from(root.current?.querySelectorAll<HTMLAnchorElement>(".proposal-title-link, a[href$='#/new']") ?? []).find(
        (link) => new URL(link.href).hash === routeHash
      ) ?? null;
    if (isList(previous)) {
      listScroll.current = window.scrollY;
      origin.current = findOrigin(hash);
      fromList.current = isPage(hash);
    } else if (!returning) fromList.current = false;

    // Start outside React's effect commit so the update callback can commit the destination atomically.
    queueMicrotask(() => {
      if (run !== generation.current || !root.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const named: HTMLElement[] = [];
      let positions = new Map<string, ProposalPartPosition>();
      let motionStyle: HTMLStyleElement | undefined;
      const nameShared = () => {
        const route = root.current?.querySelector<HTMLElement>("[data-proposal-route]:not([hidden])");
        const scope = route?.dataset.proposalRoute === "list"
          ? creating ? origin.current : origin.current?.closest(".proposal-row")
          : route;
        // Scope to the originating action/row, never a hidden route or an expanded ballot.
        const measured = new Map<string, ProposalPartPosition>();
        if (!scope || !scope.getClientRects().length) return measured;
        const elements = creating && route?.dataset.proposalRoute === "list"
          ? [
              { element: scope as HTMLElement, part: "surface" },
              ...Array.from(route.querySelectorAll<HTMLElement>(".governance-page-intro, .ui-panel-heading-copy"))
                .map((element) => ({ element, part: element.matches(".governance-page-intro") ? "create-list-intro" : "create-list-heading" })),
              ...Array.from(scope.querySelectorAll<HTMLElement>(".ui-action-content"))
                .map((element) => ({ element, part: "create-action" })),
            ]
          : Array.from(scope.querySelectorAll<HTMLElement>("[data-proposal-part]"))
              .map((element) => ({ element, part: element.dataset.proposalPart! }));
        if (scope.matches("[data-proposal-part]"))
          elements.unshift({ element: scope as HTMLElement, part: (scope as HTMLElement).dataset.proposalPart! });
        // Read all geometry before assigning names, avoiding a style/layout flush per fact.
        const visible = elements.filter(({ element, part }) => {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          const style = getComputedStyle(element);
          measured.set(part, {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            fontSize: parseFloat(style.fontSize),
            radius: parseFloat(style.borderTopLeftRadius) || 0,
          });
          return true;
        });
        visible.forEach(({ element, part }) => {
          element.style.setProperty("view-transition-name", `proposal-${part}`);
          element.dataset.proposalTransition = String(run);
          named.push(element);
        });
        return measured;
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
            returning
              ? !!root.current?.querySelector(creating ? '[data-proposal-route="list"]' : '[data-proposal-route="list"] .proposal-title-link')
              : !isPage(hash) ||
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
          if (root.current)
            observer.observe(root.current, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ["data-proposal-ready"],
            });
        });
        if (run !== generation.current) return;
        // A direct URL (or development refresh) has no stored link yet. Match its row after the list loads.
        if (returning) origin.current = findOrigin(previous);
        window.scrollTo({ top: returning ? listScroll.current : 0, behavior: "instant" });
        if (!reduced && moving) {
          const destination = nameShared();
          motionStyle = document.createElement("style");
          motionStyle.textContent = proposalTransitionStyles(positions, destination);
          document.head.append(motionStyle);
        }
      };
      const finish = () => {
        clearNames();
        motionStyle?.remove();
        if (run !== generation.current) return;
        delete document.documentElement.dataset.proposalNavigation;
        const focus = returning ? origin.current : root.current?.querySelector<HTMLElement>("[data-proposal-ready]");
        focus?.focus({ preventScroll: true });
        if (returning) fromList.current = false;
      };
      const start = (document as TransitionDocument).startViewTransition;
      if (start && moving && !reduced) {
        document.documentElement.dataset.proposalNavigation = returning ? "back" : "forward";
        positions = nameShared();
        const transition = start.call(document, update);
        active.current = transition;
        void transition.ready.catch(() => {});
        void transition.finished.then(finish, finish);
      } else {
        void update().then(() => {
          if (run !== generation.current) return;
          // Unsupported browsers keep the full destination visible immediately as well.
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
