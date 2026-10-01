import type { APIRoute } from "astro";
import { mediaFrom, repoFrom } from "@/lib/context";

export const prerender = false;

const ALLOWED = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 10 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Store an image (already compressed to WebP in the browser) in the R2 `MEDIA`
 * bucket and return its site-relative URL. Without an R2 binding (local
 * preview), returns a data URL so the editor still works.
 */
const dim = (v: FormDataEntryValue | null) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);

  const ext = ALLOWED.get(file.type);
  if (!ext) return json({ error: "Only WebP, JPEG, PNG or GIF images are allowed" }, 415);
  if (file.size > MAX_BYTES) return json({ error: "Image is larger than 10 MB" }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const bucket = mediaFrom(locals);

  if (!bucket) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return json({ url: `data:${file.type};base64,${btoa(bin)}` });
  }

  const key = `posts/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  const url = `/media/${key}`;
  // Record it in the photo library (a failure here must not lose the upload).
  await repoFrom(locals)
    .addMedia({
      key,
      url,
      alt: String(form.get("alt") ?? "").trim().slice(0, 200),
      width: dim(form.get("width")),
      height: dim(form.get("height")),
      bytes: file.size,
      contentType: file.type,
      createdAt: new Date().toISOString(),
    })
    .catch(() => {});
  return json({ url, key });
};
