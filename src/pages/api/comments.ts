import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";
import { validateComment } from "@/lib/domain/comments";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const postId = String(form.get("post_id") ?? "");
  const parentId = (form.get("parent_id") ? String(form.get("parent_id")) : "") || null;

  const result = validateComment({
    authorName: String(form.get("author_name") ?? ""),
    authorEmail: String(form.get("author_email") ?? ""),
    body: String(form.get("body") ?? ""),
    parentId,
    honeypot: String(form.get("website") ?? ""),
  });

  const repo = repoFrom(locals);
  const post = postId ? await repo.getPostById(postId).catch(() => null) : null;
  const back = post ? `/blog/${post.slug}` : "/";

  // Honeypot hit or invalid: pretend success to bots / bounce humans gently.
  if (!result.ok) {
    const filledHoneypot = String(form.get("website") ?? "").trim() !== "";
    const status = filledHoneypot ? "pending" : "error";
    return redirectTo(`${back}?comment=${status}#comments`);
  }
  if (!post) return redirectTo(`/?comment=error`);

  try {
    await repo.createComment({
      postId: post.id,
      parentId: result.value.parentId,
      authorName: result.value.authorName,
      authorEmail: result.value.authorEmail,
      body: result.value.body,
    });
    return redirectTo(`${back}?comment=pending#comments`);
  } catch {
    return redirectTo(`${back}?comment=error#comments`);
  }
};

function redirectTo(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
