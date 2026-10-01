import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { RichEditor, type EditorStats } from "./RichEditor";
import { MediaPicker } from "./MediaPicker";
import { Icon } from "./Icon";
import { excerptFromHtml } from "@/lib/domain/excerpt";

type State = "draft" | "scheduled" | "published";

export interface EditorInitial {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverUrl: string | null;
  categoryId: string | null;
  tags: string[];
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string | null;
  state: State;
  showInMenu?: boolean;
}

interface Props {
  kind: "post" | "page";
  initial: EditorInitial;
  categories: { id: string; name: string }[];
  allTags: string[];
}

/** Everything the author edits (what autosave compares and sends). */
interface Doc {
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverUrl: string | null;
  categoryId: string | null;
  newCategory: string;
  tags: string[];
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  showInMenu: boolean;
}
interface Meta {
  id: string | null;
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string | null;
  state: State;
}

const TZ = "Asia/Kolkata";
const fmt = (iso: string | null, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
        ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
        timeZone: TZ,
      })
    : "";
/** ISO → value for <input type="datetime-local"> in the browser's own time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const ago = (d: Date | null) => {
  if (!d) return "";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};

export default function PostEditor({ kind, initial, categories: initialCategories, allTags }: Props) {
  const isPost = kind === "post";
  const noun = isPost ? "essay" : "page";
  const listHref = isPost ? "/admin/posts" : "/admin/pages";

  // An excerpt identical to the auto-generated one is shown as empty (so it keeps following the text).
  const autoExcerpt = initial.excerpt && initial.excerpt === excerptFromHtml(initial.bodyHtml);
  const [doc, setDoc] = useState<Doc>({
    title: initial.title === "Untitled" || initial.title === "Untitled page" ? "" : initial.title,
    excerpt: autoExcerpt ? "" : initial.excerpt,
    bodyHtml: initial.bodyHtml,
    coverUrl: initial.coverUrl,
    categoryId: initial.categoryId,
    newCategory: "",
    tags: initial.tags,
    featured: initial.featured,
    seoTitle: initial.seoTitle ?? "",
    seoDescription: initial.seoDescription ?? "",
    showInMenu: initial.showInMenu ?? true,
  });
  const [meta, setMeta] = useState<Meta>({
    id: initial.id, slug: initial.slug, status: initial.status, publishedAt: initial.publishedAt, updatedAt: initial.updatedAt, state: initial.state,
  });
  const [categories, setCategories] = useState(initialCategories);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(initial.updatedAt ? new Date(initial.updatedAt) : null);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState(0);
  const [stats, setStats] = useState<EditorStats>({ words: 0, minutes: 1 });
  const [panel, setPanel] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [justPublished, setJustPublished] = useState<null | State>(null);
  const [coverPicker, setCoverPicker] = useState(false);
  const [recovery, setRecovery] = useState<{ doc: Doc; at: number } | null>(null);
  const [, tick] = useState(0);

  const docRef = useRef(doc);
  docRef.current = doc;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const version = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const forceRevision = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = `ps-editor:${kind}:${initial.id ?? "new"}`;

  // Open the settings panel by default on wide screens.
  useEffect(() => {
    setPanel(window.matchMedia("(min-width: 1280px)").matches);
    const t = window.setInterval(() => tick((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, []);

  // Offer to restore text that never reached the server (closed tab, lost connection).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { doc: Doc; at: number };
      const serverAt = initial.updatedAt ? Date.parse(initial.updatedAt) : 0;
      const differs = saved.doc.bodyHtml !== initial.bodyHtml || saved.doc.title !== doc.title;
      if (saved.at > serverAt + 2000 && differs) setRecovery(saved);
      else localStorage.removeItem(storageKey);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((patch: Partial<Doc>) => {
    version.current += 1;
    setDoc((d) => ({ ...d, ...patch }));
    setDirty(true);
    setError("");
  }, []);

  // Local safety copy of unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ doc: docRef.current, at: Date.now() })); } catch { /* ignore */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [doc, dirty, storageKey]);

  /** Send the current document. `extra` changes status / date. Resolves true on success. */
  const save = useCallback(
    async (extra: { status?: "draft" | "published"; publishedAt?: string | null } = {}): Promise<boolean> => {
      if (inFlight.current) await inFlight.current;
      if (uploadsRef.current > 0) {
        setError("Please wait for the pictures to finish uploading.");
        return false;
      }
      const d = docRef.current;
      const m = metaRef.current;
      const sentVersion = version.current;
      const body = isPost
        ? {
            id: m.id ?? undefined,
            title: d.title,
            bodyHtml: d.bodyHtml,
            excerpt: d.excerpt,
            coverUrl: d.coverUrl,
            categoryId: d.categoryId,
            newCategory: d.newCategory || undefined,
            tags: d.tags,
            featured: d.featured,
            seoTitle: d.seoTitle,
            seoDescription: d.seoDescription,
            forceRevision: forceRevision.current || undefined,
            ...extra,
          }
        : { id: m.id ?? undefined, title: d.title, bodyHtml: d.bodyHtml, showInMenu: d.showInMenu, status: extra.status };

      const run = (async () => {
        setSaving(true);
        try {
          const res = await fetch(isPost ? "/api/admin/posts" : "/api/admin/pages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.status === 401) throw new Error("You've been signed out. Open a new tab, sign in, then come back and press Save — your writing is still here.");
          const data = (await res.json().catch(() => ({}))) as { post?: any; page?: any; categories?: any[]; error?: string };
          if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status})`);
          const saved = data.post ?? data.page;
          forceRevision.current = false;
          setMeta({ id: saved.id, slug: saved.slug, status: saved.status, publishedAt: saved.publishedAt ?? null, updatedAt: saved.updatedAt, state: saved.state });
          if (data.categories) setCategories(data.categories);
          if (d.newCategory) setDoc((cur) => ({ ...cur, newCategory: "", categoryId: saved.categoryId }));
          if (!m.id) history.replaceState(null, "", `${listHref}/${saved.id}`);
          setSavedAt(new Date());
          if (version.current === sentVersion) {
            setDirty(false);
            try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
          }
          return true;
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          return false;
        } finally {
          setSaving(false);
        }
      })();
      inFlight.current = run;
      const ok = await run;
      inFlight.current = null;
      return ok;
    },
    [isPost, listHref, storageKey],
  );
  const uploadsRef = useRef(0);
  uploadsRef.current = uploads;

  // Drafts save themselves a moment after you stop typing. Live essays wait for "Update".
  const autosave = meta.state === "draft";
  useEffect(() => {
    if (!dirty || !autosave || uploads > 0) return;
    const d = docRef.current;
    if (!metaRef.current.id && !d.title.trim() && !d.bodyHtml.replace(/<[^>]*>/g, "").trim()) return;
    const t = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(t);
  }, [doc, dirty, autosave, uploads, save]);

  // Warn before leaving with unsaved changes; Ctrl/Cmd+S saves.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty || saving) { e.preventDefault(); e.returnValue = ""; }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
    };
    window.addEventListener("beforeunload", onBefore);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("beforeunload", onBefore); window.removeEventListener("keydown", onKey); };
  }, [dirty, saving, save]);

  // Grow the title box with its text.
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [doc.title]);

  const statusText = (() => {
    if (error) return null;
    if (uploads > 0) return `Uploading ${uploads} picture${uploads === 1 ? "" : "s"}…`;
    if (saving) return "Saving…";
    if (dirty) return autosave ? "Saving soon…" : "Unsaved changes";
    if (!meta.id) return "Not saved yet";
    return `Saved ${ago(savedAt)}`;
  })();

  const publishNow = async (when: "now" | string, opts: { featured?: boolean; categoryId?: string | null } = {}) => {
    if (opts.featured !== undefined || opts.categoryId !== undefined) {
      setDoc((d) => ({ ...d, ...(opts.featured !== undefined ? { featured: opts.featured } : {}), ...(opts.categoryId !== undefined ? { categoryId: opts.categoryId } : {}) }));
      docRef.current = { ...docRef.current, ...opts } as Doc;
    }
    const nowIso = new Date().toISOString();
    let publishedAt: string | null | undefined;
    if (when === "now") publishedAt = meta.publishedAt && meta.publishedAt <= nowIso ? undefined : nowIso;
    else publishedAt = when;
    const ok = await save({ status: "published", ...(isPost && publishedAt !== undefined ? { publishedAt } : {}) });
    if (ok) setJustPublished(when === "now" ? "published" : "scheduled");
    return ok;
  };

  const unpublish = async () => {
    if (!window.confirm(`Take this ${noun} off the website? It will be kept as a draft.`)) return;
    await save({ status: "draft" });
  };

  const del = async () => {
    if (!meta.id) { location.href = listHref; return; }
    if (!window.confirm(`Delete this ${noun} for good? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.append("_action", "delete");
    fd.append("id", meta.id);
    setDirty(false);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    await fetch(isPost ? "/api/admin/posts" : "/api/admin/pages", { method: "POST", body: fd });
    location.href = `${listHref}?deleted=1`;
  };

  const restoreText = (html: string, title?: string) => {
    forceRevision.current = true;
    editorRef.current?.commands.setContent(html, true);
    if (title !== undefined) update({ title, bodyHtml: html });
  };

  const publicUrl = isPost ? `/blog/${meta.slug}` : `/${meta.slug}`;
  const previewUrl = isPost && meta.id ? `/admin/posts/${meta.id}/preview` : publicUrl;
  const primary = (() => {
    if (meta.state === "draft") return { label: "Publish…", run: () => (isPost ? setPublishOpen(true) : void publishNow("now")) };
    return { label: dirty ? "Update" : "Up to date", run: () => void save(), disabled: !dirty || saving };
  })();

  return (
    <div className={`ed-page${panel ? " with-panel" : ""}`}>
      {/* ---------- Top bar ---------- */}
      <header className="ed-top">
        <a className="ed-back" href={listHref} title={`Back to ${isPost ? "essays" : "pages"}`}>
          <Icon name="back" size={18} /> <span>{isPost ? "Essays" : "Pages"}</span>
        </a>
        <div className="ed-status" aria-live="polite">
          <span className={`a-badge ${meta.state}`} style={{ textTransform: "capitalize" }}>{meta.state}</span>
          {meta.state === "scheduled" && <span className="when">for {fmt(meta.publishedAt)}</span>}
          {error ? <span className="err">{error}</span> : <span className="muted">{statusText}</span>}
        </div>
        <div className="ed-top-actions">
          {meta.id && (
            <a className="a-btn quiet sm" href={meta.state === "published" ? publicUrl : previewUrl} target="_blank" rel="noopener" title={meta.state === "published" ? "Open on the website" : "See how it will look"}>
              <Icon name={meta.state === "published" ? "external" : "eye"} size={17} />
              <span className="hide-sm">{meta.state === "published" ? "View" : "Preview"}</span>
            </a>
          )}
          {meta.state === "draft" && meta.id && (
            <button type="button" className="a-btn ghost sm hide-sm" onClick={() => void save()} disabled={saving || !dirty}>
              Save draft
            </button>
          )}
          <button type="button" className="a-btn sm" onClick={primary.run} disabled={primary.disabled}>
            {primary.label}
          </button>
          <button type="button" className={`a-btn quiet sm icon${panel ? " on" : ""}`} onClick={() => setPanel((p) => !p)} aria-pressed={panel} title={`${isPost ? "Essay" : "Page"} settings`}>
            <Icon name="sidebar" size={18} />
          </button>
        </div>
      </header>

      {recovery && (
        <div className="ed-recover">
          <Icon name="history" size={18} />
          <span>Unsaved writing from {new Date(recovery.at).toLocaleString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })} was found on this computer.</span>
          <button type="button" className="a-btn sm" onClick={() => { update({ ...recovery.doc }); editorRef.current?.commands.setContent(recovery.doc.bodyHtml, false); setRecovery(null); }}>
            Bring it back
          </button>
          <button type="button" className="a-btn quiet sm" onClick={() => { try { localStorage.removeItem(storageKey); } catch {} setRecovery(null); }}>
            Discard
          </button>
        </div>
      )}

      <div className="ed-body">
        {/* ---------- Writing canvas ---------- */}
        <main className="ed-canvas">
          <div className="ed-column">
            {isPost && (
              doc.coverUrl ? (
                <div className="ed-cover">
                  <img src={doc.coverUrl} alt="" />
                  <div className="ed-cover-acts">
                    <button type="button" className="a-btn sm dark" onClick={() => setCoverPicker(true)}><Icon name="replace" size={16} /> Change cover</button>
                    <button type="button" className="a-btn sm dark" onClick={() => update({ coverUrl: null })}><Icon name="trash" size={16} /> Remove</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ed-addcover" onClick={() => setCoverPicker(true)}>
                  <Icon name="image" size={17} /> Add a cover picture
                </button>
              )
            )}

            {isPost && (
              <div className="ed-kicker">
                <select
                  value={doc.categoryId ?? ""}
                  onChange={(e) => (e.target.value === "__new" ? (setPanel(true), window.setTimeout(() => document.getElementById("ed-newcat")?.focus(), 50)) : update({ categoryId: e.target.value || null, newCategory: "" }))}
                  aria-label="Category"
                >
                  <option value="">{doc.newCategory ? doc.newCategory : "Choose a category"}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new">+ New category…</option>
                </select>
              </div>
            )}

            <textarea
              ref={titleRef}
              className="ed-title"
              rows={1}
              value={doc.title}
              placeholder={isPost ? "Title" : "Page title"}
              onChange={(e) => update({ title: e.target.value.replace(/\n/g, " ") })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editorRef.current?.commands.focus("start"); } }}
              aria-label="Title"
            />
            {isPost && (
              <textarea
                className="ed-intro"
                rows={2}
                value={doc.excerpt}
                placeholder="A one-line introduction, shown under the title on the home page (optional)"
                onChange={(e) => update({ excerpt: e.target.value.replace(/\n/g, " ") })}
                aria-label="Introduction"
              />
            )}

            <RichEditor
              initialHtml={initial.bodyHtml}
              placeholder={isPost ? "Begin your essay here…" : "Write the page here…"}
              onChange={(html) => update({ bodyHtml: html })}
              onStats={setStats}
              onBusy={setUploads}
              onReady={(ed) => { editorRef.current = ed; }}
            />
          </div>
          <footer className="ed-foot">
            <span>{stats.words.toLocaleString("en-IN")} words</span>
            <span>·</span>
            <span>{stats.minutes} min read</span>
            <span className="kbd hide-sm">Tip: type <kbd>/</kbd> on an empty line to add pictures, quotes and more · <kbd>Ctrl</kbd>+<kbd>S</kbd> saves</span>
          </footer>
        </main>

        {/* ---------- Settings panel ---------- */}
        {panel && (
          <aside className="ed-panel" aria-label={`${isPost ? "Essay" : "Page"} settings`}>
            <div className="ed-panel-head">
              <h2>{isPost ? "Essay settings" : "Page settings"}</h2>
              <button type="button" className="a-btn quiet icon sm" onClick={() => setPanel(false)} aria-label="Close settings"><Icon name="x" /></button>
            </div>
            <StatusSection
              kind={kind}
              meta={meta}
              onPublish={() => (isPost ? setPublishOpen(true) : void publishNow("now"))}
              onUnpublish={unpublish}
              onReschedule={(iso) => void save({ publishedAt: iso })}
              onPublishNow={() => void publishNow("now")}
            />
            {isPost ? (
              <>
                <PanelSection title="Category">
                  <select value={doc.categoryId ?? ""} onChange={(e) => update({ categoryId: e.target.value || null, newCategory: "" })}>
                    <option value="">No category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    id="ed-newcat"
                    type="text"
                    style={{ marginTop: 8 }}
                    value={doc.newCategory}
                    onChange={(e) => update({ newCategory: e.target.value, categoryId: e.target.value ? null : doc.categoryId })}
                    placeholder="…or type a new one"
                  />
                  <div className="hint">Categories appear in the website's menu and topic lists.</div>
                </PanelSection>
                <PanelSection title="Tags">
                  <TagInput value={doc.tags} suggestions={allTags} onChange={(tags) => update({ tags })} />
                  <div className="hint">Small keywords that link related essays. Press Enter after each.</div>
                </PanelSection>
                <PanelSection title="Cover picture">
                  {doc.coverUrl ? (
                    <div className="ed-panel-cover">
                      <img src={doc.coverUrl} alt="" />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="button" className="a-btn ghost sm" onClick={() => setCoverPicker(true)}>Change</button>
                        <button type="button" className="a-btn quiet sm" onClick={() => update({ coverUrl: null })}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="a-btn ghost sm" onClick={() => setCoverPicker(true)}><Icon name="image" size={16} /> Choose a picture</button>
                  )}
                  <div className="hint">Shown at the top of the essay, on the home page, and when shared on WhatsApp.</div>
                </PanelSection>
                <PanelSection title="Home page">
                  <label className="a-switch">
                    <input type="checkbox" checked={doc.featured} onChange={(e) => update({ featured: e.target.checked })} />
                    Show as the big essay at the top
                  </label>
                  <div className="hint">Only one essay can be featured; choosing this replaces the current one.</div>
                </PanelSection>
                <PanelSection title="Google & sharing" collapsible>
                  <div className="a-field">
                    <label htmlFor="seo-t">Title for search results</label>
                    <input id="seo-t" type="text" value={doc.seoTitle} maxLength={90} placeholder={doc.title || "Same as the title"} onChange={(e) => update({ seoTitle: e.target.value })} />
                    <div className="hint">{doc.seoTitle.length ? `${doc.seoTitle.length} / 60 characters` : "Leave empty to use the title."}</div>
                  </div>
                  <div className="a-field" style={{ marginTop: 14 }}>
                    <label htmlFor="seo-d">Description for search results</label>
                    <textarea id="seo-d" rows={3} value={doc.seoDescription} maxLength={220} placeholder={doc.excerpt || excerptFromHtml(doc.bodyHtml) || "Leave empty to use the introduction."} onChange={(e) => update({ seoDescription: e.target.value })} />
                    <div className="hint">{doc.seoDescription.length ? `${doc.seoDescription.length} / 160 characters` : "Leave empty to use the introduction."}</div>
                  </div>
                </PanelSection>
              </>
            ) : (
              <PanelSection title="Menu">
                <label className="a-switch">
                  <input type="checkbox" checked={doc.showInMenu} onChange={(e) => update({ showInMenu: e.target.checked })} />
                  Show in the website menu
                </label>
                <div className="hint">Change the order under <a href="/admin/menu">Menu &amp; topics</a>.</div>
              </PanelSection>
            )}
            <PanelSection title="Web address">
              <div className="ed-url">{meta.id ? publicUrl : `${isPost ? "/blog/" : "/"}…`}</div>
              <div className="hint">
                {meta.status === "published" || meta.publishedAt ? "Fixed, so links people have shared keep working." : "Made from the title. It is fixed once you publish."}
              </div>
            </PanelSection>
            {isPost && meta.id && <HistorySection postId={meta.id} key={meta.updatedAt ?? ""} onRestore={restoreText} />}
            <div className="ed-panel-danger">
              <button type="button" className="a-btn danger sm" onClick={del}><Icon name="trash" size={16} /> Delete this {noun}</button>
            </div>
          </aside>
        )}
      </div>

      {coverPicker && (
        <MediaPicker
          title="Choose a cover picture"
          onClose={() => setCoverPicker(false)}
          onPick={(imgs) => { if (imgs[0]) update({ coverUrl: imgs[0].src }); setCoverPicker(false); }}
        />
      )}
      {publishOpen && (
        <PublishDialog
          doc={doc}
          categories={categories}
          done={justPublished}
          slugUrl={publicUrl}
          busy={saving || uploads > 0}
          error={error}
          onClose={() => { setPublishOpen(false); setJustPublished(null); }}
          onPublish={publishNow}
        />
      )}
    </div>
  );
}

