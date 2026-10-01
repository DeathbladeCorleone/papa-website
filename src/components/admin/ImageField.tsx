import { useState } from "react";
import { MediaPicker } from "./editor/MediaPicker";
import { Icon } from "./editor/Icon";

interface Props {
  /** Form field name holding the image URL. */
  name: string;
  initialUrl?: string | null;
  /** Shown under the picker, e.g. what the image is used for. */
  hint?: string;
  /** Preview aspect ratio, e.g. "16 / 9" or "4 / 5". */
  aspect?: string;
  title?: string;
}

/** Choose (upload or pick from Photos), replace or remove one picture; its URL goes in a hidden input. */
export default function ImageField({ name, initialUrl = "", hint, aspect = "16 / 9", title = "Choose a picture" }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [open, setOpen] = useState(false);
  return (
    <div className="a-imagefield">
      <button type="button" className="a-imagefield-preview" style={{ aspectRatio: aspect }} onClick={() => setOpen(true)} aria-label={url ? "Change picture" : title}>
        {url ? <img src={url} alt="" /> : <span><Icon name="image" size={22} /> No picture yet</span>}
      </button>
      <div className="a-imagefield-acts">
        <button type="button" className="a-btn ghost sm" onClick={() => setOpen(true)}>
          <Icon name={url ? "replace" : "upload"} size={16} /> {url ? "Change" : title}
        </button>
        {url && (
          <button type="button" className="a-btn quiet sm" onClick={() => setUrl("")}>
            <Icon name="trash" size={16} /> Remove
          </button>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      <input type="hidden" name={name} value={url} />
      {open && (
        <MediaPicker
          title={title}
          onClose={() => setOpen(false)}
          onPick={(imgs) => { if (imgs[0]) setUrl(imgs[0].src); setOpen(false); }}
        />
      )}
    </div>
  );
}
