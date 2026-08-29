import {
  Activity,
  AppWindow,
  AudioLines,
  BadgeCheck,
  BookOpenText,
  Bot,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleGauge,
  ClipboardList,
  FileKey2,
  Fingerprint,
  GraduationCap,
  KeyRound,
  Languages,
  LibraryBig,
  ListChecks,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
  Webhook,
} from "lucide-react";

export type Human = {
  id: string;
  name: string;
  role: string;
  use: string;
  disclosure: string;
  image: string;
  applications: string[];
  persona: string;
  mode: string;
  status: "Ready" | "Draft";
};

export const humans: Human[] = [
  {
    id: "thandi-mokoena",
    name: "Thandi Mokoena",
    role: "Talent Partner",
    use: "PlugConnect interview practice",
    disclosure: "Fictional AI-generated practice interviewer",
    image: "/humans/thandi.png",
    applications: ["PlugConnect"],
    persona: "Professional Practice Interviewer",
    mode: "Static portrait + voice",
    status: "Ready",
  },
  {
    id: "sipho-daniels",
    name: "Sipho Daniels",
    role: "Recruitment Consultant",
    use: "PlugConnect interview practice",
    disclosure: "Fictional AI-generated practice interviewer",
    image: "/humans/sipho.png",
    applications: ["PlugConnect"],
    persona: "Professional Practice Interviewer",
    mode: "Static portrait + voice",
    status: "Ready",
  },
  {
    id: "goalvow-tutor",
    name: "GoalVow Tutor",
    role: "Digital Course Facilitator",
    use: "GoalVow course lessons",
    disclosure: "AI-generated course presenter",
    image: "/humans/tutor.png",
    applications: ["GoalVow Academies", "VowLMS"],
    persona: "GoalVow Course Tutor",
    mode: "Static portrait + voice",
    status: "Ready",
  },
  {
    id: "vowsupport-adviser",
    name: "Lerato Maseko",
    role: "VowSupport Adviser",
    use: "Customer support triage and escalation",
    disclosure: "Fictional AI-generated support adviser",
    image: "/humans/support-adviser.png",
    applications: ["VowSupport"],
    persona: "Support Adviser",
    mode: "Static portrait + text fallback",
    status: "Draft",
  },
  {
    id: "vowtools-coach",
    name: "Kabelo Ndlovu",
    role: "VowTools Coach",
    use: "Guided productivity coaching",
    disclosure: "Fictional AI-generated productivity coach",
    image: "/humans/vowtools-coach.png",
    applications: ["VowTools"],
    persona: "Productivity Coach",
    mode: "Static portrait + text fallback",
    status: "Draft",
  },
];

export const applications = [
  { name: "PlugConnect", code: "PC", colour: "coral", humans: 2, sessions: "1,284", status: "Connected" },
  { name: "GoalVow Academies", code: "GA", colour: "cyan", humans: 1, sessions: "892", status: "Connected" },
  { name: "VowLMS", code: "VL", colour: "lime", humans: 1, sessions: "416", status: "Connected" },
  { name: "VowSupport", code: "VS", colour: "violet", humans: 1, sessions: "—", status: "Sandbox" },
  { name: "VowTools", code: "VT", colour: "amber", humans: 1, sessions: "—", status: "Sandbox" },
  { name: "VowRewards", code: "VR", colour: "coral", humans: 0, sessions: "—", status: "Planned" },
];

export const identityRecords = [
  { owner: "GoalVow original placeholder", identity: "Thandi Mokoena", scope: "PlugConnect practice", expiry: "31 Dec 2027", status: "Approved" },
  { owner: "GoalVow original placeholder", identity: "Sipho Daniels", scope: "PlugConnect practice", expiry: "31 Dec 2027", status: "Approved" },
  { owner: "GoalVow synthetic asset", identity: "GoalVow Tutor", scope: "Academies · VowLMS", expiry: "No actor likeness", status: "Approved" },
  { owner: "Awaiting owner verification", identity: "Custom presenter 04", scope: "Not assigned", expiry: "—", status: "Blocked" },
] as const;

export const identityAlertCount = identityRecords.filter((record) => record.status === "Blocked").length;