function PanelSection({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className="ed-psec">
      {collapsible ? (
        <button type="button" className="ed-psec-h btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {title} <span>{open ? "−" : "+"}</span>
        </button>
      ) : (
        <h3 className="ed-psec-h">{title}</h3>
      )}
      {open && <div className="ed-psec-b">{children}</div>}
    </section>
  );
}

function StatusSection(props: {
  kind: "post" | "page";
  meta: Meta;
  onPublish: () => void;
  onUnpublish: () => void;
  onReschedule: (iso: string) => void;
  onPublishNow: () => void;
}) {
  const { meta, kind } = props;
  const [date, setDate] = useState(toLocalInput(meta.publishedAt));
  useEffect(() => setDate(toLocalInput(meta.publishedAt)), [meta.publishedAt]);
  const changed = fromLocalInput(date) !== meta.publishedAt && Boolean(date);
  return (
    <PanelSection title="Status">
      {meta.state === "draft" && (
        <>
          <p className="ed-ptext">Draft — only you can see it.</p>
          <button type="button" className="a-btn sm" onClick={props.onPublish}>Publish…</button>
        </>
      )}
      {meta.state === "scheduled" && (
        <>
          <p className="ed-ptext">Scheduled. It will appear on the website on <b>{fmt(meta.publishedAt)}</b>.</p>
          <label className="lbl" htmlFor="ed-date">Change the date</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="ed-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            {changed && <button type="button" className="a-btn sm" onClick={() => props.onReschedule(fromLocalInput(date)!)}>Save</button>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="a-btn ghost sm" onClick={props.onPublishNow}>Publish now instead</button>
            <button type="button" className="a-btn quiet sm" onClick={props.onUnpublish}>Cancel schedule</button>
          </div>
        </>
      )}
      {meta.state === "published" && (
        <>
          <p className="ed-ptext">On the website{kind === "post" && meta.publishedAt ? <> since <b>{fmt(meta.publishedAt, false)}</b></> : null}.</p>
          {kind === "post" && (
            <>
              <label className="lbl" htmlFor="ed-date">Publish date shown to readers</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="ed-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
                {changed && <button type="button" className="a-btn sm" onClick={() => props.onReschedule(fromLocalInput(date)!)}>Save</button>}
              </div>
            </>
          )}
          <button type="button" className="a-btn quiet sm" style={{ marginTop: 10 }} onClick={props.onUnpublish}>Take off the website</button>
        </>
      )}
    </PanelSection>
  );
}

