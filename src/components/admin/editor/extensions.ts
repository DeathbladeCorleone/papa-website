import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CharacterCount from "@tiptap/extension-character-count";
import Typography from "@tiptap/extension-typography";
import { FigureView } from "./FigureView";
import { GalleryView } from "./GalleryView";
import { VideoView } from "./VideoView";

export type FigureAlign = "left" | "center" | "right" | "wide";
export type FigureSize = "s" | "m" | "l";
export interface GalleryImage { src: string; alt: string }

/** Let typing/clicking inside a node view's own inputs and buttons reach them, not ProseMirror. */
const stopEvent = ({ event }: { event: Event }) => {
  const t = event.target as HTMLElement | null;
  return Boolean(t?.closest?.("input, textarea, button, select, [data-node-ui]"));
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs: { src: string; alt?: string; uploadId?: string | null }) => ReturnType;
    };
    gallery: {
      insertGallery: (attrs: { images: GalleryImage[]; columns?: number }) => ReturnType;
    };
    callout: {
      toggleCallout: () => ReturnType;
    };
  }
}

/**
 * A picture with an optional caption, alignment and size.
 * HTML: <figure data-type="image" data-align data-size><img><figcaption>
 * Also reads the old editor's bare <img data-align> so existing essays keep their pictures.
 */
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      align: { default: "center" as FigureAlign },
      size: { default: "l" as FigureSize },
      // Client-only: marks a picture still uploading (never written to HTML).
      uploadId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="image"]',
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const img = node.querySelector("img");
          if (!img) return false;
          return {
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? "",
            caption: node.querySelector("figcaption")?.textContent ?? "",
            align: node.getAttribute("data-align") ?? "center",
            size: node.getAttribute("data-size") ?? "l",
          };
        },
      },
      {
        // Pictures from the first editor: <img data-align="left|center|right|full">
        tag: "img[src]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const old = node.getAttribute("data-align") ?? "center";
          return {
            src: node.getAttribute("src") ?? "",
            alt: node.getAttribute("alt") ?? "",
            align: old === "full" ? "center" : old,
            size: old === "full" ? "l" : "m",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, caption, align, size } = node.attrs;
    const children: unknown[] = [["img", { src, alt, loading: "lazy" }]];
    if (caption) children.push(["figcaption", {}, caption]);
    return ["figure", { "data-type": "image", "data-align": align, "data-size": size }, ...children] as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView, { stopEvent });
  },

  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { align: "center", size: "l", ...attrs } }),
    };
  },
});

/** Several pictures in a tidy grid. HTML: <div data-type="gallery" data-columns="3"><figure><img>… */
export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      images: { default: [] as GalleryImage[] },
      columns: { default: 3 },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="gallery"]',
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const images = [...node.querySelectorAll("img")].map((img) => ({
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? "",
          }));
          return {
            images,
            columns: Number(node.getAttribute("data-columns")) || 3,
            caption: node.querySelector(":scope > figcaption")?.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const images = (node.attrs.images as GalleryImage[]).map((i) => ["figure", {}, ["img", { src: i.src, alt: i.alt, loading: "lazy" }]]);
    const caption = node.attrs.caption ? [["figcaption", {}, node.attrs.caption]] : [];
    return ["div", { "data-type": "gallery", "data-columns": String(node.attrs.columns) }, ...images, ...caption] as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView, { stopEvent });
  },

  addCommands() {
    return {
      insertGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { columns: Math.min(3, Math.max(2, attrs.images.length)), ...attrs } }),
    };
  },
});

/** A highlighted note box. HTML: <aside data-type="callout"><p>… */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },
  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ editor, commands }) =>
          editor.isActive(this.name) ? commands.lift(this.name) : commands.wrapIn(this.name),
    };
  },
});

export interface PickOptions {
  multiple?: boolean;
  title?: string;
}
/** Bridges node views (image Replace, gallery Add) to the editor's photo picker. */
export interface UiBridgeStorage {
  pickImages: ((opts?: PickOptions) => Promise<GalleryImage[] | null>) | null;
}
export const UiBridge = Extension.create<unknown, UiBridgeStorage>({
  name: "uiBridge",
  addStorage() {
    return { pickImages: null };
  },
});
export function pickImages(editor: { storage: Record<string, unknown> }, opts?: PickOptions) {
  const fn = (editor.storage.uiBridge as UiBridgeStorage | undefined)?.pickImages;
  return fn ? fn(opts) : Promise.resolve(null);
}

/** YouTube with an editor-friendly view (click selects it; a Remove button is always there). */
const Video = Youtube.extend({
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(VideoView, { stopEvent });
  },
});

export function editorExtensions(placeholder: string) {
  return [
    StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false }),
    Underline,
    Highlight,
    Typography,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener", target: null },
    }),
    Figure,
    Gallery,
    Callout,
    Video.configure({ width: 640, height: 360, nocookie: false, modestBranding: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    CharacterCount,
    UiBridge,
    Placeholder.configure({
      showOnlyCurrent: true,
      includeChildren: false,
      placeholder: ({ node, editor }) => {
        if (node.type.name === "heading") return node.attrs.level === 2 ? "Heading" : "Subheading";
        return editor.isEmpty ? placeholder : "Type / to add a picture, quote, video and more";
      },
    }),
  ];
}

/** YouTube video id from any common link form, or null. */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
