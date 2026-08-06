import { describe, expect, it } from "vitest";
import { calculateRoi, estimateUsageMinor, hasPermission, marketplaceCommissionMinor, planById, subscriptionPriceMinor } from "./index.js";

describe("commercial platform contracts", () => {
  it("applies the configured annual discount", () => expect(subscriptionPriceMinor("starter", "annual")).toBe(1_528_980));
  it("keeps enterprise pricing quote based", () => expect(subscriptionPriceMinor("enterprise", "monthly")).toBeNull());
  it("charges only live overage above the allowance", () => expect(estimateUsageMinor({ planId: "starter", liveMinutes: 200, presenterMinutes: 10, apiCalls: 10_000 })).toBe(158_900));
  it("rejects an unknown plan at runtime", () => expect(() => planById("invalid" as "starter")).toThrow());
  it("enforces least privilege for viewers", () => expect(hasPermission("viewer", "audit:read")).toBe(false));
  it("allows security reviewers to inspect audits", () => expect(hasPermission("security_reviewer", "audit:read")).toBe(true));
  it("calculates marketplace commission deterministically", () => expect(marketplaceCommissionMinor(10_000)).toBe(2_000));
  it("rejects invalid marketplace rates", () => expect(() => marketplaceCommissionMinor(100, 1.1)).toThrow());
  it("returns labelled ROI estimates without guaranteeing savings", () => {
    const result = calculateRoi({ employees: 3, monthlyInteractions: 2_000, averageMinutes: 6, monthlySalaryMinor: 2_500_000, employerCostRate: 0.2, afterHoursShare: 0.25, assistedConversionImprovement: 0.02, monthlyOpportunityValueMinor: 20_000_000, planId: "professional", estimatedLiveMinutes: 750, estimatedPresenterMinutes: 10 });
    expect(result.currentAnnualCostMinor).toBe(108_000_000);
    expect(result.annualHoursRedirected).toBeGreaterThan(1_000);
    expect(result.sensitivity.lowMinor).not.toBeNull();
  });
  it("does not conflate a free plan's zero cost with the unpriced enterprise case", () => {
    const result = calculateRoi({ employees: 3, monthlyInteractions: 500, averageMinutes: 6, monthlySalaryMinor: 2_500_000, employerCostRate: 0.2, afterHoursShare: 0.25, assistedConversionImprovement: 0.02, monthlyOpportunityValueMinor: 20_000_000, planId: "sandbox", estimatedLiveMinutes: 20, estimatedPresenterMinutes: 1 });
    expect(result.vowHumansAnnualCostMinor).toBe(0);
    expect(result.paybackMonths).toBe(1);
  });
});
