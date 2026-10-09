import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./cipherTitle.module.css";

// Thin letters and spaces stay still, so each glyph keeps its original width.
const STILL = /[\s.,:;'!|iIjl]/;
const ALPHABET = "01#<>/";
type CipherSlot = { symbols: string[]; delay: number };

// A tiny bitmap alphabet keeps the burst visibly pixelated at the title size.
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

/**
 * A title that briefly encodes itself while it is on screen: three groups of three letters each
 * show two pixel symbols, at different moments, then a clear pause. The accessible name stays the
 * label. Reduced motion and forced colors keep the plain title.
 */
export function CipherTitle({ label }: { label: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [burst, setBurst] = useState<{ revision: number; slots: Record<number, CipherSlot> }>({
    revision: 0,
    slots: {},
  });

  useEffect(() => {
    const positions = Array.from(label).flatMap((letter, index) => (STILL.test(letter) ? [] : [index]));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forced = window.matchMedia("(forced-colors: active)");
    let timer: number | undefined;
    let visible = false;
    const active = () => visible && !document.hidden && !reduced.matches && !forced.matches;
    const clear = () => setBurst((last) => (Object.keys(last.slots).length ? { ...last, slots: {} } : last));
    const animate = () => {
      if (!active()) return;
      const shuffled = [...positions];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const next = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
      }
      // Spread the burst across the title without a left-to-right sweep.
      const slots = Object.fromEntries(
        shuffled.slice(0, 9).map((index, order) => {
          let symbolIndex = Math.floor(Math.random() * ALPHABET.length);
          const symbols = Array.from({ length: 2 }, () => {
            symbolIndex = (symbolIndex + 1 + Math.floor(Math.random() * (ALPHABET.length - 1))) % ALPHABET.length;
            return ALPHABET[symbolIndex];
          });
          return [index, { symbols, delay: Math.floor(order / 3) * 140 }];
        })
      );
      setBurst((last) => ({ revision: last.revision + 1, slots }));
      timer = window.setTimeout(() => {
        clear();
        if (active()) timer = window.setTimeout(animate, 1800 + Math.random() * 1200);
      }, 690);
    };
    const restart = () => {
      window.clearTimeout(timer);
      clear();
      if (active()) timer = window.setTimeout(animate, 700 + Math.random() * 500);
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
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
      forced.removeEventListener("change", restart);
    };
  }, [label]);

  return (
    <span ref={root} className={styles.title}>
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
                  {[letter, ...slot.symbols, letter].map((glyph, step) =>
                    step > 0 && step <= slot.symbols.length ? (
                      <span key={step} className={styles.encoded}>
                        <PixelGlyph glyph={glyph} />
                      </span>
                    ) : (
                      <span key={step}>{glyph}</span>
                    )
                  )}
                </span>
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}
