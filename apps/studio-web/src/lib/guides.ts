import { WORKFORCE_BUILDER_STEPS, type WorkforceBuilderStep } from "@vowhumans/commercial-core/workforce";

// Guide *definitions* — the real steps, real copy and real UI targets for the
// guided-onboarding engine (coach marks / Follow Along Mode). This file is
// content only: no DOM, no fetch, no React. Per-user *progress* through these
// guides is the only thing that lives in the database (guide_progress,
// migration 020) — the guides themselves ship through normal code review, the
// same way workforce_templates' structure does.
//
// Every step's `target` names a real `data-guide="..."` attribute placed on a
// real element in StudioView.tsx (Digital Human) or WorkforceStudio.tsx
// (Digital Colleague) — never an invented one. Every step's `validation`
// reflects how that element actually confirms completion:
//   - "event"      — the app dispatches `studio:guide-step-complete` with this
//                     step id at the real point the underlying action succeeds
//                     (see the `window.dispatchEvent(...)` call sites next to
//                     each target below).
//   - "navigation" — the real UI already changes the URL when this step
//                     completes (the Digital Colleague builder is one page per
//                     step; several post-deploy actions are real links), so
//                     completion is just watching the pathname.
//   - "manual"     — a purely informational step with no independent action to
//                     validate (used only for short orientation steps).

export type GuideRole = "owner" | "admin" | "operator" | "reviewer" | "viewer";

export type GuideStepValidation =
  | { kind: "event"; step: string }
  | { kind: "navigation"; test: (pathname: string) => boolean }
  | { kind: "manual" };

export type GuideTarget = {
  selector: string;
  // The /studio page this element lives on. Omitted when the target only
  // exists in a context that can't be reached by URL alone (e.g. a specific
  // step inside a specific colleague's 12-step builder) — Follow Along then
  // shows a text hint instead of forcing a navigation.
  page?: string;
};

export type GuideStep = {
  id: string;
  title: string;
  body: string;
  target: GuideTarget | null;
  validation: GuideStepValidation;
};

export type Guide = {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  entity: "digital_human" | "digital_colleague" | "general";
  // UI-only surfacing (which guides a role sees first in the Guide Library) —
  // never an enforcement layer. The real API routes already enforce write,
  // approval and deployment roles independently.
  roles: GuideRole[];
  steps: GuideStep[];
};

// Reproduced from WorkforceStudio.tsx's private `stepLabels`/`stepDescriptions`
// (not exported) so the 12-step Digital Colleague guide never invents copy the
// real builder doesn't already show. Keep these in sync if the builder's own
// copy changes.
const colleagueStepLabels: Record<WorkforceBuilderStep, string> = {
  role: "Role",
  functions: "Functions",
  skills: "Skills",
  knowledge: "Knowledge",
  tools: "Tools",
  workflows: "Workflows",
  objectives: "Objectives",
  guardrails: "Guardrails",
  collaboration: "Collaboration",
  testing: "Testing",
  approval: "Approval",
  deployment: "Deployment",
};

const colleagueStepDescriptions: Record<WorkforceBuilderStep, string> = {
  role: "Connect identity and behaviour to a bounded business role.",
  functions: "Define the work that is in scope, out of scope and human-owned.",
  skills: "Record what the colleague may apply and what evidence must prove it.",
  knowledge: "Assign only approved sources that can ground this colleague's work.",
  tools: "Grant least-privilege tool actions without storing credentials here.",
  workflows: "Describe triggers, traceable steps, outputs and exception paths.",
  objectives: "Set accountable objectives and measurable indicators without invented baselines.",
  guardrails: "Enforce disclosure, privacy, role boundaries and human authority.",
  collaboration: "Name the human owner, escalation route and any controlled hand-off.",
  testing: "Run deterministic readiness checks before asking for approval.",
  approval: "Create an immutable approval snapshot with a reviewer rationale.",
  deployment: "Choose a governed environment and enabled delivery channel.",
};

function colleagueBuilderSteps(): GuideStep[] {
  return WORKFORCE_BUILDER_STEPS.map((step, index) => {
    const next = WORKFORCE_BUILDER_STEPS[index + 1];
    return {
      id: `wf-builder-step-${step}`,
      title: colleagueStepLabels[step],
      body: colleagueStepDescriptions[step],
      target: { selector: `wf-builder-step-${step}` },
      validation:
        step === "deployment"
          ? { kind: "event", step: "wf-builder-step-deployment" }
          : { kind: "navigation", test: (pathname: string) => pathname.endsWith(`/${next}`) },
    };
  });
}

