export const WORKFORCE_BUILDER_STEPS = [
  "role",
  "functions",
  "skills",
  "knowledge",
  "tools",
  "workflows",
  "objectives",
  "guardrails",
  "collaboration",
  "testing",
  "approval",
  "deployment",
] as const;

export type WorkforceBuilderStep = (typeof WORKFORCE_BUILDER_STEPS)[number];
export type DigitalColleagueStatus = "draft" | "configuring" | "testing" | "review" | "approved" | "deployed" | "paused" | "archived";
export type WorkforceRiskLevel = "low" | "medium" | "high" | "regulated";
export type WorkforceAutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type WorkforceDecision = "allow" | "review" | "escalate" | "block";

export const AUTONOMY_LEVELS: ReadonlyArray<{ level: WorkforceAutonomyLevel; label: string; description: string }> = [
  { level: 0, label: "Observe", description: "Read-only observation and classification. No changes or outbound actions." },
  { level: 1, label: "Draft", description: "Prepare drafts and recommendations for a person to review." },
  { level: 2, label: "Assist", description: "Complete reversible internal tasks inside explicit limits." },
  { level: 3, label: "Operate", description: "Execute approved workflows with checkpoints and exception escalation." },
  { level: 4, label: "Orchestrate", description: "Coordinate bounded tools and colleagues under a human-owned operating policy." },
  { level: 5, label: "Reserved", description: "Reserved for future evidence-backed controls; never enabled by default." },
] as const;

export type WorkforceReadinessInput = {
  name?: string | null;
  roleTitle?: string | null;
  purpose?: string | null;
  digitalHumanId?: string | null;
  personaVersionId?: string | null;
  personaPublished?: boolean;
  functionCount?: number;
  skillCount?: number;
  workflowCount?: number;
  objectiveCount?: number;
  guardrailCount?: number;
  escalationConfigured?: boolean;
  requiredKnowledgeCount?: number;
  activeKnowledgeCount?: number;
  requiredToolCount?: number;
  approvedToolCount?: number;
  testCount?: number;
  passingTestCount?: number;
  approvalCount?: number;
  riskLevel?: WorkforceRiskLevel;
  autonomyLevel?: WorkforceAutonomyLevel;
};

export type WorkforceReadinessCheck = {
  code: string;
  label: string;
  passed: boolean;
  step: WorkforceBuilderStep;
  detail: string;
};

export type WorkforceReadiness = {
  readyForReview: boolean;
  readyForDeployment: boolean;
  score: number;
  checks: WorkforceReadinessCheck[];
  blockers: WorkforceReadinessCheck[];
};

