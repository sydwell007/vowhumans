import { afterEach, describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("canonical sitemap", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("never publishes localhost URLs from deployment environment variables", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.every((entry) => entry.url.startsWith("https://vowhumans.com/"))).toBe(true);
    expect(entries.some((entry) => entry.url.includes("localhost"))).toBe(false);
  });
});
