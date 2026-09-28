import { build, transform } from "esbuild";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postcss from "postcss";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssImport from "postcss-import";
const require = createRequire(import.meta.url);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = "/private/tmp/interfold-lock-review";
await mkdir(path.join(output, "fonts"), { recursive: true });
const fixture = path.join(app, "dev/locks-share/fixtures.tsx");
const aliases = [
  "@/constants",
  "@/hooks/useTokenDecimals",
  "@/hooks/useMemberName",
  "@/hooks/useTokenVotes",
  "@/hooks/useDelegate",
  "@/plugins/members/hooks/useDelegates",
  "@/plugins/members/hooks/useDelegateNames",
  "@/plugins/members/hooks/useDelegateFirstSeen",
];
const result = await build({
  absWorkingDir: app,
  entryPoints: ["dev/locks-share/entry.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(output, "review.js"),
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  sourcemap: false,
  metafile: true,
  jsx: "automatic",
  loader: { ".module.css": "local-css" },
  define: { "process.env.NODE_ENV": '"production"' },
  alias: Object.fromEntries(aliases.map((name) => [name, fixture])),
  plugins: [
    {
      name: "reject-network-clients",
      setup(api) {
        const fixtureModules = new Set(aliases.map((name) => path.join(app, name.slice(2))));
        api.onResolve({ filter: /^\./ }, (args) => {
          const resolved = path.resolve(args.resolveDir, args.path).replace(/\.[tj]sx?$/, "");
          if (fixtureModules.has(resolved)) return { path: fixture };
        });
        api.onResolve({ filter: /^wagmi$/ }, () => ({ path: fixture }));
        api.onResolve({ filter: /^(wagmi\/|@wagmi\/|@web3modal\/|@crisp-e3\/)/ }, (args) => {
          if (args.path === "wagmi/chains") return { path: require.resolve("viem/chains") };
          throw new Error(`Unexpected network-capable dependency: ${args.path}`);
        });
      },
    },
  ],
});
await writeFile("/private/tmp/interfold-lock-review-metafile.json", JSON.stringify(result.metafile));
// This container is defined in global family.css, outside the CSS-module bundle.
// Preserve its shared name; esbuild otherwise scopes the query without its definition.
const reviewCssPath = path.join(output, "review.css");
const reviewCss = await readFile(reviewCssPath, "utf8");
await writeFile(reviewCssPath, reviewCss.replace(/@container lockBarReview_power-card\b/g, "@container power-card"));
const globals = await readFile(path.join(app, "pages/globals.css"), "utf8");
const odsPath = require.resolve("@aragon/ods/index.css");
const ods = await postcss([postcssImport]).process(await readFile(odsPath, "utf8"), { from: odsPath });
const familySource = ods.css.replace(/@tailwind (base|components|utilities);/g, "") + "\n" + globals;
const styles = await postcss([tailwind({ config: path.join(app, "tailwind.config.ts") }), autoprefixer]).process(
  familySource,
  { from: path.join(app, "pages/globals.css") }
);
const header = await readFile(path.join(app, "vendor/site-header/styles.css"), "utf8");
await writeFile(path.join(output, "family.css"), `${styles.css}\n${header}`);
for (const name of ["Manrope-Regular.ttf", "Manrope-SemiBold.ttf"])
  await copyFile(path.join(path.dirname(odsPath), "src/theme/fonts", name), path.join(output, "fonts", name));
const javascriptPath = path.join(output, "review.js");
const compressed = await transform(await readFile(javascriptPath, "utf8"), {
  minify: true,
  target: "es2022",
  format: "esm",
});
await writeFile(javascriptPath, compressed.code);
for (const name of [
  "InterVariable.woff2",
  "InterVariable-Italic.woff2",
  "ABCGramercy-Regular.woff2",
  "OfficeCodePro-Medium.woff2",
  "Inter-LICENSE.txt",
])
  await copyFile(path.join(app, "public/fonts", name), path.join(output, "fonts", name));
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Voting power · A/B review · Interfold</title><meta name="description" content="Compare two lock-management designs with an interactive Lock FOLD demo."><link rel="stylesheet" href="/family.css"><link rel="stylesheet" href="/review.css"></head><body><div id="root"></div><script type="module" src="/review.js"></script></body></html>`
);
await writeFile(
  path.join(output, "vercel.json"),
  JSON.stringify(
    {
      framework: null,
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
            {
              key: "Content-Security-Policy",
              value:
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
            },
          ],
        },
      ],
    },
    null,
    2
  )
);
console.log(`Static review built: ${output}`);
