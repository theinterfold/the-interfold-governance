import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// Build a separate, static demonstration. Never change the application's production guard,
// copy environment files, or upload the working tree. Only `out/` is deployable.
const app = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
createRequire(import.meta.url)(join(app, "scripts/sync-design.cjs")).syncDesign();
const review = await mkdtemp(join(tmpdir(), "interfold-governance-review-"));
const source = join(review, "source");
await mkdir(source);
for (const directory of ["artifacts", "components", "context", "dev", "hooks", "plugins", "public", "utils", "vendor"]) {
  await cp(join(app, directory), join(source, directory), { recursive: true });
}
for (const file of ["constants.ts", "package.json", "tsconfig.json", "next-env.d.ts", "next.config.js", "postcss.config.js", "tailwind.config.ts", ".eslintrc.cjs"]) {
  await cp(join(app, file), join(source, file));
}
await mkdir(join(source, "scripts"));
await cp(join(app, "scripts/sync-design.cjs"), join(source, "scripts/sync-design.cjs"));
await mkdir(join(source, "pages/plugins"), { recursive: true });
for (const file of ["index.tsx", "_app.tsx", "_document.tsx", "globals.css", "plugins/[id].tsx"]) {
  await cp(join(app, "pages", file), join(source, "pages", file));
}
await symlink(await realpath(join(app, "node_modules")), join(source, "node_modules"));

// This adapter exists only in the isolated review build. Wallet operations still use the
// existing address-only fixture connector, request prompts and in-browser simulation.
await writeFile(join(source, "dev/previewMode.ts"), `
export const DESIGN_PREVIEW = true;
export const DEMO_WALLET = "0x2B49CF50c9b1e03fC96A27Ead77419BaF2C3ED0E" as const;
export const DEMO_MESSAGE = "Review demo only. No signature, transaction or upload was sent.";
export function previewAddress(id: number) {
  return \`0x\${id.toString(16).padStart(40, "0")}\` as \`0x\${string}\`;
}
export function requireLocalPreview() {
  if (typeof document !== "undefined" && !document.querySelector('meta[name="interfold-review"]')) {
    throw new Error("This simulation requires the isolated review page.");
  }
}
`);
// The shared demo shows the approved Privacy tools ballot even through old study links.
// Functional ballot variants remain available in local development and production code.
await writeFile(join(source, "dev/useBallotPreviewVariant.ts"), `
export function useBallotPreviewVariant(): "paths" | "separate" | "option" {
  return "paths";
}
`);
const documentPath = join(source, "pages/_document.tsx");
await writeFile(documentPath, (await readFile(documentPath, "utf8")).replace("<Head>", `<Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="interfold-review" content="simulation-only" />`));
const pluginPath = join(source, "pages/plugins/[id].tsx");
await writeFile(pluginPath, (await readFile(pluginPath, "utf8")) + `
export function getStaticPaths() {
  return { paths: ["proposals", "lock"].map(id => ({ params: { id } })), fallback: false };
}
export function getStaticProps() { return { props: {} }; }
`);
const configPath = join(source, "next.config.js");
await writeFile(configPath, (await readFile(configPath, "utf8")) + `
if (typeof module.exports === "function") module.exports = module.exports("phase-production-build");
module.exports.output = "export";
module.exports.images = { unoptimized: true };
module.exports.experimental = { cpus: 2 };
const appWebpack = module.exports.webpack;
module.exports.webpack = (config, context) => {
  config = appWebpack(config, context);
  const reviewWallet = require("node:path").resolve(__dirname, "dev/governance-share/liveWalletUnavailable.ts");
  config.resolve.alias = {
    ...config.resolve.alias,
    "@web3modal/wagmi/react$": reviewWallet,
    "wagmi/connectors$": reviewWallet,
  };
  return config;
};
`);
const result = spawnSync(process.execPath, [join(source, "node_modules/next/dist/bin/next"), "build"], {
  cwd: source,
  stdio: "inherit",
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR || tmpdir(),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    ...(process.env.GOVERNANCE_MEMORY_CACHE === "1" ? { GOVERNANCE_MEMORY_CACHE: "1" } : {}),
    NEXT_PUBLIC_CHAIN_NAME: "mainnet",
    NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK: "1",
    NEXT_PUBLIC_TOKEN_DEPLOYMENT_BLOCK: "1",
    NEXT_PUBLIC_VE_LOCKER_DEPLOYMENT_BLOCK: "1",
  },
});
if (result.status !== 0) process.exit(result.status || 1);
const output = join(source, "out");
await writeFile(join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(join(output, "vercel.json"), JSON.stringify({
  framework: null,
  buildCommand: null,
  installCommand: null,
  outputDirectory: ".",
  trailingSlash: true,
  headers: [{ source: "/(.*)", headers: [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ] }],
}, null, 2));
console.log(`Review output: ${output}`);
