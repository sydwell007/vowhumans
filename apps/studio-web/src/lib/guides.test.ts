import { describe, expect, it } from "vitest";
import { WORKFORCE_BUILDER_STEPS } from "@vowhumans/commercial-core/workforce";
import { getGuide, guides, guidesForRole } from "./guides";

const KNOWN_ROLES = ["owner", "admin", "operator", "reviewer", "viewer"];

describe("guide content contracts", () => {
  it("ships exactly the five guides this phase promises", () => {
    expect(guides.map((g) => g.id).sort()).toEqual([
      "connect-application",
      "digital-colleague-flagship",
      "digital-human-flagship",
      "work-products-basics",
      "work-queue-basics",
    ]);
  });

  it("has no duplicate guide ids", () => {
    expect(new Set(guides.map((g) => g.id)).size).toBe(guides.length);
  });

  it("gives every guide at least one step", () => {
    for (const guide of guides) expect(guide.steps.length).toBeGreaterThan(0);
  });

  it("keeps every guide's role list a subset of the real five-role system", () => {
    for (const guide of guides) for (const role of guide.roles) expect(KNOWN_ROLES).toContain(role);
  });

  it("never leaves a validated step without a real target, except explicitly manual steps", () => {
    for (const guide of guides) {
      for (const step of guide.steps) {
        if (step.validation.kind === "manual") continue;
        expect(step.target).not.toBeNull();
        expect(step.target?.selector.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate step ids within a single guide", () => {
    for (const guide of guides) {
      const ids = guide.steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("walks the Digital Colleague builder in the real 12-step order", () => {
    const guide = getGuide("digital-colleague-flagship")!;
    const builderStepIds = guide.steps.map((s) => s.id).filter((id) => id.startsWith("wf-builder-step-"));
    expect(builderStepIds).toEqual(WORKFORCE_BUILDER_STEPS.map((step) => `wf-builder-step-${step}`));
  });

  it("resolves navigation for every step whose validation is navigation-kind", () => {
    for (const guide of guides) {
      for (const step of guide.steps) {
        if (step.validation.kind === "navigation") expect(typeof step.validation.test).toBe("function");
      }
    }
  });
});

describe("guidesForRole", () => {
  it("surfaces Work Products basics first for a reviewer", () => {
    const forReviewer = guidesForRole("reviewer");
    expect(forReviewer[0]?.id).toBe("work-products-basics");
  });
  it("excludes owner/admin/operator-only guides for a viewer", () => {
    const forViewer = guidesForRole("viewer");
    expect(forViewer.some((g) => g.id === "digital-colleague-flagship")).toBe(false);
  });
  it("gives an unknown role no guides rather than throwing", () => {
    expect(guidesForRole("not-a-real-role")).toEqual([]);
  });
});