const digitalHumanFlagship: Guide = {
  id: "digital-human-flagship",
  title: "Build and deploy a Digital Human",
  description: "The real 8-step wizard, end to end — identity, face, voice, knowledge, persona, gesture, an application and activation.",
  estimatedMinutes: 10,
  entity: "digital_human",
  roles: ["owner", "admin", "operator", "reviewer", "viewer"],
  steps: [
    {
      id: "dh-new",
      title: "Start a new Digital Human",
      body: "Every VowHuman starts with a disclosed identity — a name, a role and honest disclosure text — before any face, voice or knowledge is attached.",
      target: { selector: "dh-new", page: "/studio/digital-humans" },
      validation: { kind: "event", step: "dh-wizard-step-identity" },
    },
    {
      id: "dh-wizard-step-face",
      title: "Face",
      body: "Faces are a licensed visual identity layer, reviewed and stored separately from Persona behaviour.",
      target: { selector: "dh-wizard-step-face" },
      validation: { kind: "event", step: "dh-wizard-step-face" },
    },
    {
      id: "dh-wizard-step-voice",
      title: "Voice",
      body: "Assign a provider voice or an approved custom voice asset.",
      target: { selector: "dh-wizard-step-voice" },
      validation: { kind: "event", step: "dh-wizard-step-voice" },
    },
    {
      id: "dh-wizard-step-knowledge",
      title: "Knowledge",
      body: "Link only the approved sources this VowHuman may ground its answers in.",
      target: { selector: "dh-wizard-step-knowledge" },
      validation: { kind: "event", step: "dh-wizard-step-knowledge" },
    },
    {
      id: "dh-wizard-step-persona",
      title: "Persona",
      body: "Persona carries the behaviour — role, guardrails and conversation style — as its own versioned, publishable layer.",
      target: { selector: "dh-wizard-step-persona" },
      validation: { kind: "event", step: "dh-wizard-step-persona" },
    },
    {
      id: "dh-wizard-step-gesture",
      title: "Gesture",
      body: "Set natural blink, gaze and head-movement ranges for each conversation state.",
      target: { selector: "dh-wizard-step-gesture" },
      validation: { kind: "event", step: "dh-wizard-step-gesture" },
    },
    {
      id: "dh-wizard-step-applications",
      title: "Connect an application",
      body: "Enable this Digital Human for one of your already-connected GoalVow applications. If none are connected yet, the wizard says so honestly — connect one from the Applications page first.",
      target: { selector: "dh-wizard-step-applications" },
      validation: { kind: "event", step: "dh-wizard-step-applications" },
    },
    {
      id: "dh-wizard-activate",
      title: "Review and activate",
      body: "Activation only changes this Digital Human's lifecycle state — identity, Persona and knowledge stay exactly as configured.",
      target: { selector: "dh-wizard-activate" },
      validation: { kind: "event", step: "dh-wizard-activate" },
    },
    {
      id: "dh-post-deploy-test",
      title: "Test Presence",
      body: "Verify identity, disclosure, voice, avatar fallback and the application channel actually work before anyone else sees this VowHuman.",
      target: { selector: "dh-post-deploy-test", page: "/studio/digital-humans" },
      validation: { kind: "navigation", test: (pathname: string) => pathname.startsWith("/studio/test-centre") },
    },
    {
      id: "dh-post-deploy-colleague",
      title: "Create a Digital Colleague",
      body: "Attach this identity to a bounded role, a governance policy and the 12-step deployment builder.",
      target: { selector: "dh-post-deploy-colleague", page: "/studio/digital-humans" },
      validation: { kind: "navigation", test: (pathname: string) => pathname === "/studio/workforce/create" },
    },
  ],
};

const digitalColleagueFlagship: Guide = {
  id: "digital-colleague-flagship",
  title: "Build, approve and deploy a Digital Colleague",
  description: "The real 12-step governed builder, then a real test, approval, first work item and reviewable output.",
  estimatedMinutes: 20,
  entity: "digital_colleague",
  roles: ["owner", "admin", "operator"],
  steps: [
    {
      id: "wf-create",
      title: "Start a Digital Colleague",
      body: "Digital Colleagues are a separate, governed layer above a Digital Human's identity — bounded work, tools, objectives and a named human owner.",
      target: { selector: "wf-create", page: "/studio/workforce" },
      validation: { kind: "navigation", test: (pathname: string) => pathname === "/studio/workforce/create" },
    },
    {
      id: "wf-create-confirm",
      title: "Create the draft",
      body: "Start from a role template or a manual configuration. This creates an editable draft — it never approves or deploys itself.",
      target: { selector: "wf-create-confirm", page: "/studio/workforce/create" },
      validation: { kind: "navigation", test: (pathname: string) => /\/studio\/workforce\/[^/]+\/role$/.test(pathname) },
    },
    ...colleagueBuilderSteps(),
    {
      id: "wf-post-deploy-test",
      title: "Run post-deployment tests",
      body: "Deployment makes this an enabled operating policy — validate presence, role boundaries and escalation before trusting it with real work.",
      target: { selector: "wf-post-deploy-test" },
      validation: { kind: "navigation", test: (pathname: string) => pathname.startsWith("/studio/test-centre") },
    },
    {
      id: "wf-test-run",
      title: "Run a real test",
      body: "Tests never publish, contact customers or commit an external action — provider-dependent checks are marked blocked or degraded rather than reported as passed.",
      target: { selector: "wf-test-run", page: "/studio/test-centre" },
      validation: { kind: "event", step: "wf-test-run" },
    },
    {
      id: "wf-post-deploy-tasks",
      title: "Open the Work Queue",
      body: "Assign this colleague its first bounded piece of real work.",
      target: { selector: "wf-post-deploy-tasks" },
      validation: { kind: "navigation", test: (pathname: string) => pathname.startsWith("/studio/tasks") },
    },
    {
      id: "wf-task-compose",
      title: "Create a work item",
      body: "A clear request and explicit expected output — this is what the colleague is bounded to do.",
      target: { selector: "wf-task-compose", page: "/studio/tasks" },
      validation: { kind: "event", step: "wf-task-compose" },
    },
    {
      id: "wf-task-brief",
      title: "Prepare the deterministic brief",
      body: "Always available even when model execution isn't yet approved — this is the honest, provider-free way to produce a reviewable work product.",
      target: { selector: "wf-task-brief" },
      validation: { kind: "event", step: "wf-task-brief" },
    },
    {
      id: "wf-product-approve",
      title: "Review the Work Product",
      body: "Model identity, source references and assumptions stay visible so a person — not the model — makes the release decision.",
      target: { selector: "wf-product-approve" },
      validation: { kind: "event", step: "wf-product-approve" },
    },
    {
      id: "wf-analytics",
      title: "See the recorded evidence",
      body: "Recorded evidence only — lifecycle, work, review and provider-cost events, never a fabricated productivity claim.",
      target: { selector: "wf-analytics", page: "/studio/workforce-analytics" },
      validation: { kind: "navigation", test: (pathname: string) => pathname === "/studio/workforce-analytics" },
    },
  ],
};

