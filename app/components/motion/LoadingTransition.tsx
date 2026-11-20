import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Only the outgoing indicator is retained. Its replacement enters normal flow immediately. */
export function FadingLoading({ visible, inline = false, children }: { visible: boolean; inline?: boolean; children: ReactNode }) {
  const element = useRef<HTMLElement | null>(null);
  const lastContent = useRef<ReactNode>(null);
  const [retained, setRetained] = useState(visible);
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
    if (!exiting) return;
    const fade = node.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === "loading-rise-out");
    if (!fade) {
      setRetained(false);
      return;
    }
    let active = true;
    const finish = () => { if (active) setRetained(false); };
    void fade.finished.then(finish, finish);
    return () => { active = false; };
  }, [exiting]);

  if (!visible && !retained) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag ref={node => { element.current = node; }} className="loading-layer"
      data-exiting={exiting || undefined} aria-hidden={exiting || undefined}>
      {visible ? children : lastContent.current}
    </Tag>
  );
}

// Contract and metadata reads live in different components. They share one loading layer
// so advancing from one pending read to the next doesn't restart the animation.
const LoadingContext = createContext<((content: ReactNode) => void) | null>(null);

export function LoadingBoundary({ children }: { children: ReactNode }) {
  const [indicator, setIndicator] = useState<ReactNode>(null);
  return (
    <LoadingContext.Provider value={setIndicator}>
      <div className="loading-slot">
        <FadingLoading visible={indicator != null}>{indicator}</FadingLoading>
        {children}
      </div>
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
