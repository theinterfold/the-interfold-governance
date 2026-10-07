import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./cipherTitle.module.css";

const label = "Privacy tools";
// Thin letters and the space stay still so each glyph can retain its original width.
const positions = [0, 1, 3, 4, 5, 6, 8, 9, 10, 12];
const alphabet = "01#<>/";
type CipherSlot = { symbols: string[]; delay: number };

// A tiny bitmap alphabet keeps the burst visibly pixelated at the existing title size.
const pixelRows: Record<string, number[]> = {
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "#": [10, 31, 10, 10, 31, 10, 0],
  "<": [1, 2, 4, 8, 4, 2, 1],
  ">": [16, 8, 4, 2, 4, 8, 16],
  "/": [1, 2, 2, 4, 8, 8, 16],
};
const pixelPaths = Object.fromEntries(
  Object.entries(pixelRows).map(([glyph, rows]) => [
    glyph,
    rows
      .flatMap((row, y) => Array.from({ length: 5 }, (_, x) => (row & (1 << (4 - x)) ? `M${x} ${y}h1v1h-1z` : "")))
      .join(""),
  ])
);
function PixelGlyph({ glyph }: { glyph: string }) {
  return (
    <svg className={styles.pixelGlyph} viewBox="0 0 5 7" aria-hidden="true" focusable="false">
      <path d={pixelPaths[glyph]} fill="currentColor" />
    </svg>
  );
}

/** Three overlapping groups share a short burst; each glyph has time to register. */
export function CipherTitle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const root = useRef<HTMLSpanElement>(null);
  const [burst, setBurst] = useState<{ revision: number; slots: Record<number, CipherSlot> }>({
    revision: 0,
    slots: {},
  });

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forced = window.matchMedia("(forced-colors: active)");
    let timer: ReturnType<typeof setTimeout>;
    let visible = false;
    const active = () => visible && !document.hidden && !reduced.matches && !forced.matches;
    const clear = () => setBurst((last) => ({ ...last, slots: {} }));
    const animate = () => {
      if (!active()) return;
      const shuffled = [...positions];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const next = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
      }
      // Spread the burst across the title without a left-to-right sweep.
      const selected = shuffled.slice(0, 9);
      const slots = Object.fromEntries(
        selected.map((index, order) => {
          let symbolIndex = Math.floor(Math.random() * alphabet.length);
          const symbols = Array.from({ length: 2 }, () => {
            symbolIndex = (symbolIndex + 1 + Math.floor(Math.random() * (alphabet.length - 1))) % alphabet.length;
            return alphabet[symbolIndex];
          });
          return [index, { symbols, delay: Math.floor(order / 3) * 140 }];
        })
      );
      setBurst((last) => ({ revision: last.revision + 1, slots }));
      timer = setTimeout(() => {
        clear();
        if (active()) timer = setTimeout(animate, 1800 + Math.random() * 1200);
      }, 690);
    };
    const restart = () => {
      clearTimeout(timer);
      clear();
      if (active()) timer = setTimeout(animate, 700 + Math.random() * 500);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      restart();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    forced.addEventListener("change", restart);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
      forced.removeEventListener("change", restart);
    };
  }, []);

  return (
    <span ref={root} className={styles.title} data-tone={tone}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={styles.characters}>
        {Array.from(label).map((letter, index) => {
          const slot = burst.slots[index];
          return (
            <span key={index} className={styles.slot} data-active={!!slot}>
              <span className={styles.original}>{letter}</span>
              {slot && (
                <span
                  key={burst.revision}
                  className={styles.reel}
                  style={{ "--cipher-delay": `${slot.delay}ms` } as CSSProperties}
                >
                  {[letter, ...slot.symbols, letter].map((glyph, step) => (
                    <span key={step} className={step > 0 && step <= slot.symbols.length ? styles.encoded : undefined}>
                      {step > 0 && step <= slot.symbols.length ? <PixelGlyph glyph={glyph} /> : glyph}
                    </span>
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}
