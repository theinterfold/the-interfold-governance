import type { DialogRoot } from "@aragon/ods";
import { dismissOtherPopovers } from "./usePopoverGroup";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
type Props = ComponentProps<typeof DialogRoot> & {
  open: boolean;
  triggerRef: RefObject<HTMLElement>;
  onCloseComplete?: () => void;
};

/** Radix owns focus and dismissal; one animation owns the entire button-to-dialog lifecycle. */
export function MorphDialog({
  open,
  triggerRef,
  children,
  containerClassName = "",
  overlayClassName = "",
  modal = true,
  onOpenChange,
  onCloseComplete,
  useFocusTrap: _useFocusTrap,
  ...props
}: Props) {
  const [present, setPresent] = useState(open);
  const overlayId = `morph-overlay-${useId().replace(/:/g, "")}`;
  const lastContent = useRef(children);
  const closeComplete = useRef(onCloseComplete);
  closeComplete.current = onCloseComplete;
  if (open) lastContent.current = children;
  const onExited = useCallback(() => {
    setPresent(false);
    closeComplete.current?.();
  }, []);
  useClientLayoutEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  return (
    <Dialog.Root open={open || present} modal={modal} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`morph-dialog-overlay fixed inset-0 z-[var(--ods-dialog-overlay-z-index)] ${overlayClassName} ${overlayId}`}
        />
        <Dialog.Content
          {...props}
          aria-describedby={undefined}
          className={`fixed inset-x-2 bottom-2 z-[var(--ods-dialog-content-z-index)] mx-auto flex max-h-[calc(100vh-80px)] max-w-[480px] flex-col rounded-xl border border-neutral-100 bg-neutral-0 shadow-neutral-md md:min-w-[480px] lg:bottom-auto lg:top-[120px] lg:max-h-[calc(100vh-200px)] ${containerClassName} morph-dialog`}
        >
          <MorphSurface open={open} triggerRef={triggerRef} onExited={onExited} overlayId={overlayId}>
            {lastContent.current}
          </MorphSurface>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const shellFrame = (frame: DOMRect, surface: DOMRect) => ({
  transform: `translate3d(${frame.left}px, ${frame.top}px, 0) scale(${frame.width / surface.width}, ${frame.height / surface.height})`,
});
const shellRadius = (frame: Pick<DOMRect, "width" | "height">, surface: DOMRect, radius: string) =>
  `${(parseFloat(radius) * surface.width) / frame.width}px / ${(parseFloat(radius) * surface.height) / frame.height}px`;
const titleFrame = (left: number, top: number, scale: number) => ({
  transform: `translate3d(${left}px, ${top}px, 0) scale(${scale})`,
});
const contentFrame = (frame: DOMRect, surface: DOMRect) => {
  const scale = Math.min(frame.width / surface.width, frame.height / surface.height, 1);
  return {
    translate: `${frame.left - surface.left + (frame.width - surface.width * scale) / 2}px ${frame.top - surface.top + (frame.height - surface.height * scale) / 2}px`,
    scale: `${scale}`,
  };
};

function buttonContent(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    const copy = copies[index];
    // Copy only what the detached label needs. Copying every computed property on
    // every descendant can occupy the first several frames of the opening.
    for (const property of [
      "font",
      "letter-spacing",
      "color",
      "display",
      "align-items",
      "justify-content",
      "gap",
      "width",
      "height",
      "padding",
      "border-width",
      "box-sizing",
      "flex",
      "transform",
      "opacity",
    ])
      copy.style.setProperty(property, style.getPropertyValue(property));
    copy.removeAttribute("id");
    copy.removeAttribute("data-morph-source");
    copy.style.transition = "none";
    copy.style.animation = "none";
  });
  Object.assign(clone.style, {
    background: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    outline: "none",
    margin: "0",
    position: "static",
    flex: "0 0 auto",
    opacity: "1",
    pointerEvents: "none",
  });
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  return clone;
}
const palette = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
  };
};

