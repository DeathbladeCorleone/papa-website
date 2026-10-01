import { describe, it, expect } from "vitest";
import { isLikelyBot } from "./bots";

describe("isLikelyBot", () => {
  it("flags crawlers, previews and tools", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23.20.0",
      "Twitterbot/1.0",
      "curl/8.4.0",
      "python-requests/2.31",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Slackbot-LinkExpanding 1.0",
      "",
    ]) {
      expect(isLikelyBot(ua), ua).toBe(true);
    }
  });
  it("lets real browsers through", () => {
    for (const ua of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ]) {
      expect(isLikelyBot(ua), ua).toBe(false);
    }
  });
});
