import { describe, expect, it } from "vitest";
import { humans, navigation } from "./platform";

describe("Studio seed contracts", () => {
  it("labels every digital human as AI generated", () => {
    expect(humans.every((human) => /AI-generated/i.test(human.disclosure))).toBe(true);
  });
  it("includes only fictional placeholders", () => {
    expect(humans).toHaveLength(5);
    expect(humans.filter((human) => human.name === "Thandi Mokoena" || human.name === "Sipho Daniels")).toHaveLength(2);
  });
  it("exposes governance navigation", () => expect(navigation.flatMap((group) => group.items).some((item) => item.label === "Identity & Consent")).toBe(true));

  // Regression guard for a real past bug: an assignment dropdown once listed
  // this static catalogue alongside real per-organisation digital_humans under
  // identical display names, and a catalogue slug (e.g. "thandi-mokoena") could
  // be picked and silently go nowhere, since every real feature (including the
  // new multilingual digital-human-languages endpoint) joins on a real UUID
  // digital_humans.id, never this catalogue's readable-slug id. Asserting the
  // id shape stays structurally distinct is a cheap, durable guard against
  // reintroducing that confusion in any future assignment-style UI.
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  it("keeps the demo catalogue's ids as readable slugs, never UUID-shaped like a real digital_humans.id", () => {
    expect(humans.every((human) => !UUID_PATTERN.test(human.id))).toBe(true);
  });
});
