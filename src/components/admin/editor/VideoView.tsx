import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Icon } from "./Icon";
import { youtubeId } from "./extensions";

/** A YouTube video in the editor. A transparent shield lets one click select it instead of playing it. */
export function VideoView({ node, deleteNode, selected }: NodeViewProps) {
  const id = youtubeId(String(node.attrs.src ?? ""));
  return (
    <NodeViewWrapper className={`ed-video${selected ? " is-selected" : ""}`} data-youtube-video="">
      <div className="ed-video-frame" data-drag-handle>
        {id ? (
          <iframe src={`https://www.youtube.com/embed/${id}`} title="YouTube video" loading="lazy" allowFullScreen />
        ) : (
          <div className="ed-video-bad">This doesn't look like a YouTube link.</div>
        )}
        <div className="ed-video-shield" />
        <div className="ed-blockbar" data-node-ui contentEditable={false}>
          <span className="lbl"><Icon name="video" size={16} /> YouTube video</span>
          <span className="sep" />
          <button type="button" className="txt danger" onClick={() => deleteNode()}><Icon name="trash" size={16} /> Remove video</button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
