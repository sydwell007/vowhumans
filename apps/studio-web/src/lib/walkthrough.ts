// A self-playing, pausable, narrated walkthrough of the full Digital Human →
// Digital Colleague → deploy → work → result journey, shown in its own
// overlay rather than pointed at the real UI. This is a deliberate second
// mechanism alongside the interactive coach-mark guides (lib/guides.ts): the
// interactive guides teach by validating a real click on the real element;
// this walkthrough answers a different, earlier question — "what does the
// whole thing look like end to end, before I touch anything?" — the same way
// this app's existing /demos/* pages give a safe, clearly-labelled preview
// before a person commits real data.
//
// Every field value below is illustrative example data for a fictional
// "Naledi Khumalo" — never real. Every frame's copy is drawn from the same
// real step order and language already used by the actual wizard/builder
// (see guides.ts's flagship guides), so this stays an honest preview of the
// real product, not an invented one.

export type WalkthroughField = { label: string; value: string };
export type WalkthroughCheck = { label: string; done: boolean };
export type WalkthroughResultRow = { label: string; value: string };

export type WalkthroughFrame = {
  id: string;
  track: "digital-human" | "digital-colleague" | "result";
  trackLabel: string;
  title: string;
  caption: string;
} & (
  | { kind: "intro" }
  | { kind: "form"; fields: WalkthroughField[] }
  | { kind: "checklist"; checks: WalkthroughCheck[] }
  | { kind: "result"; resultTitle: string; resultBody: string; rows?: WalkthroughResultRow[] }
);

