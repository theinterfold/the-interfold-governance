const fs = require("node:fs");
const path = require("node:path");
module.exports = function checkHeader() {
  const app = path.resolve(__dirname, "..");
  const config = path.resolve(app, "../.interfold-header.local.json");
  let website = process.env.INTERFOLD_HEADER_SOURCE;
  if (!website && fs.existsSync(config)) {
    website = path.resolve(path.dirname(config), JSON.parse(fs.readFileSync(config, "utf8")).websiteRoot);
  }
  require("../vendor/site-header/verify.cjs").verifyHeader({
    releaseRoot: path.join(app, "vendor/site-header"),
    assetsRoot: path.join(app, "public/brand"),
    sourceRoot: website ? path.join(website, "packages/site-header") : undefined,
  });
};