const connectApplication: Guide = {
  id: "connect-application",
  title: "Connect an application",
  description: "Register a GoalVow application, then enable a Digital Human for it.",
  estimatedMinutes: 3,
  entity: "general",
  roles: ["owner", "admin", "operator"],
  steps: [
    {
      id: "app-connect",
      title: "Connect an application",
      body: "Applications are registered by name once, then any number of Digital Humans can be enabled for them.",
      target: { selector: "app-connect", page: "/studio/applications" },
      validation: { kind: "event", step: "app-connect" },
    },
    {
      id: "dh-wizard-step-applications",
      title: "Enable a Digital Human for it",
      body: "Open an existing Digital Human's Applications section (or the wizard's Applications step for a new one) and enable it for the application you just connected.",
      target: { selector: "dh-wizard-step-applications", page: "/studio/digital-humans" },
      validation: { kind: "event", step: "dh-wizard-step-applications" },
    },
  ],
};

const workQueueBasics: Guide = {
  id: "work-queue-basics",
  title: "Work Queue basics",
  description: "Compose a real work item and generate its deterministic review brief.",
  estimatedMinutes: 4,
  entity: "general",
  roles: ["owner", "admin", "operator"],
  steps: [
    {
      id: "wf-task-compose",
      title: "Create a work item",
      body: "Needs at least one deployed Digital Colleague. A clear request and explicit expected output define what the colleague is bounded to do.",
      target: { selector: "wf-task-compose", page: "/studio/tasks" },
      validation: { kind: "event", step: "wf-task-compose" },
    },
    {
      id: "wf-task-brief",
      title: "Prepare the deterministic brief",
      body: "Always available even when model execution isn't yet approved — the honest, provider-free way to produce a reviewable work product.",
      target: { selector: "wf-task-brief" },
      validation: { kind: "event", step: "wf-task-brief" },
    },
  ],
};

const workProductsBasics: Guide = {
  id: "work-products-basics",
  title: "Work Products basics",
  description: "What a Work Product proves, and how to record a human review decision.",
  estimatedMinutes: 3,
  entity: "general",
  roles: ["owner", "admin", "operator", "reviewer", "viewer"],
  steps: [
    {
      id: "work-products-intro",
      title: "Human-verifiable output",
      body: "Every Work Product keeps model identity, source references, assumptions and an append-only review history visible before release.",
      target: null,
      validation: { kind: "manual" },
    },
    {
      id: "wf-product-approve",
      title: "Record a review decision",
      body: "Approve, request changes, escalate, ask for a re-run, or reject — every decision is append-only; a later change creates new history rather than rewriting the original.",
      target: { selector: "wf-product-approve", page: "/studio/tasks" },
      validation: { kind: "event", step: "wf-product-approve" },
    },
  ],
};

export const guides: Guide[] = [
  digitalHumanFlagship,
  digitalColleagueFlagship,
  connectApplication,
  workQueueBasics,
  workProductsBasics,
];

export function getGuide(guideId: string): Guide | undefined {
  return guides.find((guide) => guide.id === guideId);
}

export function guidesForRole(role: string): Guide[] {
  const known = guides.filter((guide) => guide.roles.includes(role as GuideRole));
  const rest = known.filter((guide) => guide.id !== "work-products-basics");
  const workProducts = known.find((guide) => guide.id === "work-products-basics");
  // Reviewers land on evidence review first — every other role keeps shipped order.
  if (role === "reviewer" && workProducts) return [workProducts, ...rest];
  return known;
}
