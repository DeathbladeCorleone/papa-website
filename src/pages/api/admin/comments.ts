import type { APIRoute } from "astro";
import { repoFrom } from "@/lib/context";

export const prerender = false;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const repo = repoFrom(locals);
  const form = await request.formData();
  const action = String(form.get("_action") ?? "");
  const id = String(form.get("id") ?? "");
  const back = String(form.get("return_to") ?? "/admin/comments");

  switch (action) {
    case "approve":
      if (id) await repo.setCommentStatus(id, "approved");
      break;
    case "spam":
      if (id) await repo.setCommentStatus(id, "spam");
      break;
    case "delete":
      if (id) await repo.deleteComment(id);
      break;
    case "reply": {
      const postId = String(form.get("post_id") ?? "");
      const parentId = String(form.get("parent_id") ?? "") || null;
      const body = String(form.get("body") ?? "").trim();
      const settings = await repo.getSettings();
      if (postId && body) {
        // Approve the comment being replied to so the whole thread goes public.
        if (parentId) await repo.setCommentStatus(parentId, "approved");
        await repo.createComment({
          postId,
          parentId,
          authorName: settings.authorName,
          authorEmail: "author@local",
          body,
          isAuthor: true,
        });
      }
      break;
    }
  }
  return redirect(back);
};
