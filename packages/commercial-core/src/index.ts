export type PlanId = "sandbox" | "starter" | "professional" | "business" | "enterprise";
export type BillingInterval = "monthly" | "annual";
export type Currency = "ZAR" | "USD" | "EUR" | "GBP";

export type Plan = {
  id: PlanId;
  name: string;
  audience: string;
  monthlyMinor: number | null;
  includedLiveMinutes: number;
  includedPresenterMinutes: number;
  digitalHumans: number | null;
  teamSeats: number | null;
  features: string[];
  status: "available" | "contact-sales";
};

export const ANNUAL_DISCOUNT_RATE = 0.15;

export const plans: readonly Plan[] = [
  { id: "sandbox", name: "Sandbox", audience: "Evaluation and prototypes", monthlyMinor: 0, includedLiveMinutes: 20, includedPresenterMinutes: 1, digitalHumans: 1, teamSeats: 1, status: "available", features: ["One draft digital human", "Safe test sessions", "Watermarked previews", "Community documentation"] },
  { id: "starter", name: "Starter", audience: "Creators and small teams", monthlyMinor: 149900, includedLiveMinutes: 180, includedPresenterMinutes: 10, digitalHumans: 1, teamSeats: 3, status: "available", features: ["One published digital human", "Website embed", "One knowledge base", "Basic analytics", "Standard support"] },
  { id: "professional", name: "Professional", audience: "Growing organisations", monthlyMinor: 499900, includedLiveMinutes: 750, includedPresenterMinutes: 35, digitalHumans: 5, teamSeats: 10, status: "available", features: ["Five digital humans", "API and webhooks", "Advanced analytics", "Template library", "Standard integrations"] },
  { id: "business", name: "Business", audience: "Departments and mid-market", monthlyMinor: 1499900, includedLiveMinutes: 2500, includedPresenterMinutes: 100, digitalHumans: 20, teamSeats: 40, status: "available", features: ["Multiple workspaces", "Approvals and budgets", "Advanced security", "Priority support", "Custom branding"] },
  { id: "enterprise", name: "Enterprise", audience: "Regulated and complex organisations", monthlyMinor: null, includedLiveMinutes: 0, includedPresenterMinutes: 0, digitalHumans: null, teamSeats: null, status: "contact-sales", features: ["SSO architecture", "Custom retention", "Security review support", "Regional deployment options", "SLA and procurement support"] },
] as const;

export function planById(id: PlanId): Plan {
  const plan = plans.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function subscriptionPriceMinor(planId: PlanId, interval: BillingInterval): number | null {
  const monthly = planById(planId).monthlyMinor;
  if (monthly === null) return null;
  return interval === "annual" ? Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT_RATE)) : monthly;
}

export type UsageEstimateInput = {
  planId: PlanId;
  liveMinutes: number;
  presenterMinutes: number;
  apiCalls: number;
};

export function estimateUsageMinor(input: UsageEstimateInput): number | null {
  const plan = planById(input.planId);
  if (plan.monthlyMinor === null) return null;
  const liveOverage = Math.max(0, input.liveMinutes - plan.includedLiveMinutes) * 450;
  const presenterOverage = Math.max(0, input.presenterMinutes - plan.includedPresenterMinutes) * 9500;
  const apiOverage = Math.max(0, input.apiCalls - 10_000) * 2;
  return plan.monthlyMinor + liveOverage + presenterOverage + apiOverage;
}

export type RoiInput = {
  employees: number;
  monthlyInteractions: number;
  averageMinutes: number;
  monthlySalaryMinor: number;
  employerCostRate: number;
  afterHoursShare: number;
  assistedConversionImprovement: number;
  monthlyOpportunityValueMinor: number;
  planId: PlanId;
  estimatedLiveMinutes: number;
  estimatedPresenterMinutes: number;
};

export type RoiResult = {
  currentAnnualCostMinor: number;
  vowHumansAnnualCostMinor: number | null;
  annualHoursRedirected: number;
  costPerInteractionMinor: number | null;
  estimatedAnnualBenefitMinor: number | null;
  paybackMonths: number | null;
  threeYearBenefitMinor: number | null;
  sensitivity: { lowMinor: number | null; highMinor: number | null };
};

