import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useRef, useState } from "react";
import { uploadImage as uploadToServer } from "@/lib/client/image";

/** Image node extended with an `align` attribute -> data-align in the HTML. */
const AlignableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        renderHTML: (attrs: { align?: string }) => ({ "data-align": attrs.align ?? "center" }),
        parseHTML: (el: HTMLElement) => el.getAttribute("data-align") ?? "center",
      },
    };
  },
});

interface Props {
  name: string;
  initialHtml?: string;
}

function ToolbarButton(props: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      style={{
        fontFamily: "var(--sans)",
        fontSize: "0.85rem",
        padding: "0.35rem 0.55rem",
        border: "1px solid var(--rule)",
        borderRadius: "5px",
        background: props.active ? "var(--accent)" : "var(--paper-raised)",
        color: props.active ? "#fff" : "var(--ink-soft)",
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

export default function Editor({ name, initialHtml = "" }: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      AlignableImage.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Youtube.configure({ width: 640, height: 360 }),
      Placeholder.configure({ placeholder: "Write your essay…" }),
    ],
    content: initialHtml || "<p></p>",
    onUpdate: ({ editor }: { editor: TiptapEditor }) => setHtml(editor.getHTML()),
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      setBusy(true);
      try {
        const url = await uploadToServer(file, 1600);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setBusy(false);
      }
    },
    [editor],
  );

  const setAlign = (align: string) => {
    editor?.chain().focus().updateAttributes("image", { align }).run();
  };

  if (!editor) return <div className="muted">Loading editor…</div>;

  const btn = (label: string, action: () => void, active = false, title = label) => (
    <ToolbarButton onClick={action} active={active} title={title}>{label}</ToolbarButton>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.3rem",
          flexWrap: "wrap",
          padding: "0.5rem",
          border: "1px solid var(--rule)",
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
          background: "var(--paper)",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), "Bold")}
        {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), "Italic")}
        {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
        {btn("❝", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"), "Quote")}
        {btn("• List", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {btn("1. List", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {btn("＿", () => editor.chain().focus().setHorizontalRule().run(), false, "Divider")}
        {btn("🔗", () => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().setLink({ href: url }).run();
        }, editor.isActive("link"), "Link")}
        {btn(busy ? "…" : "🖼 Image", () => fileRef.current?.click(), false, "Insert image")}
        {btn("▶ YouTube", () => {
          const url = window.prompt("YouTube URL");
          if (url) editor.commands.setYoutubeVideo({ src: url });
        }, false, "Embed YouTube")}
        <span style={{ width: 1, background: "var(--rule)", margin: "0 0.2rem" }} />
        {btn("⯇", () => setAlign("left"), false, "Align image left")}
        {btn("▣", () => setAlign("center"), false, "Center image")}
        {btn("⯈", () => setAlign("right"), false, "Align image right")}
        {btn("⛶", () => setAlign("full"), false, "Full width image")}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />

      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: "0 0 6px 6px",
          padding: "1rem 1.25rem",
          background: "var(--paper-raised)",
          minHeight: "24rem",
        }}
        className="prose"
      >
        <EditorContent editor={editor} />
      </div>

      <input type="hidden" name={name} value={html} />
    </div>
  );
}