function TagInput({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return setText("");
    onChange([...value, t]);
    setText("");
  };
  const options = useMemo(() => suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())), [suggestions, value]);
  return (
    <div className="ed-tags">
      {value.map((t) => (
        <span className="chip" key={t}>
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}><Icon name="x" size={12} /></button>
        </span>
      ))}
      <input
        type="text"
        list="ed-tag-list"
        value={text}
        placeholder={value.length ? "Add another…" : "e.g. family, travel"}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(text); }
          else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
      <datalist id="ed-tag-list">{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

interface RevisionRow { id: string; title: string; createdAt: string; words: number }

function HistorySection({ postId, onRestore }: { postId: string; onRestore: (html: string, title: string) => void }) {
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ title: string; bodyHtml: string; createdAt: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/admin/revisions?post=${encodeURIComponent(postId)}`)
      .then((r) => r.json())
      .then((d: { revisions?: RevisionRow[] }) => setRows(d.revisions ?? []))
      .catch(() => setRows([]));
  }, [open, postId]);
  const view = async (id: string) => {
    const d = (await (await fetch(`/api/admin/revisions?id=${encodeURIComponent(id)}`)).json()) as { revision?: { title: string; bodyHtml: string; createdAt: string } };
    if (d.revision) setViewing(d.revision);
  };
  return (
    <section className="ed-psec">
      <button type="button" className="ed-psec-h btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Earlier versions <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="ed-psec-b">
          {rows === null ? <p className="ed-ptext">Loading…</p> : rows.length === 0 ? (
            <p className="ed-ptext">No earlier versions yet. As you keep editing, a copy is kept every ten minutes or so.</p>
          ) : (
            <ul className="ed-revs">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => void view(r.id)}>
                    <b>{fmt(r.createdAt)}</b>
                    <span>{r.title} · {r.words.toLocaleString("en-IN")} words</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {viewing && (
        <div className="a-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="a-modal" role="dialog" aria-modal="true" aria-label="Earlier version">
            <div className="a-modal-head">
              <div>
                <div className="a-kicker">Version from {fmt(viewing.createdAt)}</div>
                <h2 style={{ marginTop: 6 }}>{viewing.title}</h2>
              </div>
              <button type="button" className="a-btn quiet icon" onClick={() => setViewing(null)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="a-modal-body"><div className="prose ed-revview" dangerouslySetInnerHTML={{ __html: viewing.bodyHtml }} /></div>
            <div className="a-modal-foot">
              <span className="muted" style={{ fontSize: 13.5 }}>Your current text is kept as a version too, so you can switch back.</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="a-btn ghost" onClick={() => setViewing(null)}>Close</button>
                <button type="button" className="a-btn" onClick={() => { onRestore(viewing.bodyHtml, viewing.title); setViewing(null); }}>Restore this version</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PublishDialog(props: {
  doc: Doc;
  categories: { id: string; name: string }[];
  done: State | null;
  slugUrl: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onPublish: (when: "now" | string, opts: { featured?: boolean; categoryId?: string | null }) => Promise<boolean>;
}) {
  const { doc, done } = props;
  const [when, setWhen] = useState<"now" | "later">("now");
  const tomorrow9 = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d.toISOString()); })();
  const [date, setDate] = useState(tomorrow9);
  const [featured, setFeatured] = useState(doc.featured);
  const [categoryId, setCategoryId] = useState(doc.categoryId);
  const future = when === "later" && fromLocalInput(date)! > new Date().toISOString();

  const checks = [
    { ok: Boolean(doc.title.trim()), text: doc.title.trim() ? "Has a title" : "Give it a title first" },
    { ok: Boolean(doc.coverUrl), text: doc.coverUrl ? "Has a cover picture" : "No cover picture (it will show a plain panel)" },
    { ok: Boolean(categoryId || doc.newCategory), text: categoryId || doc.newCategory ? "Has a category" : "No category" },
  ];

  if (done) {
    const live = done === "published";
    const full = typeof location !== "undefined" ? location.origin + props.slugUrl : props.slugUrl;
    return (
      <div className="a-overlay">
        <div className="a-modal narrow ed-done" role="dialog" aria-modal="true">
          <div className="a-modal-body" style={{ textAlign: "center", padding: "40px 32px 28px" }}>
            <div className="ed-done-ic"><Icon name={live ? "check" : "calendar"} size={26} /></div>
            <h2>{live ? "Your essay is on the website" : "Your essay is scheduled"}</h2>
            <p className="muted">{live ? "Readers can find it now." : `It will appear on ${fmt(fromLocalInput(date))}.`}</p>
            {live && (
              <div className="ed-share">
                <input type="text" readOnly value={full} onFocus={(e) => e.target.select()} />
                <button type="button" className="a-btn ghost sm" onClick={() => void navigator.clipboard?.writeText(full)}><Icon name="copy" size={15} /> Copy link</button>
              </div>
            )}
          </div>
          <div className="a-modal-foot">
            <a className="a-btn quiet" href="/admin/posts">Back to essays</a>
            <div style={{ display: "flex", gap: 10 }}>
              {live && <a className="a-btn ghost" href={props.slugUrl} target="_blank" rel="noopener">View it</a>}
              <button type="button" className="a-btn" onClick={props.onClose}>Keep editing</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="a-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="a-modal narrow" role="dialog" aria-modal="true" aria-label="Publish">
        <div className="a-modal-head"><h2>Ready to publish?</h2><button type="button" className="a-btn quiet icon" onClick={props.onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="a-modal-body ed-pub">
          <div className="lbl">When should it appear?</div>
          <div className="ed-when">
            <label className={when === "now" ? "on" : ""}><input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} /> <span><b>Right now</b><small>Readers can see it immediately</small></span></label>
            <label className={when === "later" ? "on" : ""}><input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} /> <span><b>Later</b><small>Pick a date and time</small></span></label>
          </div>
          {when === "later" && (
            <div style={{ marginTop: 12 }}>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Publish date and time" />
              {!future && <div className="a-notice warn">Choose a time in the future.</div>}
            </div>
          )}

          <div className="lbl" style={{ marginTop: 22 }}>Category</div>
          <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || null)}>
            <option value="">{doc.newCategory || "No category"}</option>
            {props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label className="a-switch" style={{ marginTop: 18 }}>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Feature it at the top of the home page
          </label>

          <ul className="ed-checks">
            {checks.map((c) => <li key={c.text} className={c.ok ? "ok" : ""}><Icon name={c.ok ? "check" : "x"} size={15} /> {c.text}</li>)}
          </ul>
          {props.error && <div className="a-notice err">{props.error}</div>}
        </div>
        <div className="a-modal-foot">
          <button type="button" className="a-btn ghost" onClick={props.onClose}>Not yet</button>
          <button
            type="button"
            className="a-btn"
            disabled={props.busy || !doc.title.trim() || (when === "later" && !future)}
            onClick={() => void props.onPublish(when === "now" ? "now" : fromLocalInput(date)!, { featured, categoryId: doc.newCategory ? undefined : categoryId })}
          >
            {props.busy ? "Publishing…" : when === "now" ? "Publish now" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
