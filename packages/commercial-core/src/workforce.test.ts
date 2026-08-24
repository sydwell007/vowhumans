import { describe, expect, it } from "vitest";
import { WORKFORCE_BUILDER_STEPS, autonomyAllowedForRisk, decideWorkforceAction, evaluateWorkforceReadiness, workforceTemplateBySlug, workforceTemplates } from "./workforce.js";

const readyInput = {
  name: "Naledi",
  roleTitle: "Customer Service Colleague",
  purpose: "Resolve approved service requests and escalate exceptions.",
  digitalHumanId: "human-1",
  personaVersionId: "persona-version-1",
  personaPublished: true,
  functionCount: 2,
  skillCount: 3,
  workflowCount: 1,
  objectiveCount: 1,
  guardrailCount: 3,
  escalationConfigured: true,
  requiredKnowledgeCount: 1,
  activeKnowledgeCount: 1,
  requiredToolCount: 1,
  approvedToolCount: 1,
  testCount: 4,
  passingTestCount: 4,
  approvalCount: 1,
  riskLevel: "medium" as const,
  autonomyLevel: 2 as const,
};

describe("digital workforce contracts", () => {
  it("keeps the governed builder at exactly 12 ordered controls", () => {
    expect(WORKFORCE_BUILDER_STEPS).toEqual([
      "role", "functions", "skills", "knowledge", "tools", "workflows",
      "objectives", "guardrails", "collaboration", "testing", "approval", "deployment",
    ]);
  });
  it("keeps a useful role catalogue", () => expect(workforceTemplates.length).toBeGreaterThanOrEqual(20));
  it("provides the AI receptionist template", () => expect(workforceTemplateBySlug("ai-receptionist")?.functions.length).toBeGreaterThan(1));
  it("blocks deployment until every readiness check and an approval pass", () => {
    const result = evaluateWorkforceReadiness({ ...readyInput, approvalCount: 0 });
    expect(result.readyForReview).toBe(true);
    expect(result.readyForDeployment).toBe(false);
  });
  it("allows a fully governed colleague to deploy", () => expect(evaluateWorkforceReadiness(readyInput).readyForDeployment).toBe(true));
  it("requires a published Persona, not just a Persona id", () => expect(evaluateWorkforceReadiness({ ...readyInput, personaPublished: false }).blockers.map((item) => item.code)).toContain("persona"));
  it("caps autonomy for high-risk and regulated work", () => {
    expect(autonomyAllowedForRisk(3, "high")).toBe(false);
    expect(autonomyAllowedForRisk(2, "regulated")).toBe(false);
  });
  it("never enables reserved autonomy level five", () => expect(autonomyAllowedForRisk(5, "low")).toBe(false));
  it("blocks unapproved tools", () => expect(decideWorkforceAction({ riskLevel: "low", autonomyLevel: 3, toolApproved: false, withinBudget: true, containsRestrictedData: false, humanReviewRequired: false }).decision).toBe("block"));
  it("escalates regulated work even when the configured tool is approved", () => expect(decideWorkforceAction({ riskLevel: "regulated", autonomyLevel: 1, toolApproved: true, withinBudget: true, containsRestrictedData: false, humanReviewRequired: false }).decision).toBe("escalate"));
});
