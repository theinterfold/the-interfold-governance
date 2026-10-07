// packages/site-header/src/motion.tsx
import { useEffect, useRef, useState } from "react";
import { motion as motion2, useInView, useReducedMotion as useReducedMotion2 } from "framer-motion";

// packages/site-header/src/revealSequencer.ts
var STEP_MS = 140;
var PAST_MARGIN_PX = 320;
var queue = [];
var incoming = [];
var frame = null;
var nextReleaseAt = 0;
function tick() {
  frame = null;
  if (incoming.length) {
    queue = queue.concat(incoming).sort((a, b) => a.y - b.y || a.delayMs - b.delayMs);
    incoming = [];
  }
  const now = performance.now();
  const viewportTop = window.scrollY;
  while (queue.length > 0 && now >= nextReleaseAt) {
    const request = queue.shift();
    if (!request.node.isConnected) {
      continue;
    }
    request.start(0);
    if (request.y < viewportTop - PAST_MARGIN_PX) {
      continue;
    }
    nextReleaseAt = now + request.spanMs + STEP_MS;
  }
  if (queue.length > 0 || incoming.length > 0) {
    frame = requestAnimationFrame(tick);
  } else {
    nextReleaseAt = 0;
  }
}
function requestReveal(request) {
  incoming.push(request);
  if (frame === null) {
    frame = requestAnimationFrame(tick);
  }
  return () => {
    incoming = incoming.filter((entry) => entry !== request);
    queue = queue.filter((entry) => entry !== request);
    if (!incoming.length && !queue.length) {
      if (frame !== null)
        cancelAnimationFrame(frame);
      frame = null;
      nextReleaseAt = 0;
    }
  };
}
// packages/site-header/src/hoverArrow.tsx
import { motion, useReducedMotion } from "framer-motion";
import { jsx, jsxs } from "react/jsx-runtime";
function HoverArrowContent({
  children,
  isExternal = false,
  isHovered,
  textClassName,
  arrowClassName = "absolute left-full ml-1 font-['ABC_Gramercy:Regular',sans-serif] text-[14px] leading-none text-[#3a5e3c] transition-colors group-hover:text-[#82f5ad]",
  animateInView = false
}) {
  const reducedMotion = useReducedMotion();
  return /* @__PURE__ */ jsxs("span", {
    className: "relative inline-flex items-center justify-center",
    style: { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", maxWidth: "100%" },
    children: [
      /* @__PURE__ */ jsx(motion.span, {
        className: textClassName,
        initial: animateInView ? { opacity: 0 } : undefined,
        whileInView: animateInView ? { opacity: 1 } : undefined,
        viewport: animateInView ? { once: true, amount: 0.8 } : undefined,
        animate: { x: isHovered && !reducedMotion ? -8 : 0 },
        transition: {
          opacity: { duration: 0.22, delay: 0.14, ease: [0.4, 0, 0.2, 1] },
          x: { duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] }
        },
        children
      }),
      /* @__PURE__ */ jsx(motion.span, {
        className: arrowClassName,
        "aria-hidden": "true",
        style: { position: "absolute", left: "100%", marginLeft: 4, whiteSpace: "nowrap" },
        initial: { opacity: 0, x: -10 },
        animate: { opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 },
        transition: { duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] },
        children: isExternal ? "↗" : "→"
      })
    ]
  });
}
// packages/site-header/src/arrowLink.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ArrowSlide({
  className = "relative inline-block h-[14px] w-[14px] overflow-hidden text-[14px] leading-none",
  rowClassName = "h-[14px] w-[14px] leading-none",
  isExternal = false
}) {
  const arrow = isExternal ? "↗" : "→";
  return /* @__PURE__ */ jsx2("span", {
    "aria-hidden": "true",
    className: `interfold-arrow-slide ${className}`,
    children: /* @__PURE__ */ jsxs2("span", {
      className: "interfold-arrow-slide__track",
      children: [
        /* @__PURE__ */ jsx2("span", {
          className: rowClassName,
          children: arrow
        }),
        /* @__PURE__ */ jsx2("span", {
          className: rowClassName,
          children: arrow
        })
      ]
    })
  });
}
function ExternalArrowSlide(props) {
  return /* @__PURE__ */ jsx2(ArrowSlide, {
    ...props,
    isExternal: true
  });
}
function UnderlinedArrowLink({
  children,
  className = "inline-flex",
  href,
  textClassName,
  arrowClassName = "relative inline-block h-[13px] w-[13px] overflow-hidden font-['ABC_Gramercy:Regular',sans-serif] text-[13px] leading-none",
  arrowRowClassName = "h-[13px] w-[13px] leading-none",
  underlineClassName = "border-b border-current pb-[3px]"
}) {
  const isExternal = /^(?:https?:|mailto:|tel:)/.test(href);
  const openInNewTab = /^https?:/.test(href);
  return /* @__PURE__ */ jsxs2("a", {
    className: `group interfold-underlined-arrow-link items-center gap-1 ${underlineClassName} ${className}`,
    href,
    rel: openInNewTab ? "noopener noreferrer" : undefined,
    target: openInNewTab ? "_blank" : undefined,
    children: [
      /* @__PURE__ */ jsx2("span", {
        className: textClassName,
        children
      }),
      /* @__PURE__ */ jsx2(ArrowSlide, {
        className: arrowClassName,
        isExternal,
        rowClassName: arrowRowClassName
      })
    ]
  });
}

// packages/site-header/src/motion.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
var elements = {
  div: motion2.div,
  section: motion2.section,
  header: motion2.header,
  h1: motion2.h1,
  p: motion2.p
};
var hidden = { opacity: 0, y: 16 };
var visible = { opacity: 1, y: 0 };
function ScrollFadeIn({
  children,
  delay = 0,
  as = "div",
  amount = 0.3,
  ...props
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount });
  const shouldReduceMotion = useReducedMotion2();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const Element = elements[as];
  useEffect(() => {
    if (shouldReduceMotion)
      setRevealed(true);
  }, [shouldReduceMotion]);
  useEffect(() => {
    if (!isInView || shouldReduceMotion || revealed || focused)
      return;
    const node = ref.current;
    if (!node)
      return;
    return requestReveal({
      node,
      y: node.getBoundingClientRect().top + window.scrollY,
      delayMs: delay * 1000,
      spanMs: 0,
      start: () => setRevealed(true)
    });
  }, [delay, isInView, revealed, focused, shouldReduceMotion]);
  return /* @__PURE__ */ jsx3(Element, {
    ...props,
    ref,
    initial: shouldReduceMotion ? visible : hidden,
    animate: shouldReduceMotion || revealed || focused ? visible : hidden,
    transition: { duration: shouldReduceMotion || focused ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] },
    onFocusCapture: () => setFocused(true),
    children
  });
}
export {
  ArrowSlide,
  ExternalArrowSlide,
  HoverArrowContent,
  ScrollFadeIn,
  UnderlinedArrowLink,
  requestReveal
};