export function calculateRoi(input: RoiInput): RoiResult {
  const loadedSalary = input.monthlySalaryMinor * (1 + input.employerCostRate);
  const currentAnnualCostMinor = Math.round(loadedSalary * input.employees * 12);
  const interactionHours = input.monthlyInteractions * input.averageMinutes / 60;
  const annualHoursRedirected = Math.round(interactionHours * 12 * Math.min(0.8, 0.45 + input.afterHoursShare * 0.25));
  const monthlyPlatform = estimateUsageMinor({ planId: input.planId, liveMinutes: input.estimatedLiveMinutes, presenterMinutes: input.estimatedPresenterMinutes, apiCalls: input.monthlyInteractions });
  const vowHumansAnnualCostMinor = monthlyPlatform === null ? null : monthlyPlatform * 12;
  const hourlyLabourMinor = input.employees > 0 ? currentAnnualCostMinor / (input.employees * 1_920) : 0;
  const redirectedValue = annualHoursRedirected * hourlyLabourMinor;
  const conversionValue = input.monthlyOpportunityValueMinor * input.assistedConversionImprovement * 12;
  const grossBenefit = Math.round(redirectedValue + conversionValue);
  const estimatedAnnualBenefitMinor = vowHumansAnnualCostMinor === null ? null : Math.round(grossBenefit - vowHumansAnnualCostMinor);
  const paybackMonths = vowHumansAnnualCostMinor && grossBenefit > 0 ? Math.max(1, Math.ceil(vowHumansAnnualCostMinor / (grossBenefit / 12))) : null;
  const threeYearBenefitMinor = estimatedAnnualBenefitMinor === null ? null : estimatedAnnualBenefitMinor * 3;
  return {
    currentAnnualCostMinor,
    vowHumansAnnualCostMinor,
    annualHoursRedirected,
    costPerInteractionMinor: vowHumansAnnualCostMinor === null || input.monthlyInteractions <= 0 ? null : Math.round(vowHumansAnnualCostMinor / (input.monthlyInteractions * 12)),
    estimatedAnnualBenefitMinor,
    paybackMonths,
    threeYearBenefitMinor,
    sensitivity: { lowMinor: estimatedAnnualBenefitMinor === null ? null : Math.round(estimatedAnnualBenefitMinor * 0.65), highMinor: estimatedAnnualBenefitMinor === null ? null : Math.round(estimatedAnnualBenefitMinor * 1.25) },
  };
}

export type Role = "owner" | "billing_admin" | "org_admin" | "workspace_admin" | "creator" | "persona_editor" | "knowledge_manager" | "developer" | "analyst" | "support_operator" | "marketplace_manager" | "security_reviewer" | "auditor" | "viewer";
export type Permission = "organisation:manage" | "billing:manage" | "human:create" | "persona:publish" | "knowledge:write" | "sessions:read-metadata" | "transcripts:read-consented" | "api-keys:manage" | "marketplace:publish" | "security:review" | "audit:read";

const grants: Record<Role, readonly Permission[]> = {
  owner: ["organisation:manage", "billing:manage", "human:create", "persona:publish", "knowledge:write", "sessions:read-metadata", "transcripts:read-consented", "api-keys:manage", "marketplace:publish", "security:review", "audit:read"],
  billing_admin: ["billing:manage"], org_admin: ["organisation:manage", "human:create", "persona:publish", "knowledge:write", "sessions:read-metadata", "api-keys:manage", "audit:read"],
  workspace_admin: ["human:create", "persona:publish", "knowledge:write", "sessions:read-metadata"], creator: ["human:create"], persona_editor: ["persona:publish"], knowledge_manager: ["knowledge:write"], developer: ["api-keys:manage", "sessions:read-metadata"], analyst: ["sessions:read-metadata"], support_operator: ["sessions:read-metadata"], marketplace_manager: ["marketplace:publish"], security_reviewer: ["security:review", "audit:read"], auditor: ["audit:read", "sessions:read-metadata"], viewer: [],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return grants[role].includes(permission);
}

export function marketplaceCommissionMinor(grossMinor: number, rate = 0.2): number {
  if (grossMinor < 0 || rate < 0 || rate > 1) throw new Error("Invalid commission input");
  return Math.round(grossMinor * rate);
}

export const featureFlagDefaults = {
  ENABLE_PUBLIC_MARKETING_SITE: true, ENABLE_STUDIO: true, ENABLE_LIVE_SESSIONS: false, ENABLE_OPENAI_REALTIME: false, ENABLE_LIVEKIT: false, ENABLE_MUSETALK: false, ENABLE_LIVEPORTRAIT: false, ENABLE_AUDIO2FACE: false, ENABLE_PRESENTER_STUDIO: true, ENABLE_MARKETPLACE: true, ENABLE_MARKETPLACE_PURCHASES: false, ENABLE_MARKETPLACE_PAYOUTS: false, ENABLE_PARTNER_PORTAL: true, ENABLE_ACADEMY: true, ENABLE_BILLING: true, ENABLE_PAYFAST: false, ENABLE_STRIPE: false, ENABLE_ENTERPRISE_SSO: false, ENABLE_TRANSCRIPTS: false, ENABLE_RECORDINGS: false, ENABLE_PUBLIC_DEMOS: true, ENABLE_ANALYTICS: true, ENABLE_MOBILE_PWA: true, ENABLE_INVESTOR_DATA_ROOM: false,
} as const;
