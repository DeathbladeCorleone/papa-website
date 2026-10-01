import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { Icon } from "./Icon";
import type { IconName } from "../icons";
import { pickImages } from "./extensions";

const ALIGNS: { v: string; icon: IconName; label: string }[] = [
  { v: "left", icon: "imgLeft", label: "Left, text wraps around" },
  { v: "center", icon: "imgCenter", label: "Centred" },
  { v: "right", icon: "imgRight", label: "Right, text wraps around" },
  { v: "wide", icon: "imgWide", label: "Wide, wider than the text" },
];
const SIZES = [
  { v: "s", label: "Small" },
  { v: "m", label: "Medium" },
  { v: "l", label: "Large" },
];

/** A picture in the editor: click it for a toolbar (remove, replace, layout, size, description). */
export function FigureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { src, alt, caption, align, size, uploadId } = node.attrs as {
    src: string; alt: string; caption: string; align: string; size: string; uploadId: string | null;
  };
  const [altOpen, setAltOpen] = useState(false);
  const uploading = Boolean(uploadId);

  const replace = async () => {
    const picked = await pickImages(editor, { title: "Replace picture" });
    if (picked?.[0]) updateAttributes({ src: picked[0].src, alt: picked[0].alt || alt });
  };

  return (
    <NodeViewWrapper
      as="figure"
      className={`ed-figure${selected ? " is-selected" : ""}${uploading ? " is-uploading" : ""}`}
      data-type="image"
      data-align={align}
      data-size={size}
    >
      <div className="ed-fig-media" data-drag-handle>
        <img src={src} alt={alt} draggable={false} />
        {uploading && <div className="ed-fig-busy"><span className="ed-spin" /> Uploading…</div>}

        {!uploading && (
          <div className="ed-blockbar" data-node-ui contentEditable={false}>
            {ALIGNS.map((a) => (
              <button
                key={a.v}
                type="button"
                className={align === a.v ? "on" : ""}
                title={a.label}
                aria-label={a.label}
                onClick={() => updateAttributes({ align: a.v })}
              >
                <Icon name={a.icon} size={17} />
              </button>
            ))}
            {align === "center" && (
              <>
                <span className="sep" />
                {SIZES.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    className={`txt${size === s.v ? " on" : ""}`}
                    title={`${s.label} picture`}
                    onClick={() => updateAttributes({ size: s.v })}
                  >
                    {s.v.toUpperCase()}
                  </button>
                ))}
              </>
            )}
            <span className="sep" />
            <button type="button" className="txt" onClick={() => setAltOpen((v) => !v)} title="Describe the picture for blind readers and Google">
              <Icon name="alt" size={16} /> Description
            </button>
            <button type="button" className="txt" onClick={replace} title="Choose a different picture">
              <Icon name="replace" size={16} /> Replace
            </button>
            <span className="sep" />
            <button type="button" className="txt danger" onClick={() => deleteNode()} title="Remove this picture from the essay">
              <Icon name="trash" size={16} /> Remove
            </button>
          </div>
        )}

        {altOpen && (
          <div className="ed-pop ed-alt" data-node-ui contentEditable={false}>
            <label>
              <span>Describe this picture</span>
              <input
                type="text"
                autoFocus
                value={alt}
                placeholder="e.g. Morning fog over the paddy fields"
                onChange={(e) => updateAttributes({ alt: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setAltOpen(false); } }}
              />
            </label>
            <button type="button" className="ed-mini" onClick={() => setAltOpen(false)}>Done</button>
          </div>
        )}
      </div>
      <input
        className="ed-caption"
        type="text"
        value={caption}
        placeholder="Add a caption (optional)"
        onChange={(e) => updateAttributes({ caption: e.target.value })}
        onKeyDown={(e) => {
          // Enter leaves the caption and continues writing below the picture.
          if (e.key === "Enter") {
            e.preventDefault();
            const pos = typeof getPos === "function" ? getPos() : undefined;
            if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).createParagraphNear().run();
          }
        }}
      />
    </NodeViewWrapper>
  );
}
