import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../editor/Icon";
import { fetchLibrary, uploadMany, type LibraryItem } from "../editor/MediaPicker";
import { postJson, useToast } from "./SortList";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Every uploaded photo: upload more, describe them, see where each is used, delete unused ones. */
export default function MediaLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unused">("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const reload = () => fetchLibrary().then(setItems).catch((e) => { setItems([]); setError(String(e.message ?? e)); });
  useEffect(() => { void reload(); }, []);

  const unusedCount = (items ?? []).filter((i) => !i.usedIn?.length).length;
  const shown = useMemo(() => (items ?? []).filter((i) => filter === "all" || !i.usedIn?.length), [items, filter]);
  const open = items?.find((i) => i.key === openKey) ?? null;

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return setError("Please choose picture files (JPEG, PNG, WebP or GIF).");
    setError("");
    setBusy((n) => n + imgs.length);
    await uploadMany(imgs, () => setBusy((n) => n - 1), (msg) => { setError(msg); setBusy((n) => n - 1); });
    await reload();
    toast.show(`${imgs.length} photo${imgs.length === 1 ? "" : "s"} added`);
  };

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); }}
    >
      <div className={`a-drop${over ? " on" : ""}`} style={{ marginTop: 26 }}>
        <Icon name="upload" size={26} />
        <div style={{ fontSize: 15, color: "var(--ink-soft)" }}>
          {busy ? `Uploading ${busy} photo${busy === 1 ? "" : "s"}…` : "Drag photos anywhere on this page, or"}
        </div>
        {!busy && <button type="button" className="a-btn" onClick={() => fileRef.current?.click()}>Choose from your computer</button>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {error && <div className="a-notice err">{error}</div>}

      <nav className="a-tabs" aria-label="Filter photos" style={{ marginTop: 30 }}>
        <button type="button" aria-selected={filter === "all"} onClick={() => setFilter("all")}>All photos<span className="n">{items?.length ?? 0}</span></button>
        {unusedCount > 0 && <button type="button" aria-selected={filter === "unused"} onClick={() => setFilter("unused")}>Not used anywhere<span className="n">{unusedCount}</span></button>}
      </nav>

      {items === null ? (
        <p className="muted" style={{ marginTop: 24 }}>Loading your photos…</p>
      ) : shown.length === 0 ? (
        <div className="a-empty">
          <h3>{items.length ? "Every photo is in use" : "No photos yet"}</h3>
          <p>{items.length ? "Nothing to tidy up." : "Photos you add to essays are kept here, so you can use them again."}</p>
        </div>
      ) : (
        <div className="a-media" style={{ marginTop: 22 }}>
          {shown.map((m) => (
            <button type="button" key={m.key} className="tile" onClick={() => setOpenKey(m.key)} title={m.alt || "Photo"}>
              <img src={m.url} alt={m.alt} loading="lazy" />
              {!m.usedIn?.length && <span className="unused">Not used</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <PhotoDetail
          item={open}
          onClose={() => setOpenKey(null)}
          onAlt={(alt) => setItems((cur) => cur!.map((x) => (x.key === open.key ? { ...x, alt } : x)))}
          onDeleted={() => { setItems((cur) => cur!.filter((x) => x.key !== open.key)); setOpenKey(null); toast.show("Photo deleted"); }}
          onToast={toast.show}
        />
      )}
      {toast.node}
    </div>
  );
}

function PhotoDetail(props: { item: LibraryItem; onClose: () => void; onAlt: (alt: string) => void; onDeleted: () => void; onToast: (m: string) => void }) {
  const { item } = props;
  const [alt, setAlt] = useState(item.alt);
  const [error, setError] = useState("");
  const uses = item.usedIn ?? [];
  const full = typeof location !== "undefined" ? location.origin + item.url : item.url;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const saveAlt = async () => {
    if (alt === item.alt) return;
    try { await postJson("/api/admin/media", { action: "alt", key: item.key, alt }); props.onAlt(alt); props.onToast("Description saved"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const del = async () => {
    const msg = uses.length
      ? `This photo is still shown in ${uses.length} place${uses.length === 1 ? "" : "s"} (${uses.map((u) => u.title).join(", ")}). Deleting it will leave an empty space there. Delete anyway?`
      : "Delete this photo for good?";
    if (!window.confirm(msg)) return;
    try { await postJson("/api/admin/media", { action: "delete", key: item.key }); props.onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const link = (u: { kind: string; id: string }) => (u.kind === "post" ? `/admin/posts/${u.id}` : u.kind === "page" ? `/admin/pages/${u.id}` : "/admin/settings");

  return (
    <div className="a-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="a-modal a-photo" role="dialog" aria-modal="true" aria-label="Photo">
        <div className="a-photo-img"><img src={item.url} alt={item.alt} /></div>
        <div className="a-photo-side">
          <div className="a-modal-head" style={{ padding: "0 0 14px" }}>
            <h2>Photo</h2>
            <button type="button" className="a-btn quiet icon" onClick={props.onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="a-field">
            <label htmlFor="ph-alt">Description</label>
            <textarea id="ph-alt" rows={3} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} onBlur={() => void saveAlt()} placeholder="What does the photo show? e.g. Grandfather's bicycle outside the house" />
            <div className="hint">Read aloud to blind readers and used by Google. Used whenever you insert this photo.</div>
          </div>
          <dl className="a-photo-meta">
            <dt>Added</dt><dd>{date(item.createdAt)}</dd>
            {item.width && item.height ? <><dt>Size</dt><dd>{item.width} × {item.height} · {kb(item.bytes)}</dd></> : null}
            <dt>Used in</dt>
            <dd>
              {uses.length ? (
                <ul>{uses.map((u) => <li key={u.kind + u.id}><a href={link(u)}>{u.title}</a></li>)}</ul>
              ) : "Not used anywhere"}
            </dd>
          </dl>
          <div className="a-photo-acts">
            <button type="button" className="a-btn ghost sm" onClick={() => { void navigator.clipboard?.writeText(full); props.onToast("Link copied"); }}><Icon name="copy" size={15} /> Copy link</button>
            <a className="a-btn ghost sm" href={item.url} download><Icon name="download" size={15} /> Download</a>
            <button type="button" className="a-btn danger sm" onClick={() => void del()}><Icon name="trash" size={15} /> Delete</button>
          </div>
          {error && <div className="a-notice err">{error}</div>}
        </div>
      </div>
    </div>
  );
}
