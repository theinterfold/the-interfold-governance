// packages/site-header/src/layoutStudy.ts
import { useState } from "react";

// packages/site-header/src/entrance.ts
import { useEffect, useLayoutEffect } from "react";
var useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

// packages/site-header/src/layoutStudy.ts
var isLayout = (value) => typeof value === "string" && ["current", "lockup", "compact", "divided"].includes(value);
var governanceColors = { sage: "#687d71", green50: "rgb(58 94 60 / 50%)", green65: "rgb(58 94 60 / 65%)", green80: "rgb(58 94 60 / 80%)", secondary: "#737d7e", dark: "#252525", green: "#3a5e3c", coral: "#a84932", muted: "#596364", grey: "#7a7d77", signal: "#82f5ad" };
var isColor = (value) => typeof value === "string" && Object.prototype.hasOwnProperty.call(governanceColors, value);
var isTypeSize = (value) => typeof value === "string" && ["auto", "16", "18", "20", "22", "24"].includes(value);
function useHeaderLayout(explicit) {
  const [studyLayout, setStudyLayout] = useState("lockup");
  useBeforePaint(() => {
    const query = new URLSearchParams(window.location.search);
    const embeddedStudy = window.parent !== window && ["interfold-navbar-study", "governance-navbar-study"].includes(window.name);
    if (query.get("navbarStudy") !== "1" && !embeddedStudy)
      return;
    const read = (key) => {
      try {
        return embeddedStudy ? sessionStorage.getItem(key) : null;
      } catch {
        return null;
      }
    };
    const save = (key, value) => {
      try {
        if (embeddedStudy)
          sessionStorage.setItem(key, value);
      } catch {}
    };
    const initial = query.get("navbarLayout") ?? read("navbar-study-layout");
    if (isLayout(initial))
      setStudyLayout(initial);
    const applyColor = (color) => {
      document.documentElement.style.setProperty("--site-governance-ink", governanceColors[color]);
      save("navbar-study-color", color);
    };
    const initialColor = query.get("navbarColor") ?? read("navbar-study-color");
    if (isColor(initialColor))
      applyColor(initialColor);
    const applyTypeSize = (size) => {
      const root = document.documentElement;
      if (size === "auto") {
        root.style.removeProperty("--site-study-type-size");
        root.removeAttribute("data-navbar-type-size");
      } else {
        root.style.setProperty("--site-study-type-size", `${size}px`);
        root.setAttribute("data-navbar-type-size", size);
      }
      save("navbar-study-type-size", size);
    };
    const initialTypeSize = query.get("navbarTypeSize") ?? read("navbar-study-type-size");
    if (isTypeSize(initialTypeSize))
      applyTypeSize(initialTypeSize);
    let parentOrigin;
    try {
      parentOrigin = read("navbar-study-parent") ?? new URL(document.referrer).origin;
    } catch {
      return;
    }
    if (!["localhost", "127.0.0.1"].includes(new URL(parentOrigin).hostname))
      return;
    save("navbar-study-parent", parentOrigin);
    const receive = (event) => {
      if (event.source !== window.parent || event.origin !== parentOrigin)
        return;
      if (event.data?.type === "interfold:navbar-replay") {
        window.dispatchEvent(new Event("interfold:navbar-replay"));
        return;
      }
      if (event.data?.type !== "interfold:navbar-layout" || !isLayout(event.data.layout))
        return;
      setStudyLayout(event.data.layout);
      save("navbar-study-layout", event.data.layout);
      const url = new URL(window.location.href);
      url.searchParams.set("navbarLayout", event.data.layout);
      if (isColor(event.data.governanceColor)) {
        applyColor(event.data.governanceColor);
        url.searchParams.set("navbarColor", event.data.governanceColor);
      }
      if (isTypeSize(event.data.typeSize)) {
        applyTypeSize(event.data.typeSize);
        url.searchParams.set("navbarTypeSize", event.data.typeSize);
      }
      window.history.replaceState(window.history.state, "", url);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "interfold:navbar-ready" }, parentOrigin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return explicit ?? studyLayout;
}

// packages/site-header/src/index.tsx
import { useRef as useRef3, useState as useState3 } from "react";

// packages/site-header/src/entranceRuntime.ts
function installHeaderEntranceRuntime() {
  const key = Symbol.for("interfold.header.entrance.runtime");
  const shared = window;
  if (shared[key])
    return shared[key];
  const runs = new WeakMap;
  const seen = new Set;
  function firstVisit(variant) {
    if (seen.has(variant))
      return false;
    seen.add(variant);
    try {
      const storageKey = `interfold:navbar-seen:${variant}`;
      const previous = sessionStorage.getItem(storageKey) === "1";
      sessionStorage.setItem(storageKey, "1");
      return !previous;
    } catch {
      return false;
    }
  }
  function prepare(header, replay = false) {
    const previous = runs.get(header);
    if (previous && !replay)
      return previous;
    previous?.dispose();
    const variant = header.dataset.variant || "responsive";
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const requested = replay || firstVisit(variant);
    const revision = requested && !preference.matches ? (previous?.revision || 0) + 1 : 0;
    const triggers = Array.from(document.querySelectorAll("[data-header-menu-trigger]")).filter((node) => node.dataset.headerMenuTrigger === variant);
    const timers = [];
    const cleanups = [];
    let disposed = false;
    const later = (callback, delay) => {
      const timer = setTimeout(() => {
        if (!disposed)
          callback();
      }, delay);
      timers.push(timer);
      return timer;
    };
    for (const node of [header, ...triggers]) {
      node.dataset.ready = "true";
      node.dataset.entrance = revision ? "playing" : "static";
    }
    if (replay && revision) {
      for (const node of [header, ...triggers]) {
        node.getAnimations({ subtree: true }).forEach((animation) => {
          if ("animationName" in animation && String(animation.animationName).startsWith("site-header-")) {
            animation.currentTime = 0;
            animation.play();
          }
        });
      }
    }
    for (const symbol of header.querySelectorAll("[data-symbol-animated]")) {
      const image = symbol.querySelector(".interfold-symbol-motion");
      if (!image)
        continue;
      let settled = false;
      let timeout;
      const restore = () => {
        settled = true;
        clearTimeout(timeout);
        symbol.classList.remove("interfold-symbol-pending", "interfold-symbol-playing");
        image.removeAttribute("href");
      };
      const loaded = () => {
        if (disposed || settled)
          return;
        clearTimeout(timeout);
        symbol.classList.add("interfold-symbol-playing");
        later(restore, 4010 / 3);
      };
      image.addEventListener("load", loaded);
      image.addEventListener("error", restore);
      cleanups.push(() => {
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", restore);
        restore();
      });
      if (revision) {
        symbol.classList.add("interfold-symbol-pending");
        later(() => {
          if (settled)
            return;
          image.setAttribute("href", `/brand/interfold-symbol-fold.svg${replay ? `?play=${Date.now()}` : ""}`);
          timeout = later(restore, 5000);
        }, 1100);
      }
    }
    const dispose = () => {
      disposed = true;
      timers.forEach(clearTimeout);
      cleanups.forEach((cleanup) => cleanup());
      preference.removeEventListener("change", preferenceChanged);
    };
    const preferenceChanged = () => {
      if (!preference.matches)
        return;
      dispose();
      for (const node of [header, ...triggers])
        node.dataset.entrance = "static";
    };
    preference.addEventListener("change", preferenceChanged);
    const run = { revision, dispose };
    runs.set(header, run);
    return run;
  }
  const runtime = {
    prepare,
    prepareAll() {
      if (new URLSearchParams(location.search).get("navbarStudy") === "1" || ["interfold-navbar-study", "governance-navbar-study"].includes(window.name))
        return;
      document.querySelectorAll(".site-header-chrome").forEach((header) => prepare(header));
    },
    release(header) {
      queueMicrotask(() => {
        if (!header.isConnected)
          runs.get(header)?.dispose();
      });
    }
  };
  shared[key] = runtime;
  return runtime;
}
var HEADER_ENTRANCE_BOOTSTRAP = `(${installHeaderEntranceRuntime.toString()})().prepareAll();`;

// packages/site-header/src/brandLockup.ts
var LOCKUP = {
  width: 1000,
  height: 122,
  symbolWidth: 139.644,
  symbolTop: 2.67285,
  symbolHeight: 119.32715,
  wordmarkX: 188.021,
  wordmarkWidth: 811.979,
  wordmarkHeight: 115.99,
  baseline: 113.916
};
var LOCKUP_SYMBOL_PATH = "M133.928 8.39135L106.759 35.4935L79.5901 8.39135L77.2191 6.02619L74.8482 8.39135L62.4574 20.7517L47.6794 6.02619L45.3084 8.39135L30.5304 23.1331L15.7524 37.8748L0.990613 52.6004L0 53.5885V122L5.73257 116.281L32.9014 89.1793L60.0702 116.281L62.4411 118.647L64.8121 116.281L77.2029 103.921L89.5937 116.281L91.9647 118.647L94.3356 116.281L109.114 101.54L123.892 86.7979L138.215 72.5098L139.644 71.0842V2.67285L133.911 8.39135H133.928ZM111.517 40.24L132.953 18.8564V61.6236L111.517 40.24ZM104.388 42.6051L106.759 44.9703L131.557 69.7072L131.102 70.1608L121.521 79.7187L109.13 67.3583L67.1831 25.5144L77.2029 15.5192L104.372 42.6213L104.388 42.6051ZM77.2191 94.4442L37.6433 54.9655L47.6631 44.9703L87.2389 84.449L77.2191 94.4442ZM32.9014 79.7025L8.10354 54.9655L18.1234 44.9703L30.5141 57.3307L72.4609 99.1745L62.4411 109.17L32.9014 79.7025ZM91.9971 79.7025L52.4213 40.2238L62.4411 30.2286L102.017 69.7072L91.9971 79.7025ZM106.759 74.4538L116.779 84.449L106.759 94.4442L96.7391 84.449L106.759 74.4538ZM47.6794 15.503L57.6992 25.4982L47.6794 35.4935L37.6595 25.4982L47.6794 15.503ZM32.9014 30.2448L42.9212 40.24L32.9014 50.2352L22.8815 40.24L32.9014 30.2448ZM6.70694 105.833V63.0654L9.97109 66.3215L28.1432 84.449L6.70694 105.833ZM81.9611 99.1907L91.9809 89.1955L102.001 99.1907L91.9809 109.186L81.9611 99.1907Z";
var LOCKUP_WORDMARK_PATHS = [
  "M952.142 115.698C935.74 115.698 922.895 102.285 922.895 82.1C922.895 59.8416 939.443 44.0793 959.823 44.0793C966.027 44.0793 971.792 45.5535 975.933 47.7566V19.4558C975.933 14.1422 973.27 12.3765 963.526 14.1422V8.24555L988.632 1.61987V98.1539C988.632 102.722 991.296 105.087 1000.02 103.467V108.619L976.371 115.99V101.702C971.207 109.947 962.34 115.698 952.142 115.698ZM935.594 78.7143C935.594 94.0392 945.045 105.395 957.761 105.395C965.881 105.395 972.539 100.827 975.933 94.347V65.4629C975.933 55.7431 968.69 50.7212 959.823 50.7212C945.5 50.7212 935.594 62.8062 935.594 78.7305V78.7143Z",
  "M883.107 113.932V107.307H894.182V19.4558C894.182 14.1422 891.519 12.3765 881.775 14.1422V8.24555L906.898 1.61987V107.291H917.973V113.916H883.107V113.932Z",
  "M843.824 115.698C824.921 115.698 809.396 101.848 809.396 79.735C809.396 57.6224 824.905 44.0632 843.824 44.0632C862.743 44.0632 878.252 57.6224 878.252 79.735C878.252 101.848 862.743 115.698 843.824 115.698ZM843.824 108.911C856.085 108.911 864.66 97.5709 864.66 79.735C864.66 61.8991 856.085 50.8509 843.824 50.8509C831.563 50.8509 822.989 61.8991 822.989 79.735C822.989 97.5709 831.563 108.911 843.824 108.911Z",
  "M760.093 113.916V107.291H772.793V53.945H759.639V45.8452H772.793V37.2917C772.793 14.5959 790.38 0 810.615 0C812.677 0 814.61 0.145797 816.38 0.437392V13.9965C811.216 11.3398 806.035 10.1572 801.456 10.1572C791.111 10.1572 785.508 16.4913 785.508 28.4305V45.829H806.49L804.265 53.9288H785.508V107.274H798.809V113.9H760.11L760.093 113.916Z",
  "M704.635 113.933V107.307H715.272V61.0244C715.272 56.456 712.609 54.0909 704.051 55.7109V50.5593L727.533 43.1885V63.3733C730.489 53.7993 740.233 43.4801 754.718 43.7717V58.2218C753.24 57.7844 751.178 57.4928 748.807 57.4928C739.648 57.4928 731.82 61.9153 727.972 70.161V107.307H742.896V113.933H704.635Z",
  "M667.202 115.698C650.069 115.698 636.33 102.884 636.33 81.8085C636.33 59.5501 650.507 44.0793 669.572 44.0793C684.935 44.0793 696.758 53.9612 696.904 73.5466L648.006 73.255C647.86 74.4376 647.86 75.3124 647.86 76.495C647.86 91.0909 656.272 104.051 670.904 104.051C679.024 104.051 687.16 99.4824 690.408 92.1115H696.757C692.178 108.036 680.648 115.698 667.202 115.698ZM648.883 67.5041L682.564 67.0667C682.126 57.0391 676.945 50.9966 667.932 50.9966C658.919 50.9966 651.53 57.1849 648.867 67.5041H648.883Z",
  "M612.184 115.698C603.024 115.698 596.529 110.693 596.529 100.519V53.945H582.043V45.8451H596.529V28.1551L609.082 22.8416V45.8289H630.502L628.147 53.9288H609.082V97.8462C609.082 102.998 611.745 105.509 616.032 105.509C620.027 105.509 624.298 102.706 625.939 97.992H631.996C628.894 110.514 621.213 115.682 612.2 115.682L612.184 115.698Z",
  "M548.085 113.933V107.307H558.868V67.6662C558.868 58.6754 553.395 53.5239 545.276 53.5239C538.179 53.5239 530.644 57.2012 526.665 64.5721V107.307H537.448V113.933H503.329V107.307H513.966V61.0244C513.966 56.8934 511.302 54.5445 502.744 56.1644V50.5593L526.681 43.1885V56.8934C531.553 49.5226 541.005 44.0795 550.472 44.0795C562.879 44.0795 571.6 52.0335 571.6 65.5927V107.307H582.091V113.933H548.117H548.085Z",
  "M453.928 113.932V106.562H467.52V18.1436H453.928V10.7727H494.705V18.1436H481.113V106.562H494.705V113.932H453.928Z",
  "M388.19 115.698C371.057 115.698 357.318 102.884 357.318 81.8085C357.318 59.5501 371.496 44.0793 390.561 44.0793C405.923 44.0793 417.746 53.9612 417.892 73.5466L368.995 73.255C368.848 74.4376 368.848 75.3124 368.848 76.495C368.848 91.0909 377.277 104.051 391.892 104.051C400.012 104.051 408.148 99.4824 411.396 92.1115H417.746C413.166 108.036 401.636 115.698 388.206 115.698H388.19ZM369.872 67.5041L403.552 67.0667C403.114 57.0391 397.934 50.9966 388.921 50.9966C379.908 50.9966 372.519 57.1849 369.855 67.5041H369.872Z",
  "M209.295 113.916V106.545H227.175V18.1275H217.269C199.681 18.1275 194.517 25.2067 194.517 40.8233H188.021V10.7566H274.448L297.346 4.71411V56.8772C302.218 49.5063 311.67 44.0632 321.137 44.0632C333.544 44.0632 342.265 52.0173 342.265 65.5764V107.291H352.756V113.916H318.782V107.291H329.566V67.65C329.566 58.6591 324.093 53.5076 315.973 53.5076C308.876 53.5076 301.341 57.185 297.362 64.5558V107.291H308.146V113.916H273.864V107.291H284.647V18.1275H240.768V106.545H258.794V113.916H209.295Z"
];

// packages/site-header/src/wordmark.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var WORDMARK_SCALE = 120.421 / LOCKUP.wordmarkWidth;
var GOVERNANCE_ROW = LOCKUP.wordmarkHeight + 24;
var GOVERNANCE_WIDTH = (237 - 124.7) / WORDMARK_SCALE;
function HeaderWordmark({ governance = false }) {
  return /* @__PURE__ */ jsxs("svg", {
    className: "site-header-wordmark",
    "data-governance": governance || undefined,
    viewBox: `${LOCKUP.wordmarkX} 0 ${governance ? 237 / WORDMARK_SCALE : LOCKUP.wordmarkWidth} ${LOCKUP.wordmarkHeight}`,
    preserveAspectRatio: governance ? "xMaxYMin slice" : "xMinYMin meet",
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
    children: [
      LOCKUP_WORDMARK_PATHS.map((d, index) => /* @__PURE__ */ jsx("path", {
        d
      }, index)),
      governance && /* @__PURE__ */ jsx("svg", {
        x: LOCKUP.wordmarkX + 124.7 / WORDMARK_SCALE - 6,
        y: -12,
        width: GOVERNANCE_WIDTH + 12,
        height: GOVERNANCE_ROW,
        viewBox: `-6 -12 ${GOVERNANCE_WIDTH + 12} ${GOVERNANCE_ROW}`,
        overflow: "hidden",
        className: "site-header-governance-window",
        children: /* @__PURE__ */ jsx("g", {
          className: "interfold-arrow-slide__track site-header-governance-track",
          style: { "--interfold-roll-offset": `-${GOVERNANCE_ROW}px` },
          children: [0, GOVERNANCE_ROW].map((offset) => /* @__PURE__ */ jsx("text", {
            x: 0,
            y: LOCKUP.baseline + offset,
            className: "site-header-governance",
            fontSize: 22 / WORDMARK_SCALE,
            letterSpacing: -0.66 / WORDMARK_SCALE,
            children: "Governance"
          }, offset))
        })
      })
    ]
  });
}

// packages/site-header/src/symbol.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var INTERFOLD_OUTLINE_RATIO = 48.1079 / 1000;
var INTERFOLD_SYMBOL_ASPECT_RATIO = 1000 / 844;
function InterfoldSymbol({ className = "", animated = false, lockup = false }) {
  return /* @__PURE__ */ jsxs2("svg", {
    className: `interfold-symbol ${className}`,
    "data-symbol-animated": animated || undefined,
    suppressHydrationWarning: true,
    fill: "none",
    preserveAspectRatio: "xMidYMid meet",
    viewBox: lockup ? `0 0 ${LOCKUP.symbolWidth} ${LOCKUP.height}` : "0 0 1000 844",
    children: [
      lockup ? /* @__PURE__ */ jsx2("path", {
        className: "interfold-symbol-rest",
        d: LOCKUP_SYMBOL_PATH,
        fill: "currentColor"
      }) : /* @__PURE__ */ jsx2("path", {
        className: "interfold-symbol-rest",
        d: "M764.414 232.163L552.883 23.7045L447.117 127.934L341.351 23.7045L0 360.097V369.911V786.827V844L235.586 611.837L447.117 820.296L552.883 716.066L658.649 820.296L1000 483.903V0L764.414 232.163ZM764.414 299.149L941.934 474.089L870.18 544.8L481.13 161.452L552.883 90.7413L764.414 299.2V299.149ZM730.453 474.14L658.7 544.851L375.364 265.631L447.117 194.92L730.453 474.14ZM624.687 578.369L552.934 649.08L269.649 369.86L341.402 299.149L624.738 578.369H624.687ZM235.586 194.92L307.339 265.631L235.586 336.342L163.832 265.631L235.586 194.92ZM764.414 507.658L836.168 578.369L764.414 649.08L692.661 578.369L764.414 507.658ZM341.351 232.163L269.598 161.452L341.351 90.7413L413.105 161.452L341.351 232.163ZM48.1079 427.083L201.624 578.369L48.1079 729.655V427.133V427.083ZM235.586 544.851L58.0665 369.911L129.82 299.2L518.921 682.649L447.168 753.359L235.637 544.901L235.586 544.851ZM658.649 611.887L730.402 682.598L658.649 753.309L586.896 682.598L658.649 611.887ZM951.943 416.917L798.427 265.631L951.943 114.345V416.917Z",
        fill: "currentColor"
      }),
      animated && /* @__PURE__ */ jsx2("image", {
        className: "interfold-symbol-motion",
        y: lockup ? LOCKUP.symbolTop : 0,
        width: lockup ? LOCKUP.symbolWidth : 1000,
        height: lockup ? LOCKUP.symbolHeight : 844,
        preserveAspectRatio: lockup ? "none" : "xMidYMid meet",
        suppressHydrationWarning: true
      })
    ]
  });
}

// node_modules/hamburger-react/dist-esm/Burger.js
import { useState as useState2, useEffect as useEffect2 } from "react";
var area = 48;
var Burger = ({
  color = "currentColor",
  direction = "left",
  distance = "md",
  duration = 0.4,
  easing = "cubic-bezier(0, 0, 0, 1)",
  hideOutline = true,
  label,
  lines = 3,
  onToggle,
  render,
  rounded = false,
  size = 32,
  toggle,
  toggled,
  disabled = false,
  animateOnMount = false
}) => {
  const [toggledInternal, toggleInternal] = useState2(false);
  const [mounted, setMounted] = useState2(false);
  useEffect2(() => {
    setMounted(true);
  }, []);
  const width = Math.max(12, Math.min(area, size));
  const room = Math.round((area - width) / 2);
  const barHeightRaw = width / 12;
  const barHeight = Math.round(barHeightRaw);
  const space = distance === "lg" ? 0.25 : distance === "sm" ? 0.75 : 0.5;
  const marginRaw = width / (lines * (space + (lines === 3 ? 1 : 1.25)));
  const margin = Math.round(marginRaw);
  const height = barHeight * lines + margin * (lines - 1);
  const topOffset = Math.round((area - height) / 2);
  const translate = lines === 3 ? distance === "lg" ? 4.0425 : distance === "sm" ? 5.1625 : 4.6325 : distance === "lg" ? 6.7875 : distance === "sm" ? 8.4875 : 7.6675;
  const deviation = (barHeightRaw - barHeight + (marginRaw - margin)) / (lines === 3 ? 1 : 2);
  const move = parseFloat((width / translate - deviation / (4 / 3)).toFixed(2));
  const time = Math.max(0, duration);
  const burgerStyles = {
    cursor: disabled ? "not-allowed" : "pointer",
    height: `${area}px`,
    position: "relative",
    transition: `${time}s ${easing}`,
    userSelect: "none",
    width: `${area}px`
  };
  const barStyles = {
    background: color,
    height: `${barHeight}px`,
    left: `${room}px`,
    position: "absolute"
  };
  if (hideOutline) {
    burgerStyles["outline"] = "none";
  }
  if (rounded) {
    barStyles["borderRadius"] = "9em";
  }
  const getIsToggled = () => {
    const isToggled = toggled !== undefined ? toggled : toggledInternal;
    return animateOnMount && !mounted ? !isToggled : isToggled;
  };
  const toggleFunction = toggle || toggleInternal;
  const isToggled = getIsToggled();
  const handler = () => {
    toggleFunction(!isToggled);
    if (typeof onToggle === "function")
      onToggle(!isToggled);
  };
  return render({
    barHeight,
    barStyles,
    burgerStyles,
    easing,
    handler,
    isLeft: direction === "left",
    isToggled,
    label,
    margin,
    move,
    time,
    topOffset,
    width
  });
};

// node_modules/hamburger-react/dist-esm/Cross.js
import React from "react";
function _extends() {
  _extends = Object.assign || function(target) {
    for (var i = 1;i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
var Cross = (props) => /* @__PURE__ */ React.createElement(Burger, _extends({}, props, {
  lines: 2,
  render: (o) => /* @__PURE__ */ React.createElement("div", {
    className: "hamburger-react",
    "aria-label": o.label,
    "aria-expanded": o.isToggled,
    onClick: props.disabled ? undefined : o.handler,
    onKeyUp: props.disabled ? undefined : (e) => e.key === "Enter" && o.handler(),
    role: "button",
    style: o.burgerStyles,
    tabIndex: 0
  }, /* @__PURE__ */ React.createElement("div", {
    style: {
      ...o.barStyles,
      width: `${o.width}px`,
      top: `${o.topOffset}px`,
      transition: `${o.time}s ${o.easing}`,
      transform: `${o.isToggled ? `rotate(${45 * (o.isLeft ? -1 : 1)}deg) translate(${o.move * (o.isLeft ? -1 : 1)}px, ${o.move}px)` : "none"}`
    }
  }), /* @__PURE__ */ React.createElement("div", {
    style: {
      ...o.barStyles,
      width: `${o.width}px`,
      top: `${o.topOffset + o.barHeight + o.margin}px`,
      transition: `${o.time}s ${o.easing}`,
      transform: `${o.isToggled ? `rotate(${45 * (o.isLeft ? 1 : -1)}deg) translate(${o.move * (o.isLeft ? -1 : 1)}px, ${o.move * -1}px)` : "none"}`
    }
  }))
}));

// packages/site-header/src/menuButton.tsx
import { useSyncExternalStore } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function subscribe(callback) {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", callback);
  return () => preference.removeEventListener("change", callback);
}
var reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function SiteHeaderMenuButton({ open, onOpenChange, variant = "responsive", className = "", id, action }) {
  const reducedMotion = useSyncExternalStore(subscribe, reduced, () => true);
  return /* @__PURE__ */ jsxs3("div", {
    id,
    className: `site-header-menu-trigger interfold-mobile-menu-trigger ${className}`,
    "data-header-menu-trigger": variant,
    "data-ready": "false",
    suppressHydrationWarning: true,
    children: [
      action && /* @__PURE__ */ jsx3("div", {
        className: "site-header-menu-action",
        "data-menu-open": open,
        children: action
      }),
      /* @__PURE__ */ jsx3(Cross, {
        toggled: open,
        toggle: onOpenChange,
        direction: "right",
        size: 28,
        distance: "sm",
        duration: reducedMotion ? 0 : 0.35,
        color: "var(--site-chrome-ink)",
        rounded: true,
        label: open ? "Close menu" : "Open menu"
      })
    ]
  });
}
// packages/site-header/src/signup.tsx
import { useEffect as useEffect3, useRef } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var GHOST_SIGNUP_SCRIPT = "https://cdn.jsdelivr.net/ghost/signup-form@~0.3/umd/signup-form.min.js";
var GHOST_SITE = "https://blog.theinterfold.com/";
var GHOST_FORM_BACKGROUND = "#f2fff7";
var GHOST_FORM_BUTTON = "#82f5ad";
var GHOST_FORM_BUTTON_TEXT = "#121718";
var GHOST_FORM_TEXT = "#3a5e3c";
var GHOST_FRAME_STYLE_ID = "interfold-ghost-signup-color-style";
var retainedEmbed;
var mountedEmbeds = new WeakSet;
var GHOST_FRAME_COLOR_STYLES = `
  html,
  body {
    background: transparent !important;
  }

  form,
  .gh-signup-form,
  .gh-form,
  input,
  input[type="email"] {
    background: ${GHOST_FORM_BACKGROUND} !important;
    color: ${GHOST_FORM_TEXT} !important;
  }

  input::placeholder {
    color: #687d71 !important;
    opacity: 0.72 !important;
  }

  button,
  button[type="submit"] {
    background: ${GHOST_FORM_BUTTON} !important;
    color: ${GHOST_FORM_BUTTON_TEXT} !important;
  }
`;
function GhostSignupForm({ className = "" }) {
  const embedRef = useRef(null);
  useEffect3(() => {
    const mount = embedRef.current;
    if (!mount) {
      return;
    }
    const embed = retainedEmbed && !mountedEmbeds.has(retainedEmbed) ? retainedEmbed : document.createElement("div");
    mountedEmbeds.add(embed);
    retainedEmbed = embed;
    mount.appendChild(embed);
    let active = true;
    let listeningFrame = null;
    const animationFrames = new Set;
    const styleGhostFrame = () => {
      if (!active)
        return;
      const iframe = embed.querySelector("iframe");
      if (!iframe) {
        return;
      }
      iframe.style.background = "transparent";
      iframe.style.border = "0";
      iframe.style.display = "block";
      iframe.style.minHeight = "58px";
      iframe.style.width = "100%";
      if (listeningFrame !== iframe) {
        listeningFrame?.removeEventListener("load", styleGhostFrame);
        listeningFrame = iframe;
        iframe.addEventListener("load", styleGhostFrame);
      }
      try {
        const frameDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
        if (!frameDocument?.head) {
          return;
        }
        if (!frameDocument.getElementById(GHOST_FRAME_STYLE_ID)) {
          const style = frameDocument.createElement("style");
          style.id = GHOST_FRAME_STYLE_ID;
          style.textContent = GHOST_FRAME_COLOR_STYLES;
          frameDocument.head.appendChild(style);
        }
      } catch {}
    };
    const observer = new MutationObserver(styleGhostFrame);
    observer.observe(embed, { childList: true, subtree: true });
    if (!embed.querySelector("script")) {
      const script = document.createElement("script");
      script.async = true;
      script.src = GHOST_SIGNUP_SCRIPT;
      script.dataset.backgroundColor = GHOST_FORM_BACKGROUND;
      script.dataset.buttonColor = GHOST_FORM_BUTTON;
      script.dataset.buttonText = "Subscribe";
      script.dataset.buttonTextColor = GHOST_FORM_BUTTON_TEXT;
      script.dataset.placeholder = "Your email address";
      script.dataset.site = GHOST_SITE;
      script.dataset.textColor = GHOST_FORM_TEXT;
      script.dataset.locale = "en";
      embed.appendChild(script);
    }
    const scheduleRestyle = () => {
      if (!active)
        return;
      const frame = window.requestAnimationFrame(() => {
        animationFrames.delete(frame);
        styleGhostFrame();
      });
      animationFrames.add(frame);
    };
    const retryDelays = [0, 120, 400, 1000, 2000];
    const retryTimers = retryDelays.map((delay) => window.setTimeout(styleGhostFrame, delay));
    document.addEventListener("visibilitychange", scheduleRestyle);
    window.addEventListener("focus", scheduleRestyle);
    scheduleRestyle();
    return () => {
      active = false;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      document.removeEventListener("visibilitychange", scheduleRestyle);
      window.removeEventListener("focus", scheduleRestyle);
      listeningFrame?.removeEventListener("load", styleGhostFrame);
      observer.disconnect();
      mountedEmbeds.delete(embed);
      retainedEmbed = embed;
      if (embed.parentElement === mount)
        embed.remove();
    };
  }, []);
  return /* @__PURE__ */ jsxs4("div", {
    className: `interfold-ghost-signup ${className}`,
    children: [
      /* @__PURE__ */ jsx4("p", {
        className: "site-footer-label interfold-ghost-signup__label",
        children: "Updates"
      }),
      /* @__PURE__ */ jsx4("div", {
        className: "interfold-ghost-signup__embed",
        ref: embedRef,
        style: { minHeight: 58, width: "100%" }
      })
    ]
  });
}

// packages/site-header/src/footer.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function StaticReveal({ children, className }) {
  return /* @__PURE__ */ jsx5("div", {
    className,
    children
  });
}
function SiteFooter({
  siteUrl = "",
  background = "#d9fce8",
  linkGroups,
  showUpdates = true,
  copyright = "All Rights Reserved © 2026",
  Reveal = StaticReveal
}) {
  const origin = siteUrl.replace(/\/$/, "");
  const groups = linkGroups ?? [
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: `${origin}/privacy` },
        { label: "Terms & Conditions", href: `${origin}/terms` }
      ]
    },
    {
      title: "Follow us",
      links: [
        { label: "Telegram", href: "https://t.me/enclave_e3" },
        { label: "Github", href: "https://github.com/theinterfold/interfold" },
        { label: "X", href: "https://x.com/theinterfold" }
      ]
    }
  ];
  return /* @__PURE__ */ jsx5("footer", {
    id: "site-footer",
    className: "site-footer",
    style: { backgroundColor: background },
    children: /* @__PURE__ */ jsxs5("div", {
      className: "site-footer-grid",
      children: [
        /* @__PURE__ */ jsx5("div", {
          className: "site-footer-brand",
          children: /* @__PURE__ */ jsx5(Reveal, {
            children: /* @__PURE__ */ jsxs5("p", {
              className: "site-footer-wordmark",
              children: [
                /* @__PURE__ */ jsx5("span", {
                  children: "The"
                }),
                /* @__PURE__ */ jsx5("span", {
                  children: "Interfold"
                })
              ]
            })
          })
        }),
        groups.map((group, index) => /* @__PURE__ */ jsxs5("div", {
          className: `${index === 0 ? "site-footer-legal" : "site-footer-social"} site-footer-group`,
          children: [
            /* @__PURE__ */ jsx5(Reveal, {
              delay: 0.1,
              children: /* @__PURE__ */ jsx5("p", {
                className: "site-footer-label",
                children: group.title
              })
            }),
            /* @__PURE__ */ jsx5("div", {
              className: "site-footer-links",
              children: group.links.map((link, linkIndex) => /* @__PURE__ */ jsx5(Reveal, {
                delay: (linkIndex + 2) / 10,
                children: /* @__PURE__ */ jsx5("a", {
                  href: link.href,
                  children: link.label
                })
              }, link.href))
            })
          ]
        }, index)),
        showUpdates && /* @__PURE__ */ jsx5("div", {
          className: "interfold-footer-baseline-item interfold-footer-signup",
          children: /* @__PURE__ */ jsx5(Reveal, {
            delay: 0.5,
            children: /* @__PURE__ */ jsx5(GhostSignupForm, {
              className: "interfold-footer-signup-form"
            })
          })
        }),
        /* @__PURE__ */ jsx5("div", {
          className: "interfold-footer-baseline-item site-footer-copyright",
          children: /* @__PURE__ */ jsx5(Reveal, {
            delay: 0.7,
            children: /* @__PURE__ */ jsx5("p", {
              className: "site-footer-label",
              children: copyright
            })
          })
        })
      ]
    })
  });
}
// packages/site-header/src/chevron.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function BendingChevron({
  open,
  width = 10,
  thickness = 1.6,
  className = "",
  style
}) {
  return /* @__PURE__ */ jsxs6("span", {
    "aria-hidden": "true",
    className: `interfold-chevron ${className}`,
    "data-open": open,
    style: {
      "--chevron-width": typeof width === "number" ? `${width}px` : width,
      "--chevron-thickness": typeof thickness === "number" ? `${thickness}px` : thickness,
      ...style
    },
    children: [
      /* @__PURE__ */ jsx6("span", {
        className: "interfold-chevron-arm interfold-chevron-left"
      }),
      /* @__PURE__ */ jsx6("span", {
        className: "interfold-chevron-arm interfold-chevron-right"
      })
    ]
  });
}
// packages/site-header/src/mobileMenu.ts
import { useEffect as useEffect4, useRef as useRef2 } from "react";
function useMobileMenuBehavior(open, onOpenChange) {
  const dialogRef = useRef2(null);
  useEffect4(() => {
    if (!open)
      return;
    const previousFocus = document.activeElement;
    const scrollY = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    };
    const controls = () => [
      ...Array.from(dialogRef.current?.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]') ?? []),
      ...Array.from(document.querySelectorAll(".interfold-mobile-menu-trigger button:not([disabled]), .interfold-mobile-menu-trigger [role='button']"))
    ].filter((item) => !!item && item.tabIndex >= 0 && !item.closest("[inert], [aria-hidden='true']") && item.getClientRects().length > 0);
    const hasForegroundDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')).some((dialog) => dialog !== dialogRef.current && !dialog.contains(dialogRef.current) && !dialog.closest('[hidden], [inert], [aria-hidden="true"]') && dialog.getClientRects().length > 0);
    const onKey = (event) => {
      if (event.defaultPrevented || hasForegroundDialog())
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange?.(false);
      }
      if (event.key !== "Tab")
        return;
      const items = controls();
      const current = items.indexOf(document.activeElement);
      event.preventDefault();
      const next = current < 0 ? event.shiftKey ? items.length - 1 : 0 : (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    };
    const onFocus = (event) => {
      if (hasForegroundDialog())
        return;
      const target = event.target;
      if (!dialogRef.current?.contains(target) && !target.closest(".interfold-mobile-menu-trigger")) {
        controls()[0]?.focus({ preventScroll: true });
      }
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onFocus);
    controls()[0]?.focus({ preventScroll: true });
    const desktop = window.matchMedia("(min-width: 1280px)");
    const onDesktop = () => {
      if (desktop.matches)
        onOpenChange?.(false);
    };
    desktop.addEventListener("change", onDesktop);
    onDesktop();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onFocus);
      desktop.removeEventListener("change", onDesktop);
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      document.body.style.overflow = previous.overflow;
      document.documentElement.style.overflow = previous.htmlOverflow;
      window.scrollTo(0, scrollY);
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open, onOpenChange]);
  return dialogRef;
}

