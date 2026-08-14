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
});
