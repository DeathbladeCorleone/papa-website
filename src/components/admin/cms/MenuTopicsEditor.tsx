import { useState } from "react";
import { Icon } from "../editor/Icon";
import { SortList, postJson, useToast } from "./SortList";

interface MenuPage { id: string; title: string; slug: string; published: boolean; shown: boolean }
interface Term { id: string; name: string; slug: string; count: number }
interface Props { pages: MenuPage[]; categories: Term[]; tags: Term[] }

export default function MenuTopicsEditor({ pages: initialPages, categories: initialCats, tags: initialTags }: Props) {
  const [pages, setPages] = useState(initialPages);
  const [menuDirty, setMenuDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const saveMenu = async () => {
    setBusy(true); setError("");
    try {
      await postJson("/api/admin/taxonomy", { action: "menu", order: pages.map((p) => p.id), shown: pages.filter((p) => p.shown).map((p) => p.id) });
      setMenuDirty(false);
      toast.show("Menu saved");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="a-cms">
      <section className="a-settings">
        <div className="intro">
          <h2>The menu</h2>
          <p>Your pages, in the order they appear at the top of the website. Essays and the search box are always there too.</p>
        </div>
        <div>
          {pages.length === 0 ? (
            <div className="a-notice">No pages yet. <a href="/admin/pages/new">Make an About page</a> and it will appear here.</div>
          ) : (
            <SortList
              items={pages}
              keyOf={(p) => p.id}
              onChange={(next) => { setPages(next); setMenuDirty(true); }}
              rowClass={(p) => (p.shown && p.published ? "" : "hidden-item")}
              render={(p) => (
                <div className="a-sec-row">
                  <div className="a-sec-main">
                    <div className="nm">{p.title}</div>
                    <div className="hn">/{p.slug}{!p.published && " · Draft — publish it to show it in the menu"}</div>
                  </div>
                  <label className="a-switch">
                    <input type="checkbox" checked={p.shown} onChange={(e) => { setPages(pages.map((x) => (x.id === p.id ? { ...x, shown: e.target.checked } : x))); setMenuDirty(true); }} />
                    <span className="hide-sm">{p.shown ? "In menu" : "Hidden"}</span>
                  </label>
                </div>
              )}
            />
          )}
          {pages.length > 0 && (
            <div className="a-rowbtns">
              {error && <span className="a-inline-err">{error}</span>}
              <button type="button" className="a-btn" disabled={!menuDirty || busy} onClick={saveMenu}>{busy ? "Saving…" : menuDirty ? "Save menu" : "Menu saved"}</button>
            </div>
          )}
        </div>
      </section>

      <TermSection
        kind="category"
        title="Categories"
        intro="Each essay has one. They are listed in the menu under “Topics” and on the home page."
        initial={initialCats}
        onToast={toast.show}
      />
      <TermSection
        kind="tag"
        title="Tags"
        intro="Small keywords that connect related essays. Merge two that mean the same thing."
        initial={initialTags}
        onToast={toast.show}
        compact
      />
      {toast.node}
    </div>
  );
}

function TermSection(props: { kind: "category" | "tag"; title: string; intro: string; initial: Term[]; onToast: (m: string) => void; compact?: boolean }) {
  const { kind } = props;
  const noun = kind === "category" ? "category" : "tag";
  const [items, setItems] = useState(props.initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [into, setInto] = useState("");
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");

  const run = async (body: Record<string, unknown>, done: string) => {
    setError("");
    try {
      const r = await postJson<{ item?: { id: string; name: string; slug: string } }>("/api/admin/taxonomy", { kind, ...body });
      props.onToast(done);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const rename = async (t: Term) => {
    const name = draft.trim();
    if (!name || name === t.name) return setEditing(null);
    const r = await run({ action: "rename", id: t.id, name }, "Renamed");
    if (r) { setItems(items.map((x) => (x.id === t.id ? { ...x, name } : x))); setEditing(null); }
  };
  const remove = async (t: Term) => {
    const msg = t.count
      ? `Delete the ${noun} “${t.name}”? ${t.count} essay${t.count === 1 ? "" : "s"} will ${kind === "category" ? "have no category" : "lose this tag"}. The essays themselves are kept.`
      : `Delete the ${noun} “${t.name}”?`;
    if (!window.confirm(msg)) return;
    if (await run({ action: "delete", id: t.id }, "Deleted")) setItems(items.filter((x) => x.id !== t.id));
  };
  const merge = async (t: Term) => {
    const target = items.find((x) => x.id === into);
    if (!target) return;
    if (!window.confirm(`Move every essay from “${t.name}” into “${target.name}”, then remove “${t.name}”?`)) return;
    if (await run({ action: "merge", id: t.id, into }, "Merged")) {
      setItems(items.filter((x) => x.id !== t.id).map((x) => (x.id === into ? { ...x, count: x.count + t.count } : x)));
      setMerging(null); setInto("");
    }
  };
  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    const r = await run({ action: "create", name }, `Added “${name}”`);
    if (r?.item && !items.some((x) => x.id === r.item!.id)) setItems([...items, { ...r.item, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding("");
  };

  return (
    <section className="a-settings">
      <div className="intro"><h2>{props.title}</h2><p>{props.intro}</p></div>
      <div>
        {items.length === 0 && <div className="a-notice" style={{ marginTop: 0 }}>No {noun === "category" ? "categories" : "tags"} yet.</div>}
        <div className={`a-terms${props.compact ? " compact" : ""}`}>
          {items.map((t) => (
            <div className="a-term" key={t.id}>
              {editing === t.id ? (
                <form className="a-term-edit" onSubmit={(e) => { e.preventDefault(); void rename(t); }}>
                  <input type="text" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} aria-label={`New name for ${t.name}`} />
                  <button type="submit" className="a-btn sm">Save</button>
                  <button type="button" className="a-btn quiet sm" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : merging === t.id ? (
                <div className="a-term-edit">
                  <span className="lbl">Merge “{t.name}” into</span>
                  <select value={into} onChange={(e) => setInto(e.target.value)} aria-label="Merge into">
                    <option value="">Choose…</option>
                    {items.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button type="button" className="a-btn sm" disabled={!into} onClick={() => void merge(t)}>Merge</button>
                  <button type="button" className="a-btn quiet sm" onClick={() => setMerging(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="a-term-name">
                    <a href={`/${kind === "category" ? "category" : "tag"}/${t.slug}`} target="_blank" rel="noopener">{t.name}</a>
                    <span className="n">{t.count} essay{t.count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="a-term-acts">
                    <button type="button" className="a-btn quiet sm" onClick={() => { setEditing(t.id); setDraft(t.name); setMerging(null); }}>Rename</button>
                    {items.length > 1 && <button type="button" className="a-btn quiet sm" onClick={() => { setMerging(t.id); setInto(""); setEditing(null); }}>Merge</button>}
                    <button type="button" className="a-btn quiet sm icon" onClick={() => void remove(t)} aria-label={`Delete ${t.name}`} title="Delete"><Icon name="trash" size={16} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <form className="a-term-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input type="text" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`Add a new ${noun}…`} maxLength={60} />
          <button type="submit" className="a-btn ghost" disabled={!adding.trim()}><Icon name="plus" size={16} /> Add</button>
        </form>
        {error && <div className="a-notice err">{error}</div>}
      </div>
    </section>
  );
}
