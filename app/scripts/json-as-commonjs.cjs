// Webpack loader: a JSON file as a CommonJS module, which webpack does not tree-shake. See `next.config.js`.
module.exports = (source) => `module.exports = JSON.parse(${JSON.stringify(source)});`;
