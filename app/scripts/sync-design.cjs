const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const appRoot = path.resolve(__dirname, "..");
const source = process.env.INTERFOLD_DESIGN_SOURCE || path.resolve(appRoot, "../../Interfold-Website/DESIGN.md");
const output = path.join(appRoot, "vendor/interfold-design");
const colors = [
  "ink",
  "paper",
  "muted",
  "muted-secondary",
  "brand-mint",
  "brand-mint-pale",
  "brand-mint-line",
  "brand-mint-shade",
  "brand-green",
  "surface-muted",
  "surface-selected",
  "surface-hover",
  "action-hover",
  "negative",
  "abstain",
];
const lengths = [
  "radius",
  "space-tight",
  "space-related",
  "space-controls",
  "space-section",
  "action-height",
  "action-compact-height",
];
const percentages = ["stroke-mix", "stroke-hover-mix", "page-ground-mix", "page-ground-shade-mix"];
const fonts = ["font-sans", "font-serif", "font-mono"];
const keys = [
  ...colors,
  ...lengths,
  ...percentages,
  ...fonts,
  "action-padding",
  "ui-duration",
  "page-duration",
  "ui-ease",
  "page-ease",
];
function renderDesign(markdown) {
  const match = markdown.match(/```json interfold-tokens\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error("Missing interfold-tokens JSON block in DESIGN.md");
  const data = JSON.parse(match[1]);
  if (data.schemaVersion !== 1 || !data.tokens || Object.keys(data.tokens).length !== keys.length)
    throw new Error("Invalid design schema or token count");
  for (const key of keys) {
    const value = data.tokens[key];
    let valid = typeof value === "string";
    if (colors.includes(key)) valid &&= /^#[0-9a-f]{6}$/i.test(value);
    else if (lengths.includes(key)) valid &&= /^\d+(\.\d+)?px$/.test(value);
    else if (percentages.includes(key)) valid &&= /^\d+(\.\d+)?%$/.test(value) && parseFloat(value) <= 100;
    else if (fonts.includes(key)) valid &&= /^[a-zA-Z0-9" ,\-]+$/.test(value);
    else if (key.endsWith("duration")) valid &&= /^\d+ms$/.test(value);
    else if (key.endsWith("ease")) valid &&= /^cubic-bezier\((?:[\d.]+,\s*){3}[\d.]+\)$/.test(value);
    else valid &&= /^\d+px \d+px$/.test(value);
    if (!valid) throw new Error(`Invalid or missing design token: ${key}`);
  }
  const hash = crypto.createHash("sha256").update(markdown).digest("hex");
  return `/* Generated from Interfold-Website/DESIGN.md. Do not edit.\n   Source SHA256: ${hash} */\n:root {\n${keys
    .map((key) => `  --if-${key}: ${data.tokens[key]};`)
    .concat(
      colors.map(
        (key) =>
          `  --if-${key}-rgb: ${data.tokens[key]
            .slice(1)
            .match(/../g)
            .map((hex) => parseInt(hex, 16))
            .join(" ")};`
      )
    )
    .join("\n")}\n}\n`;
}
function syncDesign({ check = false } = {}) {
  const canonicalExists = fs.existsSync(source);
  if (!canonicalExists && process.env.INTERFOLD_DESIGN_SOURCE) throw new Error(`Design source not found: ${source}`);
  const markdown = fs.readFileSync(canonicalExists ? source : path.join(output, "DESIGN.md"), "utf8");
  const css = renderDesign(markdown);
  if (!canonicalExists)
    console.info("[design] Using the versioned Interfold design snapshot (sibling source unavailable).");
  for (const [name, content] of [
    ["tokens.css", css],
    ["DESIGN.md", markdown],
  ]) {
    const destination = path.join(output, name);
    const old = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
    if (old === content) continue;
    if (check) throw new Error(`Stale design distribution: ${name}. Run bun run design:sync.`);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(destination, content);
  }
}
function watchDesign() {
  const marker = Symbol.for("interfold.design.watcher");
  if (globalThis[marker] || !fs.existsSync(source)) return;
  let timer;
  const watcher = fs.watch(path.dirname(source), (_, filename) => {
    if (filename && filename.toString() !== path.basename(source)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        syncDesign();
      } catch (error) {
        console.error("[design]", error.message);
      }
    }, 100);
  });
  watcher.unref();
  globalThis[marker] = watcher;
}
module.exports = { renderDesign, syncDesign, watchDesign };
if (require.main === module) syncDesign({ check: process.argv.includes("--check") });
