import { buildPointLoopLayers, decodePointCoordinates, type PointIllustrationName } from "./pointLoop";

self.onmessage = ({ data }: MessageEvent<{ buffer: ArrayBuffer; image: PointIllustrationName }>) => {
  try {
    self.postMessage({ layers: buildPointLoopLayers(decodePointCoordinates(data.buffer), data.image) });
  } catch {
    self.postMessage({ error: "Could not prepare illustration" });
  }
};
