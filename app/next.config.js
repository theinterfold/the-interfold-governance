/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  transpilePackages: ["@aragon/ods"],
  webpack: (config, { isServer }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // `@interfold/sdk` guards a Node-only circuit sanity check behind `await import("fs")`.
    // Webpack still resolves that import statically when bundling for the browser, where the
    // branch never runs — stub the Node builtins so the client build does not fail on it.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        url: false,
      };
    }

    // A patched package keeps its upstream version. Include the patch in the
    // filesystem cache inputs so restored deployments compile its current contents.
    if (config.cache?.type === "filesystem") {
      config.cache.buildDependencies = {
        ...config.cache.buildDependencies,
        walletPatch: [require.resolve("./patches/connectkit-1.9.1-governance.patch")],
      };
    }

    // Opt-in memory cache keeps constrained local review environments usable.
    if (process.env.GOVERNANCE_MEMORY_CACHE === "1") config.cache = { type: "memory" };

    return config;
  },
};

// The main Interfold Markdown owns the palette; validate it before loading the app.
const { syncDesign, watchDesign } = require("./scripts/sync-design.cjs");
module.exports = (phase) => {
  require("./scripts/check-header.cjs")();
  syncDesign();
  if (phase === "phase-development-server") watchDesign();
  return nextConfig;
};