// packages/site-header/src/index.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function SiteHeaderChrome({
  variant = "responsive",
  layout,
  governance = false,
  homeHref = "/",
  HomeLink = "a",
  brandLinkProps,
  symbolLinkProps,
  navigation,
  navigationLabel = "Main navigation",
  extendedBrand = governance,
  className = "",
  ...props
}) {
  const selectedLayout = useHeaderLayout(layout);
  const headerRef = useRef3(null);
  const [ready, setReady] = useState3(false);
  const [entrance, setEntrance] = useState3(0);
  useBeforePaint(() => {
    const header = headerRef.current;
    if (!header)
      return;
    const runtime = installHeaderEntranceRuntime();
    setReady(true);
    setEntrance(runtime.prepare(header).revision);
    const replay = () => setEntrance(runtime.prepare(header, true).revision);
    window.addEventListener("interfold:navbar-replay", replay);
    return () => {
      window.removeEventListener("interfold:navbar-replay", replay);
      runtime.release(header);
    };
  }, [variant]);
  return /* @__PURE__ */ jsx7("header", {
    ...props,
    ref: headerRef,
    suppressHydrationWarning: true,
    className: `site-header-chrome ${className}`,
    "data-ready": ready,
    "data-entrance": entrance ? "playing" : "static",
    "data-variant": variant,
    "data-layout": selectedLayout,
    "data-extended-brand": extendedBrand || undefined,
    children: /* @__PURE__ */ jsxs7("div", {
      className: "site-header-grid",
      children: [
        /* @__PURE__ */ jsxs7("div", {
          className: selectedLayout === "current" ? "site-header-identity" : "site-header-lockup",
          children: [
            /* @__PURE__ */ jsx7("div", {
              className: "site-header-symbol-slot",
              children: /* @__PURE__ */ jsx7(HomeLink, {
                ...symbolLinkProps,
                href: homeHref,
                "aria-hidden": "true",
                tabIndex: -1,
                className: "site-header-symbol",
                children: /* @__PURE__ */ jsx7(InterfoldSymbol, {
                  animated: true,
                  lockup: true
                })
              })
            }),
            /* @__PURE__ */ jsx7("div", {
              className: "site-header-brand-slot",
              children: /* @__PURE__ */ jsx7(HomeLink, {
                ...brandLinkProps,
                href: homeHref,
                "aria-label": governance ? "The Interfold Governance home" : "The Interfold home",
                className: "site-header-brand",
                children: /* @__PURE__ */ jsx7(HeaderWordmark, {
                  governance
                })
              })
            })
          ]
        }),
        navigation && /* @__PURE__ */ jsx7("nav", {
          "aria-label": navigationLabel,
          className: "site-header-navigation",
          children: navigation
        })
      ]
    })
  });
}
export {
  BendingChevron,
  GhostSignupForm,
  HEADER_ENTRANCE_BOOTSTRAP,
  HeaderWordmark,
  INTERFOLD_OUTLINE_RATIO,
  INTERFOLD_SYMBOL_ASPECT_RATIO,
  InterfoldSymbol,
  SiteFooter,
  SiteHeaderChrome,
  SiteHeaderMenuButton,
  useMobileMenuBehavior
};
