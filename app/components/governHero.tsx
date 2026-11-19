import { useEffect, useRef } from "react";
import Head from "next/head";
import { governPrewarmScript } from "@/motion/govern/prewarm";
import { GOVERN_HYDRATION_GATE } from "@/motion/govern/hydration-gate";
import styles from "./governHero.module.css";
import motionManifest from "@/public/govern-compact/manifest.json";

const motionQuery = `?v=${motionManifest.version}`;
const motionBootUrl = `/govern-compact/boot.js${motionQuery}`;
const GOVERN_HERO_PREWARM = governPrewarmScript(motionQuery);
const motionRendererUrl = `/govern-compact/renderer.js${motionQuery}`;

export function GovernHeroArtwork() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let instance: { dispose: () => void } | undefined;
    // Same browser module instance as the early HTML script. No duplicate worker.
    const url = motionBootUrl;
    void import(/* webpackIgnore: true */ url).then((module) => {
      if (!cancelled && root.current) instance = module.mountHero(root.current);
    });
    return () => { cancelled = true; instance?.dispose(); };
  }, []);

  return (
    <>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: GOVERN_HYDRATION_GATE }} />
        <script dangerouslySetInnerHTML={{ __html: GOVERN_HERO_PREWARM }} />
        <script type="module" async={true} src={motionBootUrl} />
        <link rel="preload" href="/govern-compact/points.bin.gz" as="fetch" crossOrigin="anonymous" fetchPriority="high" />
        <link rel="preload" href="/govern-compact/geometry.json" as="fetch" crossOrigin="anonymous" />
        <link rel="modulepreload" href={motionRendererUrl} crossOrigin="anonymous" />
      </Head>
      <div ref={root} data-govern-hero="" className={styles.controller} suppressHydrationWarning>
        <div className={styles.art} data-art="" aria-hidden="true" suppressHydrationWarning>
          <canvas suppressHydrationWarning />
        </div>
      </div>
    </>
  );
}
