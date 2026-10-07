const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderDesign } = require("../scripts/sync-design.cjs");
const markdown = fs.readFileSync(path.resolve(__dirname, "../vendor/interfold-design/DESIGN.md"), "utf8");
test("editable source controls CSS values and ODS RGB channels", () => {
  const css = renderDesign(markdown.replace('"surface-selected": "#f0f1f1"', '"surface-selected": "#dedede"'));
  assert.match(css, /--if-surface-selected: #dedede;/);
  assert.match(css, /--if-surface-selected-rgb: 222 222 222;/);
  assert.equal(css, renderDesign(markdown.replace('"surface-selected": "#f0f1f1"', '"surface-selected": "#dedede"')));
});
test("missing source block and invalid token values fail rather than silently keeping stale CSS", () => {
  assert.throws(() => renderDesign("No tokens"), /Missing/);
  assert.throws(
    () => renderDesign(markdown.replace('"ink": "#121718"', '"ink": "red; background: url(example)"')),
    /Invalid/
  );
  assert.throws(() => renderDesign(markdown.replace('"radius": "6px"', '"unknown": "6px"')), /Invalid/);
});