// The customer-facing Digital Human builder deliberately remains eight clear
// stages. Persona and Knowledge are linked layers, never folded into identity.
export const DIGITAL_HUMAN_BUILDER_STEPS = [
  "Identity",
  "Face",
  "Voice",
  "Knowledge",
  "Persona",
  "Gesture",
  "Applications",
  "Review",
] as const;

// Two clearly parallel build tracks, not one flat list — this is the direct
// answer to "why are there two configurations": a Digital Human is a
// disclosed identity (face/voice/knowledge/persona), a Digital Colleague is a
// governed role built on top of one (bounded work/tools/objectives). Every
// stage of each entity's own lifecycle — build, connect/test, operate — lives
// together under its own group, rather than being split across Build/Operate/
// Govern the way a flat IA previously scattered a colleague's Work Queue,
// Approvals and Operations away from where it's actually created.
export const navigation = [
  {
    label: "Overview",
    items: [
      { slug: "", label: "Dashboard", icon: CircleGauge },
      { slug: "learn", label: "Guide Library", icon: GraduationCap },
    ],
  },
  {
    label: "Digital Humans",
    description: "Identity, face, voice & knowledge — a disclosed presence",
    items: [
      { slug: "digital-humans", label: "Digital Humans", icon: Bot },
      { slug: "personas", label: "Personas", icon: BrainCircuit },
      { slug: "knowledge", label: "Knowledge", icon: LibraryBig },
      { slug: "voices", label: "Voices", icon: AudioLines },
      { slug: "faces", label: "Faces", icon: Fingerprint },
      { slug: "replicas", label: "Photoreal Replicas", icon: Video },
      { slug: "gesture-profiles", label: "Gesture Profiles", icon: Sparkles },
      { slug: "languages", label: "Languages", icon: Languages },
      { slug: "applications", label: "Applications", icon: AppWindow },
      { slug: "live-sessions", label: "Live Sessions", icon: Radio },
      { slug: "presenter-studio", label: "Presenter Studio", icon: Video },
    ],
  },
  {
    label: "Digital Colleagues",
    description: "Bounded roles, tools & work — built on a Digital Human's identity",
    items: [
      { slug: "workforce", label: "Digital Colleagues", icon: BriefcaseBusiness },
      { slug: "test-centre", label: "Test Centre", icon: ClipboardList },
      { slug: "tasks", label: "Work Queue", icon: ListChecks },
      { slug: "work-products", label: "Work Products", icon: Boxes },
      { slug: "approvals", label: "Approvals", icon: BadgeCheck },
      { slug: "operations", label: "Operations", icon: Activity },
    ],
  },
  {
    label: "Govern",
    items: [
      { slug: "identity-consent", label: "Identity & Consent", icon: UsersRound },
      { slug: "safety", label: "Safety", icon: ShieldCheck },
      { slug: "api-keys", label: "API Keys", icon: KeyRound },
      { slug: "webhooks", label: "Webhooks", icon: Webhook },
      { slug: "settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Measure",
    items: [
      { slug: "workforce-analytics", label: "Workforce Analytics", icon: Activity },
      { slug: "usage", label: "Usage", icon: ChartNoAxesCombined },
      { slug: "audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

export const pageMeta: Record<string, { eyebrow: string; title: string; description: string; action: string }> = {
  dashboard: { eyebrow: "", title: "", description: "Here’s what your governed Digital Humans and Digital Colleagues are doing today.", action: "Create Digital Colleague" },
  workforce: { eyebrow: "Governed roles, built on a Digital Human's identity", title: "Digital Colleagues", description: "Design, test, approve, deploy and supervise accountable Digital Colleagues without blurring identity, behaviour and work.", action: "Create Digital Colleague" },
  learn: { eyebrow: "Learn by doing", title: "Guide Library", description: "Real, click-validated guides that run directly on your own Studio — never a simulation.", action: "Resume a guide" },
  "test-centre": { eyebrow: "Safe proof before scale", title: "Test Centre", description: "Test Digital Human presence, Digital Colleague behaviour and deployed work as separate, version-aware evidence.", action: "Run test" },
  operations: { eyebrow: "Post-deployment command", title: "Operations", description: "Observe runtime health, supervise deployments and pause work without losing configuration or evidence.", action: "Test connections" },
  tasks: { eyebrow: "Governed operations", title: "Work Queue", description: "Assign bounded work, inspect event trails and review every Digital Colleague output before release.", action: "New work item" },
  "work-products": { eyebrow: "Human-verifiable output", title: "Work Products", description: "Review grounded outputs, sources, assumptions, model identity and append-only human decisions.", action: "Open Work Queue" },
  approvals: { eyebrow: "Human authority", title: "Approvals", description: "Review configuration snapshots, work products and exceptions with append-only decision history.", action: "Review queue" },
  "workforce-analytics": { eyebrow: "Evidence, not theatre", title: "Workforce Analytics", description: "Measure recorded lifecycle, work, review and provider-cost events without fabricated productivity claims.", action: "Refresh analytics" },
  "digital-humans": { eyebrow: "Identity + voice + Persona", title: "Digital Humans", description: "Manage every disclosed AI representative and the applications they can serve.", action: "New digital human" },
  personas: { eyebrow: "Behaviour layer", title: "Personas", description: "Design roles, guardrails, objectives, knowledge and conversation style with immutable published versions.", action: "New Persona" },
  knowledge: { eyebrow: "Retrieval with citations", title: "Knowledge", description: "Control the approved sources that ground tutors, interviewers and advisers.", action: "Add source" },
  voices: { eyebrow: "Consented audio", title: "Voices", description: "Configure provider voices and approved custom voice assets without exposing provider credentials.", action: "Add voice" },
  faces: { eyebrow: "Identity layer", title: "Faces", description: "Review licensed visual assets, provenance and commercial permissions separately from Persona behaviour.", action: "Add face asset" },
  replicas: { eyebrow: "Captured presence", title: "Photoreal Replicas", description: "Preserve an authorised performer's real motion while dynamically retargeting only the speech and mouth performance.", action: "Create Photoreal Replica" },
  "gesture-profiles": { eyebrow: "Motion with restraint", title: "Gesture Profiles", description: "Define natural blink, gaze and head-movement ranges for each conversation state.", action: "New profile" },
  "live-sessions": { eyebrow: "Realtime operations", title: "Live Sessions", description: "Monitor disclosed conversations, transport health and safe audio-only fallback.", action: "Start test session" },
  "presenter-studio": { eyebrow: "VowHumans Present", title: "Presenter Studio", description: "Turn approved course scripts into reviewable scenes and queued media exports.", action: "New project" },
  languages: { eyebrow: "Capability registry", title: "Languages", description: "Honest per-language, per-capability status, providers, voices and real test tools — nothing is marked production before it passes the quality gate.", action: "Test & compare" },
  applications: { eyebrow: "GoalVow ecosystem", title: "Applications", description: "Connect one digital human to several products with application-specific Personas.", action: "Connect application" },
  usage: { eyebrow: "Performance + cost", title: "Usage", description: "Track sessions, provider spend, latency and render demand without reading private content.", action: "Export report" },
  "identity-consent": { eyebrow: "Governance before generation", title: "Identity & Consent", description: "Publication stays blocked until the identity owner and every permitted use are approved.", action: "Register identity" },
  "api-keys": { eyebrow: "Server-side access", title: "API Keys", description: "Issue hash-only, scoped service credentials for trusted GoalVow applications.", action: "Create API key" },
  webhooks: { eyebrow: "Signed events", title: "Webhooks", description: "Deliver verified, retry-safe lifecycle events without leaking transcript content.", action: "Add endpoint" },
  safety: { eyebrow: "Always enforced", title: "Safety Centre", description: "Review disclosure, moderation, consent, retention and abuse-prevention controls.", action: "Report concern" },
  "audit-logs": { eyebrow: "Immutable history", title: "Audit Logs", description: "Trace identity approvals, Persona publication, access and deletion decisions.", action: "Export audit" },
  settings: { eyebrow: "Organisation controls", title: "Settings", description: "Configure GoalVow Platform defaults, retention and feature availability.", action: "Save changes" },
};

export const iconForAsset = {
  knowledge: BookOpenText,
  key: FileKey2,
  event: Activity,
  system: Boxes,
};
