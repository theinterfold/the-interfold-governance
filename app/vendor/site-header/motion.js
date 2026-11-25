// packages/site-header/src/motion.tsx
import { useEffect as useEffect2, useRef as useRef2, useState as useState3 } from "react";
import { motion as motion3, useInView, useReducedMotion as useReducedMotion3 } from "framer-motion";

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
  arrowClassName = "absolute left-full ml-1 font-['ABC_Gramercy:Regular',sans-serif] text-[14px] leading-none text-[#3a5e3c] transition-colors group-hover:text-[#82f5ad] group-focus-visible:text-[#82f5ad]",
  arrowGap,
  align = "center",
  animateInView = false
}) {
  const reducedMotion = useReducedMotion();
  const contentOffset = align === "start" || reducedMotion ? 0 : 8;
  return /* @__PURE__ */ jsxs("span", {
    className: "relative inline-flex items-center",
    style: { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: align === "start" ? "flex-start" : "center", maxWidth: "100%" },
    children: [
      /* @__PURE__ */ jsx(motion.span, {
        className: textClassName,
        initial: animateInView ? { opacity: 0 } : undefined,
        whileInView: animateInView ? { opacity: 1 } : undefined,
        viewport: animateInView ? { once: true, amount: 0.8 } : undefined,
        animate: { x: isHovered ? -contentOffset : 0 },
        transition: {
          opacity: { duration: 0.22, delay: 0.14, ease: [0.4, 0, 0.2, 1] },
          x: { duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] }
        },
        children
      }),
      /* @__PURE__ */ jsx(motion.span, {
        className: arrowClassName,
        "aria-hidden": "true",
        style: { position: "absolute", left: "100%", marginLeft: arrowGap === undefined ? 4 : arrowGap - contentOffset, whiteSpace: "nowrap" },
        initial: { opacity: 0, x: reducedMotion ? 0 : -10 },
        animate: { opacity: isHovered ? 1 : 0, x: isHovered || reducedMotion ? 0 : -10 },
        transition: { duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] },
        children: isExternal ? "↗" : "→"
      })
    ]
  });
}
// packages/site-header/src/ctaLink.tsx
import { useState } from "react";
import { jsx as jsx2 } from "react/jsx-runtime";
function SiteCtaLink({
  children,
  href,
  variant = "primary",
  className = "",
  as: Link = "a"
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const external = /^(?:https?:|mailto:|tel:)/.test(href);
  const newTab = /^https?:/.test(href);
  return /* @__PURE__ */ jsx2(Link, {
    className: `site-cta-link ${className}`,
    "data-variant": variant,
    href,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    rel: newTab ? "noopener noreferrer" : undefined,
    target: newTab ? "_blank" : undefined,
    children: /* @__PURE__ */ jsx2(HoverArrowContent, {
      isExternal: external,
      isHovered: hovered || focused,
      textClassName: "site-cta-label",
      arrowClassName: "site-cta-arrow",
      children
    })
  });
}
// packages/site-header/src/arrowLink.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function ArrowSlide({
  className = "relative inline-block h-[14px] w-[14px] overflow-hidden text-[14px] leading-none",
  rowClassName = "h-[14px] w-[14px] leading-none",
  isExternal = false,
  children
}) {
  const arrow = isExternal ? "↗" : "→";
  return /* @__PURE__ */ jsx3("span", {
    "aria-hidden": "true",
    className: `interfold-arrow-slide ${className}`,
    children: /* @__PURE__ */ jsxs2("span", {
      className: "interfold-arrow-slide__track",
      children: [
        /* @__PURE__ */ jsx3("span", {
          className: rowClassName,
          children: children ?? arrow
        }),
        /* @__PURE__ */ jsx3("span", {
          className: rowClassName,
          children: children ?? arrow
        })
      ]
    })
  });
}
function ExternalArrowSlide(props) {
  return /* @__PURE__ */ jsx3(ArrowSlide, {
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
      /* @__PURE__ */ jsx3("span", {
        className: textClassName,
        children
      }),
      /* @__PURE__ */ jsx3(ArrowSlide, {
        className: arrowClassName,
        isExternal,
        rowClassName: arrowRowClassName
      })
    ]
  });
}
// packages/site-header/src/dropdownPanel.tsx
import { useEffect, useRef, useState as useState2 } from "react";
import { motion as motion2, useReducedMotion as useReducedMotion2 } from "framer-motion";
import { jsx as jsx4 } from "react/jsx-runtime";
var closed = { opacity: 0, y: -8, scale: 0.95 };
var opened = { opacity: 1, y: 0, scale: 1 };
var spring = { type: "spring", visualDuration: 0.15, bounce: 0 };
function SiteDropdownPanel({ open, panelRef, children, className = "", ...props }) {
  const reducedMotion = useReducedMotion2();
  const [settledClosed, setSettledClosed] = useState2(!open);
  const currentOpen = useRef(open);
  currentOpen.current = open;
  useEffect(() => {
    if (open)
      setSettledClosed(false);
  }, [open]);
  return /* @__PURE__ */ jsx4(motion2.div, {
    ...props,
    ref: panelRef,
    className: `site-header-dropdown-panel ${className}`,
    "data-open": open,
    "aria-hidden": !open,
    initial: false,
    animate: open ? opened : reducedMotion ? { ...opened, opacity: 0 } : closed,
    transition: reducedMotion ? { duration: 0 } : spring,
    style: { visibility: open || !settledClosed ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" },
    onAnimationComplete: () => {
      if (!currentOpen.current)
        setSettledClosed(true);
    },
    children
  });
}

// packages/site-header/src/motion.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
var elements = {
  div: motion3.div,
  section: motion3.section,
  header: motion3.header,
  h1: motion3.h1,
  p: motion3.p
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
  const ref = useRef2(null);
  const isInView = useInView(ref, { once: true, amount });
  const shouldReduceMotion = useReducedMotion3();
  const [revealed, setRevealed] = useState3(false);
  const [focused, setFocused] = useState3(false);
  const Element = elements[as];
  useEffect2(() => {
    if (shouldReduceMotion)
      setRevealed(true);
  }, [shouldReduceMotion]);
  useEffect2(() => {
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
  return /* @__PURE__ */ jsx5(Element, {
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
  SiteCtaLink,
  SiteDropdownPanel,
  UnderlinedArrowLink,
  requestReveal
};
