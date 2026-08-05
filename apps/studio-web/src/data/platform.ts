import {
  Activity,
  AppWindow,
  AudioLines,
  BookOpenText,
  Bot,
  Boxes,
  BrainCircuit,
  ChartNoAxesCombined,
  CircleGauge,
  FileKey2,
  Fingerprint,
  KeyRound,
  LibraryBig,
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

export const personas = [
  { name: "Professional Practice Interviewer", role: "Talent Partner", version: "v3", state: "Published", updated: "2 Aug 2026" },
  { name: "GoalVow Course Tutor", role: "Course Facilitator", version: "v5", state: "Published", updated: "1 Aug 2026" },
  { name: "Career Coach", role: "Career Adviser", version: "v1", state: "Draft", updated: "30 Jul 2026" },
  { name: "Learning Mentor", role: "Learning Companion", version: "v2", state: "Published", updated: "28 Jul 2026" },
  { name: "Support Adviser", role: "Customer Support", version: "v1", state: "Draft", updated: "25 Jul 2026" },
];

export const navigation = [
  {
    label: "Workspace",
    items: [
      { slug: "", label: "Dashboard", icon: CircleGauge },
      { slug: "digital-humans", label: "Digital Humans", icon: Bot },
      { slug: "personas", label: "Personas", icon: BrainCircuit },
      { slug: "knowledge", label: "Knowledge", icon: LibraryBig },
      { slug: "voices", label: "Voices", icon: AudioLines },
      { slug: "faces", label: "Faces", icon: Fingerprint },
      { slug: "gesture-profiles", label: "Gesture Profiles", icon: Sparkles },
    ],
  },
  {
    label: "Operate",
    items: [
      { slug: "live-sessions", label: "Live Sessions", icon: Radio },
      { slug: "presenter-studio", label: "Presenter Studio", icon: Video },
      { slug: "applications", label: "Applications", icon: AppWindow },
      { slug: "usage", label: "Usage", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Govern",
    items: [
      { slug: "identity-consent", label: "Identity & Consent", icon: UsersRound },
      { slug: "api-keys", label: "API Keys", icon: KeyRound },
      { slug: "webhooks", label: "Webhooks", icon: Webhook },
      { slug: "safety", label: "Safety", icon: ShieldCheck },
      { slug: "audit-logs", label: "Audit Logs", icon: ScrollText },
      { slug: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const pageMeta: Record<string, { eyebrow: string; title: string; description: string; action: string }> = {
  dashboard: { eyebrow: "Monday, 3 August", title: "Good evening, Naledi", description: "Here’s what your digital humans are doing across GoalVow today.", action: "Create digital human" },
  "digital-humans": { eyebrow: "Identity + voice + Persona", title: "Digital Humans", description: "Manage every disclosed AI representative and the applications they can serve.", action: "New digital human" },
  personas: { eyebrow: "Behaviour layer", title: "Personas", description: "Design roles, guardrails, objectives, knowledge and conversation style with immutable published versions.", action: "New Persona" },
  knowledge: { eyebrow: "Retrieval with citations", title: "Knowledge", description: "Control the approved sources that ground tutors, interviewers and advisers.", action: "Add source" },
  voices: { eyebrow: "Consented audio", title: "Voices", description: "Configure provider voices and approved custom voice assets without exposing provider credentials.", action: "Add voice" },
  faces: { eyebrow: "Identity layer", title: "Faces", description: "Review licensed visual assets, provenance and commercial permissions separately from Persona behaviour.", action: "Add face asset" },
  "gesture-profiles": { eyebrow: "Motion with restraint", title: "Gesture Profiles", description: "Define natural blink, gaze and head-movement ranges for each conversation state.", action: "New profile" },
  "live-sessions": { eyebrow: "Realtime operations", title: "Live Sessions", description: "Monitor disclosed conversations, transport health and safe audio-only fallback.", action: "Start test session" },
  "presenter-studio": { eyebrow: "VowHumans Present", title: "Presenter Studio", description: "Turn approved course scripts into reviewable scenes and queued media exports.", action: "New project" },
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
