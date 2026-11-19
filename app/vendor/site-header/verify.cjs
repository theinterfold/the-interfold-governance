const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

function sourceDigest(root) {
  const files = ["README.md"];
  const walk = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(name); else files.push(name);
    }
  };
  walk("src"); walk("assets");
  return sha(files.sort().map(name => name + "\0" + fs.readFileSync(path.join(root, name), "utf8")).join("\0"));
}

function verifyHeader({ releaseRoot, assetsRoot, sourceRoot }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, "manifest.json"), "utf8"));
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (sha(fs.readFileSync(path.join(releaseRoot, name))) !== digest)
      throw Error(`Modified shared header: ${name}. Rebuild and sync the canonical header.`);
  }
  for (const [name, digest] of Object.entries(manifest.assets)) {
    if (sha(fs.readFileSync(path.join(assetsRoot, name))) !== digest)
      throw Error(`Modified shared header asset: ${name}. Rebuild and sync the canonical header.`);
  }
  if (sourceRoot && sourceDigest(sourceRoot) !== manifest.sourceSha256)
    throw Error("Shared header is stale. Run the canonical build-site-header.ts sync before building this app.");
}
module.exports = { sha, sourceDigest, verifyHeader };
