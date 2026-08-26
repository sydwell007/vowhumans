import type { GuideTarget } from "./guides";

// Pure logic for the guided-onboarding engine — no DOM, no fetch, no React,
// mirroring packages/commercial-core/src/workforce.ts's style so it stays
// unit-testable with hand-built fixtures. Two rules kept throughout this file:
// (1) never invent a check the real UI doesn't already show — every check here
// mirrors a real one (see the comment on each function), and (2) every count
// this file scores comes from data the caller already fetched for a real page,
// never a synthetic default.

export type SetupCheck = { label: string; ready: boolean };
export type SetupProgress = { score: number; checks: SetupCheck[]; complete: boolean };

function scoreChecks(checks: SetupCheck[]): SetupProgress {
  const score = checks.length ? Math.round((checks.filter((check) => check.ready).length / checks.length) * 100) : 0;
  return { score, checks, complete: checks.length > 0 && score === 100 };
}

export type DigitalHumanProgressInput = {
  identity: { name: string; role: string; disclosure: string } | null;
  hasFace: boolean;
  hasVoice: boolean;
  knowledgeCount: number;
  personaState: string | null;
  hasGestureProfile: boolean;
  enabledApplicationCount: number;
};

// Deliberately the same seven checks, in the same order, as StudioView.tsx's
// WizardReviewStep (the wizard's own Review step) — so the wizard and the "My
// Setup Progress" panel can never silently drift apart.
export function computeDigitalHumanSetupProgress(input: DigitalHumanProgressInput): SetupProgress {
  return scoreChecks([
    { label: "Disclosed identity", ready: Boolean(input.identity?.name && input.identity?.role && input.identity?.disclosure) },
    { label: "Face assigned", ready: input.hasFace },
    { label: "Voice assigned", ready: input.hasVoice },
    { label: "Knowledge linked", ready: input.knowledgeCount > 0 },
    { label: "Published Persona linked", ready: input.personaState === "published" },
    { label: "Gesture profile assigned", ready: input.hasGestureProfile },
    { label: "Application enabled", ready: input.enabledApplicationCount > 0 },
  ]);
}

export type ReadinessCheck = { code: string; label: string; passed: boolean };

export type DigitalColleagueProgressInput = {
  // The real checks already returned by evaluateWorkforceReadiness() via
  // GET /api/v1/workforce/colleagues/:id (colleague.readiness.checks) —
  // passed straight through, never recomputed here.
  readinessChecks: ReadinessCheck[];
  isDeployed: boolean;
  hasWorkItems: boolean;
};

export function computeDigitalColleagueSetupProgress(input: DigitalColleagueProgressInput): SetupProgress {
  return scoreChecks([
    ...input.readinessChecks.map((check) => ({ label: check.label, ready: check.passed })),
    { label: "Deployed", ready: input.isDeployed },
    { label: "First work item assigned", ready: input.hasWorkItems },
  ]);
}

export type StudioState = {
  digitalHumanCount: number;
  digitalColleagueCount: number;
  // identityRecords with status "Blocked" (apps/studio-web/src/data/platform.ts)
  blockedIdentityCount: number;
  deployedColleaguesWithNoWorkItems: number;
  workProductsAwaitingReview: number;
};

export type NextBestAction = { label: string; href: string; guideId?: string };

// Ordered by real accountability weight, not engagement — a blocked identity
// or an unreviewed output outranks starting something new. Every branch reads
// only real counts the caller already has; nothing here is a fabricated score.
export function nextBestAction(state: StudioState): NextBestAction | null {
  if (state.blockedIdentityCount > 0) {
    return {
      label: `Resolve ${state.blockedIdentityCount} blocked identity record${state.blockedIdentityCount === 1 ? "" : "s"}`,
      href: "/studio/identity-consent",
    };
  }
  if (state.digitalHumanCount === 0) {
    return { label: "Create your first Digital Human", href: "/studio/digital-humans", guideId: "digital-human-flagship" };
  }
  if (state.workProductsAwaitingReview > 0) {
    return {
      label: `Review ${state.workProductsAwaitingReview} Work Product${state.workProductsAwaitingReview === 1 ? "" : "s"} awaiting a decision`,
      href: "/studio/work-products",
      guideId: "work-products-basics",
    };
  }
  if (state.digitalColleagueCount === 0) {
    return { label: "Create your first Digital Colleague", href: "/studio/workforce/create", guideId: "digital-colleague-flagship" };
  }
  if (state.deployedColleaguesWithNoWorkItems > 0) {
    return {
      label: `Assign work to ${state.deployedColleaguesWithNoWorkItems} deployed colleague${state.deployedColleaguesWithNoWorkItems === 1 ? "" : "s"} with none yet`,
      href: "/studio/tasks",
      guideId: "work-queue-basics",
    };
  }
  return null;
}

export type GuideTargetResolution = { needsNavigation: boolean; page: string | null };

// Whether "Show me where" needs a router.push before CoachMark can find the
// element. A target with no `page` only exists in a context reachable from
// wherever the user already is (e.g. a specific step inside a specific
// colleague's builder) — Follow Along shows a text hint there instead of
// guessing a URL.
export function resolveGuideTarget(target: GuideTarget | null, pathname: string): GuideTargetResolution {
  if (!target?.page) return { needsNavigation: false, page: null };
  return { needsNavigation: target.page !== pathname, page: target.page };
}
