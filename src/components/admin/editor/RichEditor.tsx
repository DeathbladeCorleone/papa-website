import { BubbleMenu, EditorContent, FloatingMenu, useEditor, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { IconName } from "../icons";
import { editorExtensions, youtubeId, type GalleryImage, type PickOptions, type UiBridgeStorage } from "./extensions";
import { MediaPicker } from "./MediaPicker";
import { uploadImageFull } from "@/lib/client/image";

export interface EditorStats { words: number; minutes: number }

interface Props {
  initialHtml: string;
  placeholder?: string;
  onChange: (html: string) => void;
  onStats?: (s: EditorStats) => void;
  /** Number of pictures still uploading (saving waits for them). */
  onBusy?: (n: number) => void;
  onReady?: (editor: Editor) => void;
}

interface SlashItem {
  key: string;
  label: string;
  hint: string;
  icon: IconName;
  words: string;
  run: (e: Editor) => void;
}

type PickerState = { opts: PickOptions; resolve: (v: GalleryImage[] | null) => void } | null;

export function RichEditor({ initialHtml, placeholder = "Begin writing…", onChange, onStats, onBusy, onReady }: Props) {
  const [picker, setPicker] = useState<PickerState>(null);
  const [videoAsk, setVideoAsk] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [slash, setSlash] = useState<{ query: string; from: number; to: number; top: number; left: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [, force] = useState(0);
  const busy = useRef(0);
  const slashRef = useRef<{ open: boolean; items: SlashItem[]; index: number; choose: (i: number) => void }>({ open: false, items: [], index: 0, choose: () => {} });

  const setBusy = (d: number) => {
    busy.current += d;
    onBusy?.(busy.current);
  };

  /** Upload dropped/pasted files: show them immediately, swap in the real URL when done. */
  const uploadInto = useCallback(async (editor: Editor, files: File[], pos?: number) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const placeholders = imgs.map((f) => ({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) }));
    const content = placeholders.map((p) => ({ type: "figure", attrs: { src: p.preview, alt: "", uploadId: p.id, align: "center", size: "l" } }));
    const chain = editor.chain().focus();
    if (typeof pos === "number") chain.insertContentAt(pos, content).run();
    else chain.insertContent(content).run();
    setBusy(placeholders.length);
    for (const p of placeholders) {
      try {
        const up = await uploadImageFull(p.file);
        replaceUpload(editor, p.id, { src: up.url, uploadId: null });
      } catch (err) {
        replaceUpload(editor, p.id, null);
        window.alert(`That picture could not be uploaded: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        URL.revokeObjectURL(p.preview);
        setBusy(-1);
      }
    }
  }, []);

  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content: initialHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "prose ed-prose", spellcheck: "true" },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (editorRef.current) void uploadInto(editorRef.current, files, at?.pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        if (editorRef.current) void uploadInto(editorRef.current, files);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current;
        if (!s.open || !s.items.length) return false;
        if (event.key === "ArrowDown") { setSlashIndex((i) => (i + 1) % s.items.length); return true; }
        if (event.key === "ArrowUp") { setSlashIndex((i) => (i - 1 + s.items.length) % s.items.length); return true; }
        if (event.key === "Enter" || event.key === "Tab") { s.choose(s.index); return true; }
        if (event.key === "Escape") { setSlash(null); return true; }
        return false;
      },
    },
    onCreate: ({ editor }) => {
      report(editor);
      onReady?.(editor as Editor);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      report(editor);
      detectSlash(editor as Editor);
    },
    onSelectionUpdate: ({ editor }) => detectSlash(editor as Editor),
    onTransaction: () => force((n) => n + 1),
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  function report(e: { storage: Record<string, any> }) {
    const words = e.storage.characterCount?.words?.() ?? 0;
    onStats?.({ words, minutes: Math.max(1, Math.round(words / 220)) });
  }

  /** Open the insert menu when a paragraph holds only "/" + optional search text. */
  function detectSlash(e: Editor) {
    const { selection } = e.state;
    const $from = selection.$from;
    if (!selection.empty || $from.parent.type.name !== "paragraph" || $from.depth > 2) return setSlash(null);
    const text = $from.parent.textContent;
    const m = /^\/([\p{L}\s]{0,20})$/u.exec(text);
    if (!m || $from.parentOffset !== text.length) return setSlash(null);
    const coords = e.view.coordsAtPos($from.pos);
    const host = e.view.dom.getBoundingClientRect();
    setSlash((cur) => {
      if (!cur || cur.query !== m[1]) setSlashIndex(0);
      return { query: m[1].trim().toLowerCase(), from: $from.start(), to: $from.pos, top: coords.bottom - host.top + 8, left: coords.left - host.left };
    });
  }

  // Photo picker shared with node views (Replace / Add pictures).
  useEffect(() => {
    if (!editor) return;
    (editor.storage.uiBridge as UiBridgeStorage).pickImages = (opts) =>
      new Promise((resolve) => setPicker({ opts: opts ?? {}, resolve }));
  }, [editor]);

  const pick = (opts: PickOptions) =>
    new Promise<GalleryImage[] | null>((resolve) => setPicker({ opts, resolve }));

  const insertPicture = async (e: Editor) => {
    const imgs = await pick({ title: "Add a picture" });
    if (imgs?.[0]) e.chain().focus().insertFigure({ src: imgs[0].src, alt: imgs[0].alt }).run();
  };
  const insertGallery = async (e: Editor) => {
    const imgs = await pick({ multiple: true, title: "Make a gallery" });
    if (imgs?.length) e.chain().focus().insertGallery({ images: imgs }).run();
  };
  const insertTable = (e: Editor) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

  const slashItems: SlashItem[] = useMemo(
    () => [
      { key: "p", label: "Plain text", hint: "Ordinary paragraph", icon: "paragraph", words: "text paragraph normal", run: (e) => e.chain().focus().setParagraph().run() },
      { key: "h2", label: "Heading", hint: "A big section title", icon: "h2", words: "heading title h2 section", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
      { key: "h3", label: "Subheading", hint: "A smaller title", icon: "h3", words: "subheading h3 small title", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
      { key: "img", label: "Picture", hint: "Upload or choose a photo", icon: "image", words: "picture photo image upload", run: (e) => void insertPicture(e) },
      { key: "gal", label: "Gallery", hint: "Several photos in a grid", icon: "images", words: "gallery photos pictures grid album", run: (e) => void insertGallery(e) },
      { key: "q", label: "Quote", hint: "Words from someone, set apart", icon: "quote", words: "quote quotation blockquote", run: (e) => e.chain().focus().setBlockquote().run() },
      { key: "note", label: "Note box", hint: "A highlighted box for an aside", icon: "callout", words: "note callout box aside tip", run: (e) => e.chain().focus().toggleCallout().run() },
      { key: "ul", label: "Bulleted list", hint: "• Simple list", icon: "ul", words: "bullet list unordered", run: (e) => e.chain().focus().toggleBulletList().run() },
      { key: "ol", label: "Numbered list", hint: "1. 2. 3.", icon: "ol", words: "numbered list ordered steps", run: (e) => e.chain().focus().toggleOrderedList().run() },
      { key: "yt", label: "YouTube video", hint: "Paste a YouTube link", icon: "video", words: "video youtube embed", run: () => setVideoAsk(true) },
      { key: "tbl", label: "Table", hint: "Rows and columns", icon: "table", words: "table grid rows columns", run: (e) => insertTable(e) },
      { key: "hr", label: "Divider line", hint: "A quiet break between parts", icon: "divider", words: "divider line separator break hr", run: (e) => e.chain().focus().setHorizontalRule().run() },
    ],
    [],
  );
  const filtered = slash
    ? slashItems.filter((i) => !slash.query || i.label.toLowerCase().includes(slash.query) || i.words.includes(slash.query))
    : [];
  const chooseSlash = (i: number) => {
    const item = filtered[i];
    if (!editor || !slash || !item) return;
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
    setSlash(null);
    item.run(editor);
  };
  slashRef.current = { open: Boolean(slash), items: filtered, index: Math.min(slashIndex, Math.max(0, filtered.length - 1)), choose: chooseSlash };

  if (!editor) return <div className="ed-loading">Opening the editor…</div>;
  const e = editor;

  const blockStyle = e.isActive("heading", { level: 2 }) ? "h2"
    : e.isActive("heading", { level: 3 }) ? "h3"
    : e.isActive("callout") ? "note"
    : e.isActive("blockquote") ? "quote" : "p";
  const setBlockStyle = (v: string) => {
    const c = e.chain().focus();
    if (e.isActive("callout") && v !== "note") c.lift("callout");
    if (e.isActive("blockquote") && v !== "quote") c.lift("blockquote");
    if (v === "p") c.setParagraph().run();
    else if (v === "h2") c.setHeading({ level: 2 }).run();
    else if (v === "h3") c.setHeading({ level: 3 }).run();
    else if (v === "quote") c.setParagraph().setBlockquote().run();
    else if (v === "note") c.setParagraph().toggleCallout().run();
  };

  const tb = (icon: IconName, label: string, run: () => void, active = false, disabled = false) => (
    <button type="button" className={`ed-tb${active ? " on" : ""}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(ev) => ev.preventDefault()} onClick={run}>
      <Icon name={icon} size={18} />
    </button>
  );
  const tbText = (icon: IconName, label: string, run: () => void) => (
    <button type="button" className="ed-tb txt" title={label} onMouseDown={(ev) => ev.preventDefault()} onClick={run}>
      <Icon name={icon} size={17} /> <span>{label}</span>
    </button>
  );

  const inTable = e.isActive("table");
  const textSelection = !e.state.selection.empty && !(e.state.selection instanceof NodeSelection);

  return (
    <div className="ed-root">
      <div className="ed-toolbar" role="toolbar" aria-label="Formatting">
        <select className="ed-style" value={blockStyle} onChange={(ev) => setBlockStyle(ev.target.value)} aria-label="Paragraph style">
          <option value="p">Text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="quote">Quote</option>
          <option value="note">Note box</option>
        </select>
        <span className="ed-sep" />
        {tb("bold", "Bold (Ctrl+B)", () => e.chain().focus().toggleBold().run(), e.isActive("bold"))}
        {tb("italic", "Italic (Ctrl+I)", () => e.chain().focus().toggleItalic().run(), e.isActive("italic"))}
        {tb("underline", "Underline (Ctrl+U)", () => e.chain().focus().toggleUnderline().run(), e.isActive("underline"))}
        {tb("highlight", "Highlight", () => e.chain().focus().toggleHighlight().run(), e.isActive("highlight"))}
        {tb("link", "Link", () => { if (e.state.selection.empty && !e.isActive("link")) { window.alert("First select the words you want to turn into a link."); return; } setLinkEditing(true); }, e.isActive("link"))}
        <span className="ed-sep" />
        {tb("ul", "Bulleted list", () => e.chain().focus().toggleBulletList().run(), e.isActive("bulletList"))}
        {tb("ol", "Numbered list", () => e.chain().focus().toggleOrderedList().run(), e.isActive("orderedList"))}
        {tb("quote", "Quote", () => e.chain().focus().toggleBlockquote().run(), e.isActive("blockquote"))}
        <span className="ed-sep" />
        {tbText("image", "Picture", () => void insertPicture(e))}
        {tb("images", "Gallery (several pictures)", () => void insertGallery(e))}
        {tb("video", "YouTube video", () => setVideoAsk(true))}
        {tb("table", "Table", () => insertTable(e), false, inTable)}
        <span className="ed-grow" />
        {tb("undo", "Undo (Ctrl+Z)", () => e.chain().focus().undo().run(), false, !e.can().undo())}
        {tb("redo", "Redo (Ctrl+Shift+Z)", () => e.chain().focus().redo().run(), false, !e.can().redo())}
      </div>

      {inTable && (
        <div className="ed-tablebar" role="toolbar" aria-label="Table">
          <span className="lbl"><Icon name="table" size={16} /> Table</span>
          <button type="button" onClick={() => e.chain().focus().addRowAfter().run()}><Icon name="plus" size={15} /> Row</button>
          <button type="button" onClick={() => e.chain().focus().addColumnAfter().run()}><Icon name="plus" size={15} /> Column</button>
          <button type="button" onClick={() => e.chain().focus().deleteRow().run()}><Icon name="x" size={15} /> Row</button>
          <button type="button" onClick={() => e.chain().focus().deleteColumn().run()}><Icon name="x" size={15} /> Column</button>
          <button type="button" onClick={() => e.chain().focus().toggleHeaderRow().run()}>Header row</button>
          <button type="button" className="danger" onClick={() => e.chain().focus().deleteTable().run()}><Icon name="trash" size={15} /> Remove table</button>
        </div>
      )}

      <div className="ed-canvas-wrap">
        <BubbleMenu
          editor={e}
          pluginKey="textBubble"
          tippyOptions={{ duration: 120, placement: "top", maxWidth: "none", onHidden: () => setLinkEditing(false) }}
          shouldShow={({ editor: ed, state }) => {
            if (!ed.isEditable || ed.isActive("figure") || ed.isActive("gallery") || ed.isActive("youtube")) return false;
            return (!state.selection.empty && !(state.selection instanceof NodeSelection)) || ed.isActive("link");
          }}
        >
          <div className="ed-bubble">
            {linkEditing || (e.isActive("link") && !textSelection) ? (
              <LinkEditor editor={e} onDone={() => setLinkEditing(false)} />
            ) : (
              <>
                {tb("bold", "Bold", () => e.chain().focus().toggleBold().run(), e.isActive("bold"))}
                {tb("italic", "Italic", () => e.chain().focus().toggleItalic().run(), e.isActive("italic"))}
                {tb("underline", "Underline", () => e.chain().focus().toggleUnderline().run(), e.isActive("underline"))}
                {tb("strike", "Strike through", () => e.chain().focus().toggleStrike().run(), e.isActive("strike"))}
                {tb("highlight", "Highlight", () => e.chain().focus().toggleHighlight().run(), e.isActive("highlight"))}
                <span className="ed-sep" />
                {tb("link", "Add a link", () => setLinkEditing(true), e.isActive("link"))}
                {tb("h2", "Heading", () => e.chain().focus().toggleHeading({ level: 2 }).run(), e.isActive("heading", { level: 2 }))}
                {tb("quote", "Quote", () => e.chain().focus().toggleBlockquote().run(), e.isActive("blockquote"))}
                <span className="ed-sep" />
                {tb("alignLeft", "Align left", () => e.chain().focus().setTextAlign("left").run(), e.isActive({ textAlign: "left" }))}
                {tb("alignCenter", "Centre", () => e.chain().focus().setTextAlign("center").run(), e.isActive({ textAlign: "center" }))}
                {tb("alignRight", "Align right", () => e.chain().focus().setTextAlign("right").run(), e.isActive({ textAlign: "right" }))}
              </>
            )}
          </div>
        </BubbleMenu>

        <FloatingMenu
          editor={e}
          pluginKey="insertFloat"
          tippyOptions={{ duration: 100, placement: "left" }}
          shouldShow={({ editor: ed, state }) => {
            const { $from, empty } = state.selection;
            return ed.isEditable && empty && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth === 1;
          }}
        >
          <button
            type="button"
            className="ed-plus"
            title="Insert a picture, quote, video…"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => e.chain().focus().insertContent("/").run()}
          >
            <Icon name="plus" size={18} />
          </button>
        </FloatingMenu>

        <EditorContent editor={e} />

        {slash && filtered.length > 0 && (
          <div className="ed-slash" style={{ top: slash.top, left: Math.max(0, slash.left - 8) }} role="listbox" aria-label="Insert">
            <div className="ed-slash-h">Insert</div>
            {filtered.map((item, i) => (
              <button
                type="button"
                key={item.key}
                role="option"
                aria-selected={i === slashRef.current.index}
                className={i === slashRef.current.index ? "on" : ""}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(ev) => { ev.preventDefault(); chooseSlash(i); }}
              >
                <span className="ic"><Icon name={item.icon} size={18} /></span>
                <span><b>{item.label}</b><small>{item.hint}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picker && (
        <MediaPicker
          title={picker.opts.title}
          multiple={picker.opts.multiple}
          onClose={() => { picker.resolve(null); setPicker(null); }}
          onPick={(imgs) => { picker.resolve(imgs); setPicker(null); }}
        />
      )}
      {videoAsk && (
        <VideoDialog
          onClose={() => setVideoAsk(false)}
          onInsert={(url) => { e.chain().focus().setYoutubeVideo({ src: url }).run(); setVideoAsk(false); }}
        />
      )}
    </div>
  );
}

/** Replace (or remove, when attrs is null) the placeholder picture for an upload. */
function replaceUpload(editor: Editor, uploadId: string, attrs: Record<string, unknown> | null) {
  const { state } = editor;
  let found: number | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === "figure" && node.attrs.uploadId === uploadId) found = pos;
    return found === null;
  });
  if (found === null) return;
  const node = state.doc.nodeAt(found)!;
  const tr = attrs ? state.tr.setNodeMarkup(found, undefined, { ...node.attrs, ...attrs }) : state.tr.delete(found, found + node.nodeSize);
  editor.view.dispatch(tr);
}

function normaliseUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

function LinkEditor({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [value, setValue] = useState(current);
  const apply = () => {
    const href = normaliseUrl(value);
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    onDone();
  };
  return (
    <form className="ed-linkform" onSubmit={(ev) => { ev.preventDefault(); apply(); }}>
      <Icon name="link" size={16} />
      <input autoFocus type="text" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder="Paste a web address" aria-label="Link address" onKeyDown={(ev) => { if (ev.key === "Escape") { ev.preventDefault(); onDone(); editor.commands.focus(); } }} />
      <button type="submit" className="ed-mini">Apply</button>
      {current && (
        <>
          <a className="ed-mini ghost" href={current} target="_blank" rel="noopener" title="Open link">Open</a>
          <button type="button" className="ed-mini ghost" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onDone(); }} title="Remove link">
            <Icon name="unlink" size={15} />
          </button>
        </>
      )}
    </form>
  );
}

function VideoDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const id = youtubeId(url);
  return (
    <div className="a-overlay" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <form className="a-modal narrow" onSubmit={(ev) => { ev.preventDefault(); if (id) onInsert(url.trim()); }}>
        <div className="a-modal-head"><h2>Add a YouTube video</h2><button type="button" className="a-btn quiet icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="a-modal-body">
          <div className="a-field">
            <label htmlFor="yt-url">YouTube link</label>
            <input id="yt-url" autoFocus type="text" value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            <div className="hint">On YouTube, press <b>Share</b> and copy the link.</div>
          </div>
          {url && !id && <div className="a-notice warn">That doesn't look like a YouTube link yet.</div>}
          {id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" style={{ marginTop: 16, width: "100%", aspectRatio: "16/9", objectFit: "cover", border: "1px solid var(--rule)" }} />}
        </div>
        <div className="a-modal-foot"><span /><div style={{ display: "flex", gap: 10 }}><button type="button" className="a-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="a-btn" disabled={!id}>Add video</button></div></div>
      </form>
    </div>
  );
}
