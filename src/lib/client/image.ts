// Browser-only helpers for image uploads from the admin.

/** Compress an image to WebP (max `maxWidth` px wide) before upload. GIFs pass through. */
export async function toWebP(file: File, maxWidth = 2000, quality = 0.82): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/webp", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface UploadedImage {
  url: string;
  key: string | null;
  width: number | null;
  height: number | null;
}

/** Natural size of an image blob (null if the browser can't decode it). */
async function measure(blob: Blob): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Compress, upload and record an image in the photo library. Throws with a readable message. */
export async function uploadImageFull(file: File, maxWidth?: number): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error(`“${file.name}” is not a picture.`);
  const blob = await toWebP(file, maxWidth);
  const type = blob.type || "image/webp";
  const ext = type.split("/")[1] ?? "webp";
  const size = await measure(blob);
  const fd = new FormData();
  fd.append("file", new File([blob], `image.${ext}`, { type }));
  if (size) {
    fd.append("width", String(size.width));
    fd.append("height", String(size.height));
  }
  // A readable default description from the file name ("IMG_2041" is dropped).
  const base = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (base && !/^(img|dsc|pxl|image|photo|screenshot)\b/i.test(base) && !/^\d+$/.test(base)) fd.append("alt", base);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; key?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return { url: data.url, key: data.key ?? null, width: size?.width ?? null, height: size?.height ?? null };
}

/** Compress and upload an image; resolves to its site URL or throws with a readable message. */
export async function uploadImage(file: File, maxWidth?: number): Promise<string> {
  return (await uploadImageFull(file, maxWidth)).url;
}