export function evaluateWorkforceReadiness(input: WorkforceReadinessInput): WorkforceReadiness {
  const requiredKnowledge = input.requiredKnowledgeCount ?? 0;
  const requiredTools = input.requiredToolCount ?? 0;
  const testCount = input.testCount ?? 0;
  const risk = input.riskLevel ?? "medium";
  const autonomy = input.autonomyLevel ?? 1;
  const checks: WorkforceReadinessCheck[] = [
    check("role", "Role and purpose are defined", Boolean(input.name?.trim() && input.roleTitle?.trim() && input.purpose?.trim()), "role", "Add a clear name, business role and bounded purpose."),
    check("identity", "Digital Human is linked", Boolean(input.digitalHumanId), "role", "Link the visible, disclosed Digital Human identity."),
    check("persona", "Published Persona is linked", Boolean(input.personaVersionId && input.personaPublished), "role", "Link an immutable published Persona version."),
    check("functions", "At least one function is bounded", (input.functionCount ?? 0) > 0, "functions", "Define what work is in scope and its hand-off conditions."),
    check("skills", "Skills support the role", (input.skillCount ?? 0) > 0, "skills", "Assign at least one role-relevant skill."),
    check("knowledge", "Required knowledge is active", requiredKnowledge === 0 || (input.activeKnowledgeCount ?? 0) >= requiredKnowledge, "knowledge", "Activate every knowledge source marked as required."),
    check("tools", "Required tools are approved", requiredTools === 0 || (input.approvedToolCount ?? 0) >= requiredTools, "tools", "Approve least-privilege access for every required tool."),
    check("workflow", "At least one workflow is configured", (input.workflowCount ?? 0) > 0, "workflows", "Describe the trigger, steps, outputs and exception path."),
    check("objectives", "Measurable objectives are set", (input.objectiveCount ?? 0) > 0, "objectives", "Set an objective with an owner and measurable indicator."),
    check("guardrails", "Guardrails are explicit", (input.guardrailCount ?? 0) >= 3, "guardrails", "Include disclosure, privacy and human-review boundaries."),
    check("escalation", "Human escalation is configured", Boolean(input.escalationConfigured), "collaboration", "Assign a human owner and escalation route."),
    check("tests", "Readiness tests pass", testCount > 0 && (input.passingTestCount ?? 0) === testCount, "testing", "Run and pass every required readiness test."),
    check("risk", "Autonomy matches risk", autonomyAllowedForRisk(autonomy, risk), "guardrails", `Reduce autonomy or add a lower-risk operating policy for ${risk} work.`),
  ];
  const blockers = checks.filter((item) => !item.passed);
  const readyForReview = blockers.length === 0;
  const readyForDeployment = readyForReview && (input.approvalCount ?? 0) > 0;
  return {
    readyForReview,
    readyForDeployment,
    score: Math.round((checks.filter((item) => item.passed).length / checks.length) * 100),
    checks,
    blockers,
  };
}

function check(code: string, label: string, passed: boolean, step: WorkforceBuilderStep, detail: string): WorkforceReadinessCheck {
  return { code, label, passed, step, detail };
}

export function autonomyAllowedForRisk(level: WorkforceAutonomyLevel, risk: WorkforceRiskLevel): boolean {
  if (level === 5) return false;
  if (risk === "regulated") return level <= 1;
  if (risk === "high") return level <= 2;
  if (risk === "medium") return level <= 3;
  return level <= 4;
}

export function decideWorkforceAction(input: {
  riskLevel: WorkforceRiskLevel;
  autonomyLevel: WorkforceAutonomyLevel;
  toolApproved: boolean;
  withinBudget: boolean;
  containsRestrictedData: boolean;
  humanReviewRequired: boolean;
}): { decision: WorkforceDecision; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.toolApproved) reasons.push("The required tool is not approved.");
  if (!input.withinBudget) reasons.push("The action exceeds its approved budget.");
  if (input.containsRestrictedData) reasons.push("Restricted data requires a protected human review path.");
  if (!autonomyAllowedForRisk(input.autonomyLevel, input.riskLevel)) reasons.push("The configured autonomy exceeds the risk policy.");
  if (!input.toolApproved || !input.withinBudget) return { decision: "block", reasons };
  if (input.containsRestrictedData || input.riskLevel === "regulated") return { decision: "escalate", reasons };
  if (input.humanReviewRequired || input.riskLevel === "high" || input.autonomyLevel <= 1) return { decision: "review", reasons: reasons.length ? reasons : ["Human approval is required before release."] };
  return { decision: "allow", reasons: ["The action is within the approved role, risk, tool and budget boundaries."] };
}

export type WorkforceTemplate = {
  slug: string;
  name: string;
  department: string;
  summary: string;
  riskLevel: WorkforceRiskLevel;
  autonomyLevel: WorkforceAutonomyLevel;
  functions: string[];
  skills: string[];
  humanReview: string;
};

const template = (slug: string, name: string, department: string, summary: string, functions: string[], skills: string[], humanReview: string, riskLevel: WorkforceRiskLevel = "medium", autonomyLevel: WorkforceAutonomyLevel = 1): WorkforceTemplate => ({
  slug, name, department, summary, riskLevel, autonomyLevel, functions, skills, humanReview,
});

