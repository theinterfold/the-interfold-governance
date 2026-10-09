// Reuse the original Pontilhismo card generator; export static illustrations.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { FIELD_WIDTH, FIELD_HEIGHT, blurField, buildParticles } from "./card-particles.mjs";

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE || "sharp");
const images = fileURLToPath(new URL("../../public/images/", import.meta.url));
const ink = [18, 23, 24];
const luma = (r, g, b) => r * .2126 + g * .7152 + b * .0722;
const inkLuma = luma(...ink);
for (const [index, name] of ["get-fold", "activate-voting-power", "govern"].entries()) {
  const { data } = await sharp(`${images}${name}.webp`)
    .resize(FIELD_WIDTH, FIELD_HEIGHT, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let paper = 0;
  for (let x = 0; x < FIELD_WIDTH; x++) paper += luma(data[x*3], data[x*3+1], data[x*3+2]);
  paper /= FIELD_WIDTH;
  const field = new Float32Array(FIELD_WIDTH * FIELD_HEIGHT);
  for (let i = 0; i < field.length; i++) {
    // Strip the mint paper colour, retaining only the artwork's tonal density.
    const darkness = (paper - luma(data[i*3], data[i*3+1], data[i*3+2])) / (paper - inkLuma);
    field[i] = Math.max(0, Math.min(1, darkness));
  }
  const points = buildParticles(blurField(field), 31 + index * 20, { detectCores: false });
  const paths = [];
  for (let i = 0; i < points.count; i++) {
    const x = points.home[i*2], y = points.home[i*2+1], r = points.sizes[i] / 2;
    paths.push(`M${(x-r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r*2).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-r*2).toFixed(2)} 0`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675" viewBox="0 0 600 450"><path fill="#121718" d="${paths.join("")}"/></svg>`;
  await sharp(Buffer.from(svg)).webp({ lossless: true }).toFile(`${images}${name}-pointillism.webp`);
  await writeFile(`${images}${name}-pointillism.svg`, svg);
  console.log(`${name}: ${points.count} independent dots`);
}
