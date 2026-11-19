import limits from "./photo-limits.json";

export async function compressItemPhoto(file: File): Promise<File> {
  if (file.size <= limits.maxBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
      element.src = url;
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || !longestSide) throw new Error("사진을 읽을 수 없습니다.");

    // Draw from the original at every size to avoid repeated resampling.
    for (let edge = Math.min(longestSide, limits.maxEdge); edge >= 1; edge = Math.floor(edge * 0.8)) {
      const scale = edge / longestSide;
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.68]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob) throw new Error("사진 압축에 실패했습니다.");
        // Browsers without a WebP encoder return PNG.
        if (blob.size <= limits.maxBytes) {
          const extension = blob.type === "image/png" ? "png" : "webp";
          const name = file.name.replace(/\.[^.]+$/, "") || "item-photo";
          return new File([blob], `${name}.${extension}`, { type: blob.type, lastModified: file.lastModified });
        }
        if (blob.type === "image/png") break;
      }
    }
    throw new Error("사진을 250KB 이하로 압축하지 못했습니다.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