function MorphSurface({
  open,
  triggerRef,
  onExited,
  children,
  overlayId,
}: Pick<Props, "open" | "triggerRef" | "children"> & {
  onExited: () => void;
  overlayId: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const sourceRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const destinationPalette = useRef<ReturnType<typeof palette>>();

  useClientLayoutEffect(() => {
    const content = contentRef.current;
    const surface = content?.closest<HTMLElement>(".morph-dialog");
    const source = sourceRef.current ?? triggerRef.current;
    if (!content || !surface) return;
    const headingRoot = surface.querySelector<HTMLElement>("h2");
    const heading = headingRoot?.querySelector<HTMLElement>("[data-dialog-title-current]") ?? headingRoot;
    const overlay = document.getElementsByClassName(overlayId)[0] as HTMLElement | undefined;
    if (open) {
      content.removeAttribute("inert");
      delete surface.dataset.morphHidden;
      overlay?.style.removeProperty("visibility");
    } else {
      content.setAttribute("inert", "");
      // Closing during a step change must keep its current height, not jump to the new step's target.
      surface.querySelectorAll<HTMLElement>(".fluid-height").forEach((element) => {
        element.style.setProperty("--morph-frozen-height", `${element.offsetHeight}px`);
      });
    }

    let stopped = false;
    let generation = 0;
    let startFrame = 0;
    const observer = new ResizeObserver(() => {
      // Layout sizes exclude the temporary fit scale applied during the flight.
      if (
        open &&
        (Math.abs(surface.offsetHeight - destination.height) > 1 ||
          Math.abs(surface.offsetWidth - destination.width) > 1)
      )
        run();
    });
    const stopAnimations = () => {
      cancelAnimationFrame(startFrame);
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
    const finish = () => {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      if (!open) surface.dataset.morphHidden = "";
      stopAnimations();
      shellRef.current?.remove();
      shellRef.current = null;
      titleRef.current?.remove();
      titleRef.current = null;
      labelRef.current?.remove();
      labelRef.current = null;
      headingRoot?.removeAttribute("data-morph-title");
      delete surface.dataset.morphing;
      surface
        .querySelectorAll<HTMLElement>(".fluid-height")
        .forEach((element) => element.style.removeProperty("--morph-frozen-height"));
      if (!open) {
        if (overlay) overlay.style.visibility = "hidden";
        surface.dataset.morphHidden = "";
        source?.removeAttribute("data-morph-source");
        onExited();
      }
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const origin = source?.getBoundingClientRect();
    if (
      reducedMotion.matches ||
      !surface.animate ||
      !source?.isConnected ||
      !origin?.width ||
      !origin.height ||
      origin.bottom <= 0 ||
      origin.top >= window.innerHeight
    ) {
      finish();
      return;
    }

    sourceRef.current = source;
    destinationPalette.current ??= palette(surface);
    const buttonPalette = palette(source);
    const dialogPalette = destinationPalette.current;
    const continuing = !!shellRef.current;
    const shell = shellRef.current ?? document.createElement("div");
    if (!continuing) {
      shell.className = "morph-dialog-shell";
      shell.setAttribute("aria-hidden", "true");
      shell.setAttribute("inert", "");
      shell.style.zIndex = getComputedStyle(surface).zIndex;
      const skin = document.createElement("span");
      skin.className = "morph-dialog-skin";
      Object.assign(skin.style, dialogPalette);
      shell.append(skin);
      const label = document.createElement("span");
      label.className = "morph-dialog-origin-label";
      label.append(buttonContent(source));
      Object.assign(label.style, {
        left: `${origin.left}px`,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
        height: `${origin.height}px`,
        zIndex: getComputedStyle(surface).zIndex,
      });
      labelRef.current = label;
      surface.before(label);
      // Same stacking level, immediately below the real dialog content.
      label.before(shell);
      shellRef.current = shell;
    }
    const skin = shell.querySelector<HTMLElement>(".morph-dialog-skin")!;
    const label = labelRef.current!;
    const sourceLabel = source.querySelector<HTMLElement>(".action-label-text");
    const sourceText = document.createRange();
    sourceText.selectNodeContents(sourceLabel ?? source);
    const sourceTextBounds = sourceText.getBoundingClientRect();
    const sourceStyle = getComputedStyle(sourceLabel ?? source);
    const sourceFont = parseFloat(sourceStyle.fontSize);
    const sharedTitle = !!heading && (sourceLabel ?? source).textContent?.trim() === heading.textContent?.trim();
    if (sharedTitle) {
      const clonedLabel = label.querySelector<HTMLElement>(".action-label-text");
      if (clonedLabel) clonedLabel.style.visibility = "hidden";
      else label.style.visibility = "hidden";
    }
    const headingStyle = heading ? getComputedStyle(heading) : undefined;
    const titleScale = headingStyle ? sourceFont / parseFloat(headingStyle.fontSize) : 1;
    const headingText = document.createRange();
    if (heading) headingText.selectNodeContents(heading);
    const currentFit = parseFloat(getComputedStyle(surface).scale) || 1;
    const glyphOffset = heading
      ? (headingText.getBoundingClientRect().top - heading.getBoundingClientRect().top) / currentFit
      : 0;
    const sourceTitleFrame = titleFrame(
      sourceTextBounds.left,
      sourceTextBounds.top - glyphOffset * titleScale,
      titleScale
    );
    const title = titleRef.current ?? document.createElement("div");
    if (heading && !titleRef.current) {
      title.className = "morph-dialog-title";
      title.setAttribute("aria-hidden", "true");
      title.setAttribute("inert", "");
      const style = getComputedStyle(heading);
      Object.assign(title.style, {
        font: style.font,
        letterSpacing: style.letterSpacing,
        color: style.color,
        width: `${heading.offsetWidth}px`,
        zIndex: getComputedStyle(surface).zIndex,
      });
      title.textContent = heading.textContent;
      if (sharedTitle) {
        title.style.color = sourceStyle.color;
        const targetInk = document.createElement("span");
        targetInk.className = "morph-dialog-title-ink";
        targetInk.textContent = heading.textContent;
        targetInk.style.color = style.color;
        title.append(targetInk);
      }
      surface.before(title);
      titleRef.current = title;
      const target = heading.getBoundingClientRect();
      Object.assign(title.style, {
        ...(open ? sourceTitleFrame : titleFrame(target.left, target.top, 1)),
        opacity: open && !sharedTitle ? "0" : "1",
      });
    }
    headingRoot?.setAttribute("data-morph-title", "");
    source.setAttribute("data-morph-source", "");
    if (open) dismissOtherPopovers(overlayId);
    surface.dataset.morphing = open ? "opening" : "closing";
    let destination = surface.getBoundingClientRect();
    if (!continuing) {
      Object.assign(shell.style, buttonPalette, {
        borderRadius: shellRadius(
          open ? origin : destination,
          destination,
          open ? buttonPalette.borderRadius : dialogPalette.borderRadius
        ),
      });
      skin.style.opacity = open ? "0" : "1";
      label.style.opacity = open ? "1" : "0";
      Object.assign(
        shell.style,
        { width: `${destination.width}px`, height: `${destination.height}px` },
        shellFrame(open ? origin : destination, destination)
      );
    }
    const started = performance.now();
    const duration = open ? 400 : 280;
    let initial = !continuing;
    const run = () => {
      if (stopped) return;
      const revision = ++generation;
      // The shell has independent bounds, so content arriving mid-flight cannot stretch or jump it.
      const currentBounds = shell.getBoundingClientRect();
      const startPalette = palette(shell);
      const skinOpacity = getComputedStyle(skin).opacity;
      const contentOpacity = initial ? (open ? "0" : "1") : getComputedStyle(content).opacity;
      const labelOpacity = getComputedStyle(label).opacity;
      const labelStart = getComputedStyle(label).transform;
      const overlayOpacity = initial && open ? "0" : overlay ? getComputedStyle(overlay).opacity : "1";
      const titleStyle = getComputedStyle(title);
      const titleStart = { transform: titleStyle.transform, opacity: titleStyle.opacity };
      const titleInk = title.querySelector<HTMLElement>(".morph-dialog-title-ink");
      const inkOpacity = initial ? (open ? "0" : "1") : titleInk ? getComputedStyle(titleInk).opacity : "1";
      initial = false;
      stopAnimations();
      destination = surface.getBoundingClientRect();
      Object.assign(shell.style, { width: `${destination.width}px`, height: `${destination.height}px` });
      const endPalette = open ? dialogPalette : buttonPalette;
      const remaining = Math.max(120, duration - (performance.now() - started));
      const options = { duration: remaining, fill: "both" as const };
      const easing = open ? "cubic-bezier(.25, .6, .3, 1)" : "cubic-bezier(.4, 0, .2, 1)";
      // Geometry stays on the compositor even while mounting/focusing the form occupies the main thread.
      const flight = shell.animate(
        [shellFrame(currentBounds, destination), shellFrame(open ? destination : origin, destination)],
        { ...options, easing }
      );
      const destinationBounds = open ? destination : origin;
      const visibleRadius = (parseFloat(startPalette.borderRadius) * currentBounds.width) / shell.offsetWidth;
      const cornerFrames: Keyframe[] = Array.from({ length: 17 }, (_, index) => {
        const progress = index / 16;
        return {
          offset: progress,
          borderRadius: shellRadius(
            {
              width: currentBounds.width + (destinationBounds.width - currentBounds.width) * progress,
              height: currentBounds.height + (destinationBounds.height - currentBounds.height) * progress,
            },
            destination,
            `${visibleRadius + (parseFloat(endPalette.borderRadius) - visibleRadius) * progress}px`
          ),
        };
      });
      Object.assign(cornerFrames[0], { borderColor: startPalette.borderColor, boxShadow: startPalette.boxShadow });
      Object.assign(cornerFrames[16], { borderColor: endPalette.borderColor, boxShadow: endPalette.boxShadow });
      const corners = shell.animate(cornerFrames, { ...options, easing });
      const surfaceColor = skin.animate(
        open
          ? [{ opacity: skinOpacity }, { opacity: 1, offset: 0.16 }, { opacity: 1 }]
          : [{ opacity: skinOpacity }, { opacity: skinOpacity, offset: 0.7 }, { opacity: 0 }],
        { ...options, easing: "linear" }
      );
      // Keep the body visible through the first half of closing, so the surface
      // does not turn into a large empty card before it reaches the button.
      const reveal = surface.animate(
        [contentFrame(currentBounds, destination), contentFrame(open ? destination : origin, destination)],
        { ...options, easing }
      );
      const fade = content.animate(
        open
          ? [
              { opacity: contentOpacity },
              { opacity: contentOpacity, offset: 0.12 },
              { opacity: 1, offset: 0.6 },
              { opacity: 1 },
            ]
          : [
              { opacity: contentOpacity },
              { opacity: contentOpacity, offset: 0.1 },
              { opacity: 0, offset: 0.6 },
              { opacity: 0 },
            ],
        { ...options, easing: "linear" }
      );
      const labelFade = label.animate(
        open
          ? [
              { opacity: labelOpacity },
              { opacity: labelOpacity, offset: 0.12 },
              { opacity: 0, offset: 0.28 },
              { opacity: 0 },
            ]
          : [
              { opacity: labelOpacity },
              { opacity: labelOpacity, offset: 0.45 },
              { opacity: 1, offset: 0.68 },
              { opacity: 1 },
            ],
        { ...options, easing: "linear" }
      );
      animations.current = [flight, corners, fade, labelFade, reveal, surfaceColor];
      if (heading) {
        const target = heading.getBoundingClientRect();
        // Read the untransformed title location: the surface reveal has already been installed.
        const fit = parseFloat(getComputedStyle(surface).scale) || 1;
        const surfaceBounds = surface.getBoundingClientRect();
        const targetLeft = destination.left + (target.left - surfaceBounds.left) / fit;
        const targetTop = destination.top + (target.top - surfaceBounds.top) / fit;
        const titleEnd = open ? titleFrame(targetLeft, targetTop, 1) : sourceTitleFrame;
        // Both labels follow the same path. When their wording differs, exchange
        // them in flight instead of leaving one behind or squeezing the long title
        // into the source button at the end of closing.
        const labelEnd = `translate3d(${targetLeft - sourceTextBounds.left}px, ${targetTop + glyphOffset - sourceTextBounds.top}px, 0) scale(${1 / titleScale})`;
        label.style.transformOrigin = `${sourceTextBounds.left - origin.left}px ${sourceTextBounds.top - origin.top}px`;
        animations.current.push(
          label.animate(
            [{ transform: !continuing && !open ? labelEnd : labelStart }, { transform: open ? labelEnd : "none" }],
            { ...options, easing }
          )
        );
        const titleMove = title.animate([{ transform: titleStart.transform }, titleEnd], { ...options, easing });
        const titleFade = title.animate(
          sharedTitle
            ? [{ opacity: 1 }, { opacity: 1 }]
            : open
              ? [
                  { opacity: titleStart.opacity },
                  { opacity: titleStart.opacity, offset: 0.28 },
                  { opacity: 1, offset: 0.48 },
                  { opacity: 1 },
                ]
              : [
                  { opacity: titleStart.opacity },
                  { opacity: titleStart.opacity, offset: 0.2 },
                  { opacity: 0, offset: 0.45 },
                  { opacity: 0 },
                ],
          { ...options, easing: "linear" }
        );
        animations.current.push(titleMove, titleFade);
        if (titleInk)
          animations.current.push(
            titleInk.animate(
              open
                ? [
                    { opacity: inkOpacity },
                    { opacity: inkOpacity, offset: 0.07 },
                    { opacity: 1, offset: 0.07 },
                    { opacity: 1 },
                  ]
                : [
                    { opacity: inkOpacity },
                    { opacity: inkOpacity, offset: 0.87 },
                    { opacity: 0, offset: 0.87 },
                    { opacity: 0 },
                  ],
              { ...options, easing: "linear" }
            )
          );
      }
      if (overlay)
        animations.current.push(
          overlay.animate([{ opacity: overlayOpacity }, { opacity: open ? 1 : 0 }], { ...options, easing: "ease-out" })
        );
      if (open && !continuing && revision === 1) {
        // Paint the origin first. Portal mounting and autofocus must not consume the opening frames.
        const starting = animations.current;
        starting.forEach((animation) => {
          animation.pause();
          animation.currentTime = 0;
        });
        startFrame = requestAnimationFrame(() => {
          startFrame = requestAnimationFrame(() => {
            if (!stopped && revision === generation) starting.forEach((animation) => animation.play());
          });
        });
      }
      void flight.finished
        .then(() => {
          if (revision === generation) finish();
        })
        .catch(() => {});
    };
    run();
    observer.observe(surface);
    window.addEventListener("resize", finish);
    reducedMotion.addEventListener("change", finish);
    return () => {
      stopped = true;
      cancelAnimationFrame(startFrame);
      observer.disconnect();
      window.removeEventListener("resize", finish);
      reducedMotion.removeEventListener("change", finish);
    };
  }, [open, triggerRef, onExited, overlayId]);

  useClientLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
      shellRef.current?.remove();
      shellRef.current = null;
      titleRef.current?.remove();
      titleRef.current = null;
      labelRef.current?.remove();
      labelRef.current = null;
      animations.current = [];
      sourceRef.current?.removeAttribute("data-morph-source");
    },
    []
  );

  return (
    <div ref={contentRef} className="morph-dialog-content">
      {children}
    </div>
  );
}
