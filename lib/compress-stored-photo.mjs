import sharp from "sharp";
import limits from "./photo-limits.json" with { type: "json" };

/** Convert an oversized photo into a WebP whose actual encoded bytes fit the storage limit. */
export async function compressStoredPhoto(input) {
  const source = sharp(input).rotate();
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("JPG, PNG, WEBP 이미지만 사용할 수 있습니다.");
  }
  const longestSide = Math.max(metadata.width, metadata.height);
  for (let edge = Math.min(longestSide, limits.maxEdge); edge >= 1; edge = Math.floor(edge * 0.8)) {
    for (const quality of [82, 68]) {
      const result = await source.clone()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (result.length <= limits.maxBytes) return result;
    }
  }
  throw new Error("사진을 250KB 이하로 압축하지 못했습니다.");
}
