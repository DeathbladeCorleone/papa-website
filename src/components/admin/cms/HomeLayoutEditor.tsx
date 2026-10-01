import { useState } from "react";
import { Icon } from "../editor/Icon";
import { MediaPicker } from "../editor/MediaPicker";
import { SortList, postJson, useToast } from "./SortList";
import { HOME_SECTION_INFO } from "@/lib/domain/home";
import type { HomeLayout, HomeSection } from "@/lib/domain/types";

interface EssayOption { id: string; title: string; coverUrl: string | null; date: string }
interface Props { layout: HomeLayout; essays: EssayOption[]; featuredId: string | null; authorPhotoUrl: string | null; initials: string }

export default function HomeLayoutEditor({ layout: initial, essays, featuredId: initialFeatured, authorPhotoUrl, initials }: Props) {
  const [photo, setPhoto] = useState(authorPhotoUrl ?? "");
  const [picking, setPicking] = useState(false);
  const [layout, setLayout] = useState(initial);
  const [featuredId, setFeaturedId] = useState(initialFeatured ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const change = (patch: Partial<HomeLayout>) => { setLayout((l) => ({ ...l, ...patch })); setDirty(true); };
  const setSection = (key: HomeSection["key"], patch: Partial<HomeSection>) =>
    change({ sections: layout.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const hero = essays.find((e) => e.id === featuredId) ?? essays[0];

  const save = async () => {
    setBusy(true); setError("");
    try {
      await postJson("/api/admin/homepage", { layout, featuredId: featuredId || null, authorPhotoUrl: photo || null });
      setDirty(false);
      toast.show("Home page saved");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="a-cms">
      <section className="a-settings">
        <div className="intro">
          <h2>The big essay at the top</h2>
          <p>The first thing visitors see, with its cover picture filling the screen.</p>
        </div>
        <div className="a-form">
          <div className="a-field">
            <label htmlFor="hero">Which essay?</label>
            <select id="hero" value={featuredId} onChange={(e) => { setFeaturedId(e.target.value); setDirty(true); }}>
              <option value="">Always the newest essay</option>
              {essays.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <div className="hint">“Always the newest” changes by itself each time you publish.</div>
          </div>
          {hero ? (
            <div className="a-hero-preview">
              {hero.coverUrl ? <img src={hero.coverUrl} alt="" /> : <div className="noimg">No cover picture — the top will be a plain dark panel. Add one in the essay's settings.</div>}
              <div className="cap"><span>{featuredId ? "Chosen essay" : "Newest essay"}</span><b>{hero.title}</b></div>
            </div>
          ) : (
            <div className="a-notice">Once you publish an essay, it will appear here.</div>
          )}
        </div>
      </section>

      <section className="a-settings">
        <div className="intro">
          <h2>Sections below it</h2>
          <p>Drag to change the order, switch off what you don't want, and rename the headings.</p>
        </div>
        <div>
          <SortList
            items={layout.sections}
            keyOf={(s) => s.key}
            onChange={(sections) => change({ sections })}
            rowClass={(s) => (s.visible ? "" : "hidden-item")}
            render={(s) => {
              const info = HOME_SECTION_INFO[s.key];
              return (
                <div className="a-sec-row">
                  <div className="a-sec-main">
                    {info.titled ? (
                      <input
                        type="text"
                        className="a-sec-title"
                        value={s.title}
                        maxLength={60}
                        aria-label={`Heading for ${info.name}`}
                        onChange={(e) => setSection(s.key, { title: e.target.value })}
                        disabled={!s.visible}
                      />
                    ) : (
                      <div className="nm">{info.name}</div>
                    )}
                    <div className="hn">{info.titled && s.title.trim() !== info.name ? `${info.name} · ` : ""}{info.hint}</div>
                  </div>
                  {s.key === "about" && (
                    <div className="a-about-photo">
                      <button type="button" className="ph" onClick={() => setPicking(true)} title={photo ? "Change the photo" : "Add a photo"}>
                        {photo ? <img src={photo} alt="" /> : <span>{initials}</span>}
                      </button>
                      <div className="acts">
                        <button type="button" className="a-btn ghost sm" onClick={() => setPicking(true)}>{photo ? "Change photo" : "Add photo"}</button>
                        {photo && <button type="button" className="a-btn quiet sm" onClick={() => { setPhoto(""); setDirty(true); }}>Remove</button>}
                      </div>
                    </div>
                  )}
                  {(s.key === "mostRead" || s.key === "latest") && s.visible && (
                    <label className="a-count">
                      <span>Show</span>
                      <select
                        value={s.key === "mostRead" ? layout.mostReadCount : layout.latestCount}
                        onChange={(e) => change(s.key === "mostRead" ? { mostReadCount: Number(e.target.value) } : { latestCount: Number(e.target.value) })}
                      >
                        {(s.key === "mostRead" ? [2, 3, 4, 5, 6, 8] : [2, 3, 4, 6, 9]).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="a-switch" title={s.visible ? "Shown on the home page" : "Hidden"}>
                    <input type="checkbox" checked={s.visible} onChange={(e) => setSection(s.key, { visible: e.target.checked })} />
                    <span className="hide-sm">{s.visible ? "Shown" : "Hidden"}</span>
                  </label>
                </div>
              );
            }}
          />
          <p className="a-footnote">The footer with your name always stays at the bottom.</p>
        </div>
      </section>

      <div className="a-savebar">
        {error && <span className="a-inline-err">{error}</span>}
        <a className="a-btn ghost" href="/" target="_blank" rel="noopener"><Icon name="external" size={16} /> View home page</a>
        <button type="button" className="a-btn" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
      </div>
      {picking && (
        <MediaPicker
          title="Choose your photo"
          onClose={() => setPicking(false)}
          onPick={(imgs) => { if (imgs[0]) { setPhoto(imgs[0].src); setDirty(true); } setPicking(false); }}
        />
      )}
      {toast.node}
    </div>
  );
}
