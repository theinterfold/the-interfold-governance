/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  transpilePackages: ["@aragon/ods"],
  // The Aztec prover (bb.js) needs SharedArrayBuffer, which browsers give only to cross-origin isolated pages.
  // vercel.json sends these two headers in production; this serves them from `next dev` and `next start` too.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  webpack: (config, { isServer, webpack }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // The Aztec stack (`@crisp-e3/aztec`, `@aztec-labs/*`) is imported only with `import()` from browser code, and needs
    // wasm, workers and OPFS. The server never runs it, so it is left out of the server bundle instead of compiled for it.
    if (isServer) {
      config.externals.push(({ request }, callback) =>
        /^(@aztec-labs\/|@crisp-e3\/aztec$)/.test(request ?? "") ? callback(null, `commonjs ${request}`) : callback()
      );
    }

    // The Aztec packages load their wasm as modules and use top-level await.
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };

    // The Aztec packages load a contract artifact with `const { default: json } = await import("….json")`. The webpack
    // of this Next version empties a JSON module that is read that way, so the PXE fails with "Contract's public
    // bytecode has not been transpiled". As CommonJS modules the artifacts stay whole.
    config.module.rules.push({
      test: /\.json$/,
      include: /[\\/]@aztec-labs[\\/][^\\/]+[\\/]artifacts[\\/]/,
      type: "javascript/auto",
      use: require.resolve("./scripts/json-as-commonjs.cjs"),
    });

    // `@interfold/sdk` guards a Node-only circuit sanity check behind `await import("fs")`.
    // Webpack still resolves that import statically when bundling for the browser, where the
    // branch never runs — stub the Node builtins so the client build does not fail on it.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        url: false,
        // Node-only paths of the Aztec packages (an SSH-agent account, a test port allocator) that the browser never runs.
        net: false,
        tls: false,
        child_process: false,
        dns: false,
      };
      // The Aztec packages read the Node `Buffer` global.
      config.plugins.push(new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }));
    }

    // Opt-in memory cache keeps constrained local review environments usable.
    if (process.env.GOVERNANCE_MEMORY_CACHE === "1") config.cache = { type: "memory" };

    return config;
  },
};

// The main Interfold Markdown owns the palette; validate it before loading the app.
const { syncDesign, watchDesign } = require("./scripts/sync-design.cjs");
module.exports = (phase) => {
  syncDesign();
  if (phase === "phase-development-server") watchDesign();
  return nextConfig;
};
