import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./animatedAmount.module.css";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
type AmountCharacter = { key: string; value: string; digit?: boolean };

/** Formatted amounts use decimal points and comma groups; retain the place value without rounding the number. */
export function amountCharacters(value: string): AmountCharacter[] {
  const match = value.match(/^([^\d]*)(\d(?:[\d,.]*\d)?)([^\d]*)$/);
  if (!match) return [{ key: "label", value }];
  const [, prefix, number, suffix] = match;
  if ((number.match(/\./g) ?? []).length > 1) return [{ key: "label", value }];
  const [integer, fraction] = number.split(".");
  let place = integer.replace(/,/g, "").length;
  const characters: AmountCharacter[] = prefix ? [{ key: "prefix", value: prefix }] : [];
  for (const character of integer) {
    if (/\d/.test(character)) {
      characters.push({ key: `integer-${--place}`, value: character, digit: true });
    } else {
      characters.push({ key: `group-${place}`, value: character });
    }
  }
  if (fraction !== undefined) {
    characters.push({ key: "decimal", value: "." });
    Array.from(fraction).forEach((character, index) => {
      characters.push({ key: `fraction-${index}`, value: character, digit: true });
    });
  }
  if (suffix) characters.push({ key: "suffix", value: suffix });
  return characters;
}

const timing = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  const token = style.getPropertyValue("--interfold-ui-duration").trim();
  return {
    duration: (parseFloat(token) || 320) * (token.endsWith("s") && !token.endsWith("ms") ? 1000 : 1),
    easing: style.getPropertyValue("--interfold-ui-ease").trim() || "cubic-bezier(0.22, 1, 0.36, 1)",
  };
};

/** Keep punctuation and units still; changed digits retain their place value and interrupted visual position. */
export function AnimatedAmount({
  value,
  highlighted = false,
  plain = false,
}: {
  value: string;
  highlighted?: boolean;
  plain?: boolean;
}) {
  const amountRef = useRef<HTMLSpanElement>(null);
  const charactersRef = useRef<HTMLSpanElement>(null);
  const widthAnimation = useRef<Animation>();
  const targetWidth = useRef<number>();
  const measured = useRef(false);
  const previousCharacters = useRef(new Set(amountCharacters(value).map(({ key }) => key)));
  const [reducedMotion, setReducedMotion] = useState(false);
  const [frame, setFrame] = useState({ value, revision: 0 });
  if (frame.value !== value) {
    setFrame({ value, revision: frame.revision + 1 });
  }
  const characters = amountCharacters(value);

  useClientLayoutEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) widthAnimation.current?.cancel();
    };
    settle();
    preference.addEventListener("change", settle);
    return () => preference.removeEventListener("change", settle);
  }, []);

  useClientLayoutEffect(() => {
    const amount = amountRef.current;
    const content = charactersRef.current;
    if (!amount || !content) return;
    const measure = () => {
      // A hidden ballot retains its last width until it becomes visible again.
      if (!content.getClientRects().length) return;
      const next = content.offsetWidth;
      if (next === targetWidth.current) return;
      const current = parseFloat(getComputedStyle(amount).width);
      widthAnimation.current?.cancel();
      amount.style.width = `${next}px`;
      targetWidth.current = next;
      if (
        measured.current &&
        Math.abs(next - current) > 0.5 &&
        typeof amount.animate === "function" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        widthAnimation.current = amount.animate([{ width: `${current}px` }, { width: `${next}px` }], timing(amount));
      }
      measured.current = true;
    };
    measure();
    previousCharacters.current = new Set(characters.map(({ key }) => key));
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [value, plain, reducedMotion]);

  useEffect(() => () => widthAnimation.current?.cancel(), []);
  return (
    <span
      ref={amountRef}
      className={styles.amount}
      data-highlighted={highlighted && !plain}
      data-plain={plain}
      aria-label={value.replace(/\s+/g, " ")}
    >
      {frame.revision > 0 && !plain && <span key={frame.revision} className={styles.glow} aria-hidden="true" />}
      <span ref={charactersRef} aria-hidden="true" className={styles.characters}>
        {characters.map((character, index) =>
          character.digit ? (
            <AmountDigit
              key={character.key}
              value={character.value}
              delay={Math.min(index, 6) * 24}
              entering={!previousCharacters.current.has(character.key)}
              reducedMotion={reducedMotion}
            />
          ) : (
            <span key={character.key} className={styles.character}>
              {character.value}
            </span>
          )
        )}
      </span>
    </span>
  );
}

function AmountDigit({
  value,
  delay,
  entering,
  reducedMotion,
}: {
  value: string;
  delay: number;
  entering: boolean;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const initial = useRef(value);
  const layers = useRef(new Map<string, { element: HTMLSpanElement; animation?: Animation }>());
  const previous = useRef(value);
  const mounted = useRef(false);

  useClientLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!layers.current.size)
      layers.current.set(initial.current, { element: root.firstElementChild as HTMLSpanElement });
    const first = !mounted.current;
    mounted.current = true;
    const reduced = reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof root.animate !== "function" || (first && !entering)) {
      if (!layers.current.has(value)) {
        const element = document.createElement("span");
        element.className = styles.digitLayer;
        element.textContent = value;
        root.append(element);
        layers.current.set(value, { element });
      }
      layers.current.forEach(({ element, animation }, character) => {
        animation?.cancel();
        if (character !== value) {
          element.remove();
          layers.current.delete(character);
        } else {
          element.style.transform = "none";
          element.style.opacity = "1";
        }
      });
      previous.current = value;
      return;
    }
    if (!first && previous.current === value) return;
    previous.current = value;
    const interrupted = Array.from(layers.current.values()).some(({ animation }) => animation?.playState === "running");
    if (!layers.current.has(value)) {
      const element = document.createElement("span");
      element.className = styles.digitLayer;
      element.textContent = value;
      element.style.transform = "translateY(100%)";
      element.style.opacity = "0";
      root.append(element);
      layers.current.set(value, { element });
    } else if (first && entering) {
      const element = layers.current.get(value)!.element;
      element.style.transform = "translateY(100%)";
      element.style.opacity = "0";
    }
    // Capture every live layer before cancellation. A rapid reversal reuses its
    // original glyph instead of replacing the partly visible number with a full one.
    const frames = Array.from(layers.current, ([character, layer]) => ({
      character,
      layer,
      transform: getComputedStyle(layer.element).transform,
      opacity: getComputedStyle(layer.element).opacity,
    }));
    frames.forEach(({ character, layer, transform, opacity }) => {
      layer.animation?.cancel();
      const end = {
        transform: character === value ? "translateY(0)" : "translateY(-100%)",
        opacity: character === value ? "1" : "0",
      };
      Object.assign(layer.element.style, end);
      const animation = layer.element.animate([{ transform, opacity }, end], {
        ...timing(root),
        delay: interrupted ? 0 : delay,
        fill: "both",
      });
      layer.animation = animation;
      void animation.finished
        .then(() => {
          if (layer.animation !== animation) return;
          animation.cancel();
          layer.animation = undefined;
          if (character !== previous.current) {
            layer.element.remove();
            layers.current.delete(character);
          }
        })
        .catch(() => {});
    });
  }, [value, reducedMotion]);

  useEffect(() => () => layers.current.forEach(({ animation }) => animation?.cancel()), []);
  return (
    <span ref={ref} className={styles.character} data-digit="true">
      <span className={styles.digitLayer}>{initial.current}</span>
    </span>
  );
}
