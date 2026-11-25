import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FluidHeight } from "./FluidHeight";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Only the outgoing indicator is retained. Its replacement enters normal flow immediately. */
export function FadingLoading({ visible, inline = false, children, exitStartedAt }: {
  visible: boolean;
  inline?: boolean;
  children: ReactNode;
  /** Resume an outgoing placeholder if its data component remounted mid-transition. */
  exitStartedAt?: number;
}) {
  const element = useRef<HTMLElement | null>(null);
  const exitTimingApplied = useRef(false);
  const lastContent = useRef<ReactNode>(children);
  const [retained, setRetained] = useState(visible || exitStartedAt !== undefined);
  const exiting = !visible && retained;

  useClientLayoutEffect(() => {
    if (visible) {
      lastContent.current = children;
      setRetained(true);
    }
  }, [visible, children]);

  useClientLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    node.inert = exiting;
    if (!exiting) {
      exitTimingApplied.current = false;
      node.style.animationDelay = "";
      return;
    }
    if (!exitTimingApplied.current) {
      if (exitStartedAt !== undefined) node.style.animationDelay = `${-Math.max(0, performance.now() - exitStartedAt)}ms`;
      exitTimingApplied.current = true;
    }
    const fade = node.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === "proposal-context-out");
    if (!fade) {
      setRetained(false);
      return;
    }
    let active = true;
    const finish = () => { if (active) setRetained(false); };
    void fade.finished.then(finish, finish);
    return () => { active = false; };
  }, [exiting, exitStartedAt]);

  if (!visible && !retained) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag ref={node => { element.current = node; }} className="loading-layer"
      data-exiting={exiting || undefined} aria-hidden={exiting || undefined}>
      {visible ? children : lastContent.current}
    </Tag>
  );
}

type TextReveal = { startedAt?: number; hadPlaceholder: boolean; skipEntrance?: boolean };
const TextRevealContext = createContext<Map<string, TextReveal> | null>(null);

/** Keep one text entrance across the metadata and contract components of the same item. */
export function LoadingTextScope({ children }: { children: ReactNode }) {
  const starts = useRef(new Map<string, TextReveal>());
  return <TextRevealContext.Provider value={starts.current}>{children}</TextRevealContext.Provider>;
}

/** Preserve the heading node and ease its height when real text replaces a placeholder. */
export function LoadingText({ pending, placeholder, children, name = "title" }: {
  pending: boolean;
  placeholder: ReactNode;
  children: ReactNode;
  name?: string;
}) {
  const starts = useContext(TextRevealContext);
  const startedAt = useRef<number>();
  const content = useRef<HTMLSpanElement>(null);
  const reveal = starts?.get(name);

  useClientLayoutEffect(() => {
    if (pending) {
      starts?.set(name, { hadPlaceholder: true });
      startedAt.current = undefined;
      return;
    }
    const node = content.current;
    if (!node) return;
    const now = performance.now();
    const prior = starts?.get(name);
    const start = prior?.startedAt ?? startedAt.current ?? now;
    const skipEntrance = prior?.skipEntrance ?? (
      document.documentElement.hasAttribute("data-proposal-navigation") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    starts?.set(name, { startedAt: start, hadPlaceholder: prior?.hadPlaceholder ?? false, skipEntrance });
    startedAt.current = start;
    // The page transition already reveals cached text. Keep its local entrance
    // disabled after the navigation marker is removed, too.
    node.style.animationName = skipEntrance ? "none" : "";
    // A cache hit can mount text without a local skeleton. It still enters.
    // A later contract read can remount it; continue the same entrance instead
    // of resetting its opacity or snapping it to the final value.
    node.style.animationDelay = `${-Math.max(0, now - start)}ms`;
  }, [pending, name, starts]);

  return (
    <FluidHeight inline className="loading-text" layoutKey={pending ? "pending" : "ready"}>
      <FadingLoading visible={pending} inline exitStartedAt={reveal?.hadPlaceholder ? reveal.startedAt : undefined}>
        {placeholder}
      </FadingLoading>
      {!pending && <span ref={content} className="loading-text-content">{children}</span>}
    </FluidHeight>
  );
}

// Contract and metadata reads live in different components. They share one loading layer
// so advancing from one pending read to the next doesn't restart the animation.
const LoadingContext = createContext<((content: ReactNode) => void) | null>(null);

export function LoadingBoundary({ children }: { children: ReactNode }) {
  const [indicator, setIndicator] = useState<ReactNode>(null);
  return (
    <LoadingContext.Provider value={setIndicator}>
      <LoadingTextScope>
        <div className="loading-slot">
          <FadingLoading visible={indicator != null}>{indicator}</FadingLoading>
          {children}
        </div>
      </LoadingTextScope>
    </LoadingContext.Provider>
  );
}

export function LoadingIndicator({ children }: { children: ReactNode }) {
  const show = useContext(LoadingContext);
  useClientLayoutEffect(() => {
    if (!show) return;
    show(children);
    return () => show(null);
  }, [show, children]);
  return show ? null : <>{children}</>;
}