export const walkthroughFrames: WalkthroughFrame[] = [
  {
    id: "intro",
    track: "digital-human",
    trackLabel: "Before you start",
    title: "Watch the full setup, then do it for real",
    caption: "This is an automated preview using a fictional example — Naledi Khumalo. Nothing here touches your organisation's data. Pause any time, or skip straight to the real Studio.",
    kind: "intro",
  },
  {
    id: "dh-identity",
    track: "digital-human",
    trackLabel: "Digital Human · Identity",
    title: "Start with a disclosed identity",
    caption: "Every VowHuman starts with a name, a role and honest disclosure text — before any face, voice or knowledge is attached.",
    kind: "form",
    fields: [
      { label: "Name", value: "Naledi Khumalo" },
      { label: "Role", value: "Customer Support Specialist" },
      { label: "Disclosure", value: "AI-generated digital human. Not a real person." },
    ],
  },
  {
    id: "dh-face-voice",
    track: "digital-human",
    trackLabel: "Digital Human · Face & Voice",
    title: "Assign a licensed face and a voice",
    caption: "Face and voice are a separate identity layer, reviewed and stored apart from behaviour — so a Persona can change without touching either.",
    kind: "form",
    fields: [
      { label: "Face", value: "Portrait 04 — AI-generated, licensed" },
      { label: "Voice", value: "Nova — OpenAI provider voice" },
    ],
  },
  {
    id: "dh-knowledge-persona-gesture",
    track: "digital-human",
    trackLabel: "Digital Human · Knowledge, Persona & Gesture",
    title: "Ground it, give it behaviour, then natural motion",
    caption: "Knowledge is the approved sources it may cite. Persona is its versioned, publishable behaviour layer. Gesture sets natural blink, gaze and head-movement ranges.",
    kind: "form",
    fields: [
      { label: "Knowledge base", value: "Support FAQ — 24 approved articles" },
      { label: "Persona", value: "Support Adviser · v1 · Published" },
      { label: "Gesture profile", value: "Natural — default ranges" },
    ],
  },
  {
    id: "dh-applications",
    track: "digital-human",
    trackLabel: "Digital Human · Connect an application",
    title: "Enable it for a real application",
    caption: "Applications are registered once by name, then any Digital Human can be enabled for one — this is how it actually reaches a real product.",
    kind: "form",
    fields: [{ label: "Application", value: "PlugConnect — enabled" }],
  },
  {
    id: "dh-review",
    track: "digital-human",
    trackLabel: "Digital Human · Review & Activate",
    title: "Every requirement, checked honestly",
    caption: "Activation only changes this Digital Human's lifecycle state — identity, Persona and knowledge stay exactly as configured.",
    kind: "checklist",
    checks: [
      { label: "Disclosed identity", done: true },
      { label: "Face assigned", done: true },
      { label: "Voice assigned", done: true },
      { label: "Knowledge linked", done: true },
      { label: "Published Persona linked", done: true },
      { label: "Gesture profile assigned", done: true },
      { label: "Application enabled", done: true },
    ],
  },
  {
    id: "dh-result",
    track: "digital-human",
    trackLabel: "Digital Human · Live",
    title: "Naledi is ready to prove her presence",
    caption: "From here you'd test presence — identity, disclosure, voice and application channel — before trusting it with real conversations.",
    kind: "result",
    resultTitle: "Digital Human activated",
    resultBody: "Naledi Khumalo · Customer Support Specialist",
    rows: [
      { label: "State", value: "Active" },
      { label: "Next", value: "Test Presence, or attach a Digital Colleague role" },
    ],
  },
  {
    id: "dc-intro",
    track: "digital-colleague",
    trackLabel: "From identity to governed work",
    title: "A Digital Colleague is a separate, governed layer",
    caption: "It attaches to a Digital Human's identity, then adds bounded work, approved tools, objectives and a named human owner — accountable, not autonomous.",
    kind: "intro",
  },
  {
    id: "dc-role-functions-skills",
    track: "digital-colleague",
    trackLabel: "Digital Colleague · Role, Functions & Skills",
    title: "A bounded role, not a blank agent",
    caption: "Connect identity and behaviour to a bounded business role, then define exactly what work is in scope, out of scope, and human-owned.",
    kind: "form",
    fields: [
      { label: "Role title", value: "Customer Support Colleague" },
      { label: "In scope", value: "Answer FAQs, log support tickets" },
      { label: "Out of scope", value: "Refunds, account changes — human-owned" },
    ],
  },
  {
    id: "dc-knowledge-tools-workflows",
    track: "digital-colleague",
    trackLabel: "Digital Colleague · Knowledge, Tools & Workflows",
    title: "Only approved sources, least-privilege tools",
    caption: "Knowledge sources ground the colleague's answers. Tools grant least-privilege actions without storing credentials here. Workflows describe traceable steps and exception paths.",
    kind: "form",
    fields: [
      { label: "Knowledge", value: "Support FAQ — shared with the Digital Human" },
      { label: "Tool", value: "Ticket lookup — least-privilege" },
      { label: "Workflow", value: "Triage → answer or escalate" },
    ],
  },
  {
    id: "dc-objectives-guardrails-collaboration",
    track: "digital-colleague",
    trackLabel: "Digital Colleague · Objectives, Guardrails & Collaboration",
    title: "Accountable targets, explicit limits, a named owner",
    caption: "Objectives set measurable indicators without invented baselines. Guardrails enforce disclosure, privacy and human authority. Collaboration names the human owner and escalation route.",
    kind: "form",
    fields: [
      { label: "Objective", value: "First response under 2 minutes" },
      { label: "Guardrails", value: "Disclosure · Privacy · Human escalation" },
      { label: "Human owner", value: "You — with a named escalation route" },
    ],
  },
  {
    id: "dc-testing",
    track: "digital-colleague",
    trackLabel: "Digital Colleague · Testing",
    title: "Deterministic readiness checks, before anyone reviews it",
    caption: "Every check here is real — role, identity, functions, skills, knowledge, tools, guardrails, escalation — run before asking a person to approve anything.",
    kind: "checklist",
    checks: [
      { label: "Role and identity connected", done: true },
      { label: "Functions and skills bounded", done: true },
      { label: "Guardrails explicit (3+)", done: true },
      { label: "Human escalation configured", done: true },
    ],
  },
  {
    id: "dc-approval-deployment",
    track: "digital-colleague",
    trackLabel: "Digital Colleague · Approval & Deployment",
    title: "A person signs off — then it deploys",
    caption: "Approval creates an immutable snapshot with a reviewer rationale. Deployment then chooses a governed environment and enabled delivery channel — Sandbox first, always.",
    kind: "result",
    resultTitle: "Approved, then deployed to Sandbox",
    resultBody: "Naledi — Customer Support Colleague",
    rows: [
      { label: "Approved by", value: "You — \"Readiness checks pass, escalation is named.\"" },
      { label: "Environment", value: "Sandbox · Work Queue channel enabled" },
    ],
  },
  {
    id: "work-item",
    track: "result",
    trackLabel: "Put it to work",
    title: "Assign its first real work item",
    caption: "A clear request and explicit expected output define exactly what the colleague is bounded to do — nothing implied.",
    kind: "form",
    fields: [
      { label: "Request", value: "\"A customer is asking about our refund policy.\"" },
      { label: "Expected output", value: "A clear policy answer with a cited source" },
    ],
  },
  {
    id: "work-result",
    track: "result",
    trackLabel: "See the result",
    title: "A reviewable Work Product — not a black box",
    caption: "Model identity, source references and assumptions stay visible, so a person — not the model — makes the release decision.",
    kind: "result",
    resultTitle: "Work Product ready for review",
    resultBody: "\"Our refund policy allows returns within 30 days, citing Support FAQ #14.\"",
    rows: [
      { label: "Source", value: "Support FAQ #14" },
      { label: "Decision", value: "Approved by the accountable reviewer" },
    ],
  },
  {
    id: "outro",
    track: "result",
    trackLabel: "Your turn",
    title: "Now do it for real",
    caption: "Everything you just watched is the real Studio, end to end. Start with your own Digital Human — the Guide Library will highlight each real step as you go.",
    kind: "intro",
  },
];
