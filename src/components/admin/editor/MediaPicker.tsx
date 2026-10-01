import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { uploadImageFull } from "@/lib/client/image";
import type { GalleryImage } from "./extensions";

export interface LibraryItem {
  key: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  bytes: number;
  createdAt: string;
  usedIn?: { kind: string; id: string; title: string }[];
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
  const res = await fetch("/api/admin/media", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("Could not load your photos");
  return ((await res.json()) as { items: LibraryItem[] }).items;
}

/** Upload several files, reporting each as it finishes. */
export async function uploadMany(
  files: File[],
  onDone: (img: LibraryItem) => void,
  onError: (msg: string) => void,
): Promise<void> {
  for (const f of files) {
    try {
      const u = await uploadImageFull(f);
      onDone({ key: u.key ?? u.url, url: u.url, alt: "", width: u.width, height: u.height, bytes: f.size, createdAt: new Date().toISOString() });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }
}

interface Props {
  title?: string;
  multiple?: boolean;
  onPick: (images: GalleryImage[]) => void;
  onClose: () => void;
}

/** Modal: drop or choose pictures from the computer, or pick from pictures already uploaded. */
export function MediaPicker({ title = "Add a picture", multiple = false, onPick, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLibrary().then(setItems).catch((e) => { setItems([]); setError(String(e.message ?? e)); });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (url: string) =>
    setSelected((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : multiple ? [...cur, url] : [url]));

  const finish = useCallback(
    (urls: string[]) => {
      const byUrl = new Map((items ?? []).map((i) => [i.url, i]));
      onPick(urls.map((u) => ({ src: u, alt: byUrl.get(u)?.alt ?? "" })));
    },
    [items, onPick],
  );

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return setError("Please choose picture files (JPEG, PNG, WebP or GIF).");
    setError("");
    setBusy((n) => n + imgs.length);
    const done: string[] = [];
    await uploadMany(
      multiple ? imgs : imgs.slice(0, 1),
      (item) => {
        done.push(item.url);
        setItems((cur) => [item, ...(cur ?? [])]);
        setSelected((cur) => (multiple ? [...cur, item.url] : [item.url]));
        setBusy((n) => n - 1);
      },
      (msg) => { setError(msg); setBusy((n) => n - 1); },
    );
    // A single upload in single mode goes straight in — one less click.
    if (!multiple && done.length === 1) finish(done);
  };

  return (
    <div className="a-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="a-modal-head">
          <h2>{title}</h2>
          <button type="button" className="a-btn quiet icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="a-modal-body">
          <div
            className={`a-drop${over ? " on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); }}
          >
            <Icon name="upload" size={26} />
            <div style={{ fontSize: 15, color: "var(--ink-soft)" }}>
              {busy ? `Uploading ${busy} picture${busy === 1 ? "" : "s"}…` : <>Drag {multiple ? "pictures" : "a picture"} here, or</>}
            </div>
            {!busy && (
              <button type="button" className="a-btn" onClick={() => fileRef.current?.click()}>
                Choose from your computer
              </button>
            )}
            <div style={{ fontSize: 12.5 }}>Large photos are made smaller automatically, so they load quickly.</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple={multiple}
              hidden
              onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }}
            />
          </div>
          {error && <div className="a-notice err">{error}</div>}

          <div className="label" style={{ margin: "26px 0 12px" }}>Or use one you've uploaded before</div>
          {items === null ? (
            <p className="muted">Loading your photos…</p>
          ) : items.length === 0 ? (
            <p className="muted">No photos yet. Pictures you upload appear here so you can use them again.</p>
          ) : (
            <div className="a-media">
              {items.map((m) => {
                const on = selected.includes(m.url);
                return (
                  <button
                    type="button"
                    key={m.key}
                    className={`tile${on ? " sel" : ""}`}
                    onClick={() => toggle(m.url)}
                    onDoubleClick={() => finish([m.url])}
                    aria-pressed={on}
                    title={m.alt || "Photo"}
                  >
                    <img src={m.url} alt={m.alt} loading="lazy" />
                    {on && <span className="tick"><Icon name="check" size={16} /></span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="a-modal-foot">
          <span className="muted" style={{ fontSize: 13.5 }}>
            {selected.length ? `${selected.length} selected` : multiple ? "Choose one or more pictures" : "Choose a picture"}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="a-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="a-btn" disabled={!selected.length || busy > 0} onClick={() => finish(selected)}>
              {multiple ? `Insert ${selected.length || ""} picture${selected.length === 1 ? "" : "s"}` : "Use this picture"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
