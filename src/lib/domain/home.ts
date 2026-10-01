import type { HomeLayout, HomeSection, HomeSectionKey } from "./types";

/** Human names for the dashboard. */
export const HOME_SECTION_INFO: Record<HomeSectionKey, { name: string; hint: string; titled: boolean }> = {
  mostRead: { name: "Most read", hint: "Your most-viewed essays, numbered", titled: true },
  subscribe: { name: "Subscribe box", hint: "Lets readers leave their email", titled: false },
  about: { name: "About me", hint: "Your portrait and the opening of the About page", titled: true },
  latest: { name: "Latest", hint: "The newest essays with their pictures", titled: true },
  topics: { name: "Topics", hint: "Links to every category", titled: true },
};

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  sections: [
    { key: "mostRead", visible: true, title: "Most read" },
    { key: "subscribe", visible: true, title: "Subscribe" },
    { key: "about", visible: true, title: "About me" },
    { key: "latest", visible: true, title: "Latest" },
    { key: "topics", visible: true, title: "Wander" },
  ],
  mostReadCount: 4,
  latestCount: 3,
};

const KEYS = DEFAULT_HOME_LAYOUT.sections.map((s) => s.key);
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Turn whatever is stored (JSON text, an object, or nothing) into a complete,
 * valid layout: unknown keys dropped, duplicates removed, missing sections
 * appended in their default position, counts clamped.
 */
export function normalizeHomeLayout(input: unknown): HomeLayout {
  let raw: unknown = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<HomeLayout>;
  const seen = new Set<HomeSectionKey>();
  const sections: HomeSection[] = [];
  for (const s of Array.isArray(obj.sections) ? obj.sections : []) {
    if (!s || !KEYS.includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    const def = DEFAULT_HOME_LAYOUT.sections.find((d) => d.key === s.key)!;
    const title = typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 60) : def.title;
    sections.push({ key: s.key, visible: s.visible !== false, title });
  }
  for (const def of DEFAULT_HOME_LAYOUT.sections) if (!seen.has(def.key)) sections.push({ ...def });
  return {
    sections,
    mostReadCount: clampInt(obj.mostReadCount, 2, 8, DEFAULT_HOME_LAYOUT.mostReadCount),
    latestCount: clampInt(obj.latestCount, 2, 9, DEFAULT_HOME_LAYOUT.latestCount),
  };
}
