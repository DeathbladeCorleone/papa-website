import { useState, type ReactNode } from "react";
import { Icon } from "../editor/Icon";

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  onChange: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  /** Extra class per row (e.g. for hidden items). */
  rowClass?: (item: T) => string;
}

/** A vertical list you can reorder by dragging the grip or with the arrow buttons. */
export function SortList<T>({ items, keyOf, onChange, render, rowClass }: Props<T>) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };
  return (
    <div className="a-drag">
      {items.map((item, i) => (
        <div
          key={keyOf(item)}
          className={`a-drag-item ${rowClass?.(item) ?? ""}${drag === i ? " dragging" : ""}${over === i && drag !== null && drag !== i ? " over" : ""}`}
          draggable
          onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); setOver(i); }}
          onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
        >
          <span className="grip" title="Drag to move"><Icon name="grip" /></span>
          <div style={{ minWidth: 0 }}>{render(item, i)}</div>
          <div className="ctl a-arrows">
            <button type="button" className="a-btn quiet sm icon" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up" title="Move up"><Icon name="arrowUp" size={16} /></button>
            <button type="button" className="a-btn quiet sm icon" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down" title="Move down"><Icon name="arrowDown" size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

export async function postJson<T = { ok?: boolean; error?: string }>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new Error("You've been signed out. Please sign in again.");
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status})`);
  return data;
}

/** A small "Saved" toast that fades by itself. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null);
  const show = (text: string) => setMsg((m) => ({ text, n: (m?.n ?? 0) + 1 }));
  const node = msg ? <div key={msg.n} className="a-toast" role="status"><Icon name="check" size={16} />{msg.text}</div> : null;
  return { show, node };
}
