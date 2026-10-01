import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Icon } from "./Icon";
import { pickImages, type GalleryImage } from "./extensions";

/** A grid of pictures: add more, remove one, move one earlier, change columns. */
export function GalleryView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const images = (node.attrs.images ?? []) as GalleryImage[];
  const columns = Number(node.attrs.columns) || 3;
  const caption = String(node.attrs.caption ?? "");

  const add = async () => {
    const picked = await pickImages(editor, { multiple: true, title: "Add pictures to the gallery" });
    if (picked?.length) updateAttributes({ images: [...images, ...picked] });
  };
  const remove = (i: number) => {
    const next = images.filter((_, j) => j !== i);
    if (next.length === 0) deleteNode();
    else updateAttributes({ images: next });
  };
  const moveEarlier = (i: number) => {
    if (i === 0) return;
    const next = [...images];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    updateAttributes({ images: next });
  };

  return (
    <NodeViewWrapper className={`ed-gallery${selected ? " is-selected" : ""}`} data-type="gallery" data-columns={columns}>
      <div className="ed-gallery-wrap" data-drag-handle>
        <div className="ed-blockbar" data-node-ui contentEditable={false}>
          {[2, 3, 4].map((n) => (
            <button key={n} type="button" className={`txt${columns === n ? " on" : ""}`} onClick={() => updateAttributes({ columns: n })} title={`${n} pictures per row`}>
              {n} per row
            </button>
          ))}
          <span className="sep" />
          <button type="button" className="txt" onClick={add}><Icon name="plus" size={16} /> Add pictures</button>
          <span className="sep" />
          <button type="button" className="txt danger" onClick={() => deleteNode()}><Icon name="trash" size={16} /> Remove gallery</button>
        </div>
        <div className="ed-gallery-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {images.map((img, i) => (
            <div className="ed-gallery-cell" key={`${img.src}-${i}`}>
              <img src={img.src} alt={img.alt} draggable={false} />
              <div className="ed-cell-acts" data-node-ui contentEditable={false}>
                {i > 0 && (
                  <button type="button" title="Move earlier" aria-label="Move earlier" onClick={() => moveEarlier(i)}>
                    <Icon name="back" size={14} />
                  </button>
                )}
                <button type="button" title="Remove this picture" aria-label="Remove this picture" onClick={() => remove(i)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <input
        className="ed-caption"
        type="text"
        value={caption}
        placeholder="Add a caption for the gallery (optional)"
        onChange={(e) => updateAttributes({ caption: e.target.value })}
      />
    </NodeViewWrapper>
  );
}
