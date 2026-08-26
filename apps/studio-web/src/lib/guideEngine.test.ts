import { describe, expect, it } from "vitest";
import { computeDigitalColleagueSetupProgress, computeDigitalHumanSetupProgress, nextBestAction, resolveGuideTarget } from "./guideEngine";

const fullHuman = {
  identity: { name: "Naledi", role: "Support", disclosure: "AI-generated." },
  hasFace: true,
  hasVoice: true,
  knowledgeCount: 1,
  personaState: "published",
  hasGestureProfile: true,
  enabledApplicationCount: 1,
};

describe("computeDigitalHumanSetupProgress", () => {
  it("mirrors WizardReviewStep's seven checks and reaches 100% when all pass", () => {
    const result = computeDigitalHumanSetupProgress(fullHuman);
    expect(result.checks).toHaveLength(7);
    expect(result.score).toBe(100);
    expect(result.complete).toBe(true);
  });
  it("never reports complete when a real requirement is missing", () => {
    const result = computeDigitalHumanSetupProgress({ ...fullHuman, personaState: "draft" });
    expect(result.complete).toBe(false);
    expect(result.checks.find((c) => c.label === "Published Persona linked")?.ready).toBe(false);
  });
  it("requires disclosure text, not just a name, for the identity check", () => {
    const result = computeDigitalHumanSetupProgress({ ...fullHuman, identity: { name: "Naledi", role: "Support", disclosure: "" } });
    expect(result.checks.find((c) => c.label === "Disclosed identity")?.ready).toBe(false);
  });
});

describe("computeDigitalColleagueSetupProgress", () => {
  const checks = [
    { code: "role", label: "Role", passed: true },
    { code: "guardrails", label: "Guardrails", passed: true },
  ];
  it("adds deployment and first-work-item as real checks alongside readiness", () => {
    const result = computeDigitalColleagueSetupProgress({ readinessChecks: checks, isDeployed: true, hasWorkItems: true });
    expect(result.checks).toHaveLength(4);
    expect(result.score).toBe(100);
  });
  it("stays incomplete when deployed but no work has run yet", () => {
    const result = computeDigitalColleagueSetupProgress({ readinessChecks: checks, isDeployed: true, hasWorkItems: false });
    expect(result.complete).toBe(false);
  });
});

describe("nextBestAction", () => {
  it("prioritises a blocked identity above everything else", () => {
    const result = nextBestAction({ digitalHumanCount: 0, digitalColleagueCount: 0, blockedIdentityCount: 2, deployedColleaguesWithNoWorkItems: 0, workProductsAwaitingReview: 0 });
    expect(result?.href).toBe("/studio/identity-consent");
  });
  it("suggests the Digital Human flagship guide for a zero-data org", () => {
    const result = nextBestAction({ digitalHumanCount: 0, digitalColleagueCount: 0, blockedIdentityCount: 0, deployedColleaguesWithNoWorkItems: 0, workProductsAwaitingReview: 0 });
    expect(result?.guideId).toBe("digital-human-flagship");
  });
  it("surfaces awaiting review before nudging a new Digital Colleague", () => {
    const result = nextBestAction({ digitalHumanCount: 1, digitalColleagueCount: 0, blockedIdentityCount: 0, deployedColleaguesWithNoWorkItems: 0, workProductsAwaitingReview: 3 });
    expect(result?.guideId).toBe("work-products-basics");
  });
  it("returns null once real state gives nothing actionable", () => {
    const result = nextBestAction({ digitalHumanCount: 1, digitalColleagueCount: 1, blockedIdentityCount: 0, deployedColleaguesWithNoWorkItems: 0, workProductsAwaitingReview: 0 });
    expect(result).toBeNull();
  });
});

describe("resolveGuideTarget", () => {
  it("never requests navigation for a target without a page (contextual target)", () => {
    expect(resolveGuideTarget({ selector: "wf-builder-step-role" }, "/studio/workforce/abc/role")).toEqual({ needsNavigation: false, page: null });
  });
  it("requests navigation only when the current pathname differs", () => {
    expect(resolveGuideTarget({ selector: "dh-new", page: "/studio/digital-humans" }, "/studio")).toEqual({ needsNavigation: true, page: "/studio/digital-humans" });
    expect(resolveGuideTarget({ selector: "dh-new", page: "/studio/digital-humans" }, "/studio/digital-humans")).toEqual({ needsNavigation: false, page: "/studio/digital-humans" });
  });
  it("returns no navigation for a null target", () => {
    expect(resolveGuideTarget(null, "/studio")).toEqual({ needsNavigation: false, page: null });
  });
});