export const workforceTemplates: readonly WorkforceTemplate[] = [
  template("ai-receptionist", "AI Receptionist", "Operations", "Welcomes visitors, answers approved service questions and routes requests to the correct person.", ["Answer approved enquiries", "Capture contact details", "Route and escalate requests"], ["Service triage", "Clear communication", "Information retrieval"], "A person reviews sensitive, disputed or out-of-scope requests."),
  template("customer-service", "Customer Service Colleague", "Customer Experience", "Resolves bounded service requests using approved policies and creates reviewable hand-offs.", ["Classify requests", "Draft policy-grounded responses", "Create escalation briefs"], ["Customer support", "Case summarisation", "De-escalation"], "Refunds, complaints and account changes require human approval."),
  template("sales-development", "Sales Development Colleague", "Sales", "Qualifies consented leads and prepares personalised, reviewable outreach.", ["Research consented accounts", "Qualify opportunities", "Draft outreach"], ["Qualification", "CRM hygiene", "Business writing"], "A salesperson approves outbound messages and commercial commitments."),
  template("sales-assistant", "Sales Assistant", "Sales", "Prepares meeting briefs, proposals and follow-ups from approved commercial information.", ["Prepare briefs", "Draft proposals", "Summarise meetings"], ["Proposal writing", "Pipeline support", "Summarisation"], "Humans approve pricing, promises and contract language."),
  template("hr-administrator", "HR Administrator", "People", "Supports policy-grounded employee administration without making employment decisions.", ["Answer policy questions", "Prepare onboarding checklists", "Route employee requests"], ["HR operations", "Document preparation", "Privacy handling"], "All employment decisions and sensitive cases stay human-owned.", "high", 1),
  template("recruitment-coordinator", "Recruitment Coordinator", "People", "Coordinates interview logistics and candidate communications without scoring people.", ["Coordinate interviews", "Draft candidate updates", "Prepare interview packs"], ["Scheduling", "Candidate communication", "Process coordination"], "Humans decide hiring outcomes; appearance and emotion scoring are prohibited.", "high", 1),
  template("tutor", "Learning Tutor", "Learning", "Explains approved learning material with citations and escalates safeguarding concerns.", ["Explain lessons", "Generate practice questions", "Cite approved sources"], ["Tutoring", "Adaptive explanation", "Assessment support"], "Educators review assessments and safeguarding escalations."),
  template("learning-coach", "Learning Coach", "Learning", "Supports learner planning, reflection and progress using approved curriculum boundaries.", ["Create study plans", "Guide reflection", "Summarise progress"], ["Learning design", "Coaching", "Progress tracking"], "An educator owns final assessment and pastoral decisions."),
  template("executive-assistant", "Executive Assistant", "Executive Office", "Prepares schedules, briefs and action registers while protecting confidential material.", ["Prepare daily briefs", "Draft agendas", "Track approved actions"], ["Executive communication", "Prioritisation", "Meeting support"], "A human approves outbound commitments and confidential distribution."),
  template("operations-coordinator", "Operations Coordinator", "Operations", "Monitors approved processes and prepares exception-based operational hand-offs.", ["Track workflow state", "Prepare exception briefs", "Coordinate hand-offs"], ["Process monitoring", "Operational reporting", "Issue triage"], "Exceptions affecting people, money or safety require human approval."),
  template("project-coordinator", "Project Coordinator", "Delivery", "Maintains plans, action registers and reviewable project communications.", ["Update project plans", "Track dependencies", "Draft status reports"], ["Project coordination", "Risk logging", "Status communication"], "A project owner approves scope, budget and deadline changes."),
  template("marketing-assistant", "Marketing Assistant", "Marketing", "Creates evidence-grounded campaign drafts and content variations for review.", ["Draft campaign content", "Repurpose approved material", "Prepare content calendars"], ["Copywriting", "Content operations", "Brand alignment"], "A marketer approves publication, claims and audience targeting."),
  template("social-media-coordinator", "Social Media Coordinator", "Marketing", "Prepares platform-ready social drafts and routes reputational risks.", ["Draft social posts", "Prepare response options", "Tag review risks"], ["Social writing", "Community triage", "Brand voice"], "Humans publish posts and handle complaints or crises."),
  template("finance-assistant", "Finance Assistant", "Finance", "Prepares reconciliations and finance summaries without authorising transactions.", ["Prepare reconciliations", "Classify finance requests", "Draft variance notes"], ["Financial administration", "Data checking", "Reporting"], "Payments, journals and financial advice require authorised human approval.", "regulated", 1),
  template("accounting-clerk", "Accounting Clerk", "Finance", "Organises source documents and prepares review queues for authorised accountants.", ["Classify documents", "Prepare posting batches", "Flag exceptions"], ["Bookkeeping support", "Document validation", "Exception detection"], "An authorised accountant approves every posting or payment.", "regulated", 1),
  template("compliance-assistant", "Compliance Assistant", "Risk", "Maps evidence to approved controls and prepares review-ready compliance packs.", ["Collect evidence references", "Map controls", "Draft review packs"], ["Control mapping", "Evidence management", "Policy retrieval"], "A qualified compliance owner makes all determinations.", "regulated", 1),
  template("legal-intake", "Legal Intake Colleague", "Legal", "Captures matter details and routes them without giving legal advice.", ["Capture intake", "Classify matter type", "Prepare counsel brief"], ["Legal operations", "Issue spotting", "Confidential handling"], "Qualified counsel owns legal advice and decisions.", "regulated", 1),
  template("it-helpdesk", "IT Helpdesk Colleague", "Technology", "Resolves approved low-risk support requests and creates traceable escalation tickets.", ["Diagnose approved issues", "Guide safe fixes", "Create escalation tickets"], ["Technical support", "Troubleshooting", "Ticket documentation"], "Access changes, security incidents and destructive actions require human approval.", "high", 2),
  template("data-analyst", "Data Analyst Colleague", "Analytics", "Produces reproducible summaries from approved, minimised datasets.", ["Validate data inputs", "Generate analysis", "Document assumptions"], ["Data analysis", "Visualisation", "Quality checking"], "A human validates decisions, sensitive joins and external reporting."),
  template("business-analyst", "Business Analyst Colleague", "Strategy", "Structures requirements and prepares evidence-backed process recommendations.", ["Capture requirements", "Map processes", "Draft recommendations"], ["Requirements analysis", "Process mapping", "Stakeholder synthesis"], "Business owners approve scope and operating changes."),
  template("procurement-assistant", "Procurement Assistant", "Procurement", "Prepares comparable supplier information without selecting or committing suppliers.", ["Prepare request packs", "Compare approved criteria", "Draft evaluation summaries"], ["Procurement operations", "Supplier research", "Comparison"], "Authorised humans approve selection, negotiation and purchase commitments.", "high", 1),
  template("quality-assurance", "Quality Assurance Colleague", "Quality", "Runs approved checks and prepares evidence for accountable release owners.", ["Run quality checks", "Record evidence", "Prepare defect summaries"], ["Quality testing", "Evidence capture", "Defect triage"], "A release owner accepts risk and approves production release."),
  template("content-editor", "Content Editor", "Content", "Checks approved content for clarity, consistency and accessibility.", ["Edit drafts", "Check brand consistency", "Flag unsupported claims"], ["Editing", "Accessibility", "Fact checking"], "A named content owner approves publication."),
  template("research-assistant", "Research Assistant", "Research", "Finds and synthesises approved sources while labelling uncertainty and citations.", ["Search approved sources", "Create evidence summaries", "Maintain citations"], ["Research", "Source evaluation", "Synthesis"], "A subject-matter expert validates material conclusions."),
  template("engineering-assistant", "Engineering Assistant", "Engineering", "Prepares code, tests and documentation in a controlled review workflow.", ["Draft code changes", "Generate tests", "Prepare technical notes"], ["Software engineering", "Testing", "Documentation"], "Engineers review and approve every merge and production action.", "high", 1),
] as const;

export function workforceTemplateBySlug(slug: string): WorkforceTemplate | undefined {
  return workforceTemplates.find((candidate) => candidate.slug === slug);
}
