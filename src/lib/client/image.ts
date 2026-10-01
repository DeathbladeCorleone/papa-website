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

/** Compress and upload an image; resolves to its site URL or throws with a readable message. */
export async function uploadImage(file: File, maxWidth?: number): Promise<string> {
  const blob = await toWebP(file, maxWidth);
  const type = blob.type || "image/webp";
  const ext = type.split("/")[1] ?? "webp";
  const fd = new FormData();
  fd.append("file", new File([blob], `image.${ext}`, { type }));
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return data.url;
}
