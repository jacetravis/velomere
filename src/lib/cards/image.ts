const DATA_URL_LIMIT = 180_000;

function draw(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

export async function fileToDataUrl(file: File, max = 640): Promise<string> {
  if (file.type.includes("svg") || file.name.toLowerCase().endsWith(".svg")) {
    const text = await file.text();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const fitted = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * fitted));
    let height = Math.max(1, Math.round(bitmap.height * fitted));
    let canvas = draw(bitmap, width, height);
    let quality = 0.74;
    let url = canvas.toDataURL("image/jpeg", quality);
    for (let pass = 0; pass < 8 && url.length > DATA_URL_LIMIT; pass += 1) {
      if (quality > 0.46) {
        quality = Math.round((quality - 0.08) * 100) / 100;
        url = canvas.toDataURL("image/jpeg", quality);
        continue;
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
      canvas = draw(bitmap, width, height);
      quality = 0.66;
      url = canvas.toDataURL("image/jpeg", quality);
    }
    return url;
  } finally {
    bitmap.close?.();
  }
}

/** Deck export wants a bitmap. The faces are drawn as SVG, so flatten those to PNG. */
export function svgToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/svg+xml" }));
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => {
      try {
        const width = image.naturalWidth || 700;
        const height = image.naturalHeight || 1150;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not draw that image.");
        ctx.drawImage(image, 0, 0, width, height);
        const png = canvas.toDataURL("image/png");
        const binary = atob(png.slice(png.indexOf(",") + 1));
        const out = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
        resolve(out);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not draw that image."));
    };
    image.src = url;
  });
}

/** Shrink a picture already stored on the phone so a save can send it. Paths are left alone. */
export async function shrinkDataUrl(url: string, max = 640): Promise<string> {
  if (!url.startsWith("data:image/") || url.length <= DATA_URL_LIMIT) return url;
  const blob = await (await fetch(url)).blob();
  return fileToDataUrl(new File([blob], "picture.jpg", { type: blob.type || "image/jpeg" }), max);
}
