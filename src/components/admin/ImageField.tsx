import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client/image";

interface Props {
  /** Form field name holding the image URL. */
  name: string;
  initialUrl?: string | null;
  /** Shown under the picker, e.g. what the image is used for. */
  hint?: string;
  /** Preview aspect ratio, e.g. "16 / 9" or "4 / 5". */
  aspect?: string;
}

/** Upload / replace / remove a single image; stores its URL in a hidden input. */
export default function ImageField({ name, initialUrl = "", hint, aspect = "16 / 9" }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setBusy(true);
    setError("");
    try {
      setUrl(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const button: React.CSSProperties = {
    fontFamily: "var(--sans)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
    padding: "8px 14px", border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", cursor: "pointer",
  };

  return (
    <div>
      <div
        style={{
          aspectRatio: aspect, maxWidth: 420, border: "1px solid var(--rule)", background: url ? "var(--paper)" : "repeating-linear-gradient(135deg, #efe8da 0 8px, #faf7f0 8px 16px)",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        }}
      >
        {url ? (
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-faint)" }}>{busy ? "Uploading…" : "No image yet"}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={button} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Uploading…" : url ? "Replace image" : "Upload image"}
        </button>
        {url && !busy && (
          <button type="button" style={{ ...button, borderColor: "var(--rule-strong)", color: "var(--ink-soft)" }} onClick={() => setUrl("")}>
            Remove
          </button>
        )}
        {hint && <span style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-faint)" }}>{hint}</span>}
      </div>
      {error && <p className="notice err" style={{ marginTop: 8 }}>{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
