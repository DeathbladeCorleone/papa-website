// Rough user-agent filter so crawlers and link previews (WhatsApp, X, Slack…)
// don't inflate "Most read" view counts. Missing UA counts as a bot.
const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|curl|wget|python|httpclient|okhttp|axios|node-fetch|headless|lighthouse|pingdom|uptime/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua === "" || BOT_RE.test(ua);
}
