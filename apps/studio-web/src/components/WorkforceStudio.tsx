"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Gauge,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import {
  AUTONOMY_LEVELS,
  WORKFORCE_BUILDER_STEPS,
  type WorkforceBuilderStep,
  type WorkforceTemplate,
} from "@vowhumans/commercial-core/workforce";

type RecordItem = Record<string, unknown>;
type CapabilityState = {
  role_generation: boolean;
  model_execution: boolean;
  tool_execution: boolean;
  schedules: boolean;
};
type References = {
  humans: RecordItem[];
  personas: RecordItem[];
  knowledge: RecordItem[];
  tools: RecordItem[];
  users: RecordItem[];
  teams: RecordItem[];
};
type DashboardPayload = {
  colleagues: RecordItem[];
  tasks: RecordItem[];
  work_products: RecordItem[];
  approvals: RecordItem[];
  escalations: RecordItem[];
  costs: RecordItem[];
  references: References;
  templates: WorkforceTemplate[];
  capabilities: CapabilityState;
};
type Readiness = {
  readyForReview: boolean;
  readyForDeployment: boolean;
  score: number;
  checks: Array<{
    code: string;
    label: string;
    passed: boolean;
    step: string;
    detail: string;
  }>;
  blockers: Array<{
    code: string;
    label: string;
    step: string;
    detail: string;
  }>;
};
type ColleagueDetail = RecordItem & {
  functions: RecordItem[];
  skills: RecordItem[];
  knowledge: RecordItem[];
  tools: RecordItem[];
  workflows: RecordItem[];
  objectives: RecordItem[];
  kpis: RecordItem[];
  guardrails: RecordItem[];
  collaboration: RecordItem[];
  tests: RecordItem[];
  approvals: RecordItem[];
  deployments: RecordItem[];
  readiness: Readiness;
};

const stepLabels: Record<WorkforceBuilderStep, string> = {
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

const stepDescriptions: Record<WorkforceBuilderStep, string> = {
  role: "Connect identity and behaviour to a bounded business role.",
  functions: "Define the work that is in scope, out of scope and human-owned.",
  skills:
    "Record what the colleague may apply and what evidence must prove it.",
  knowledge:
    "Assign only approved sources that can ground this colleague's work.",
  tools: "Grant least-privilege tool actions without storing credentials here.",
  workflows: "Describe triggers, traceable steps, outputs and exception paths.",
  objectives:
    "Set accountable objectives and measurable indicators without invented baselines.",
  guardrails:
    "Enforce disclosure, privacy, role boundaries and human authority.",
  collaboration:
    "Name the human owner, escalation route and any controlled hand-off.",
  testing: "Run deterministic readiness checks before asking for approval.",
  approval: "Create an immutable approval snapshot with a reviewer rationale.",
  deployment: "Choose a governed environment and enabled delivery channel.",
};

function value(item: RecordItem | null | undefined, key: string): unknown {
  return item?.[key];
}
function stringValue(input: unknown): string {
  return input === null || input === undefined ? "" : String(input);
}
function numberValue(input: unknown): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}
function boolValue(input: unknown): boolean {
  return Boolean(input);
}
function listValue(input: unknown): string[] {
  return Array.isArray(input) ? input.map(stringValue) : [];
}
function recordList(input: unknown): RecordItem[] {
  return Array.isArray(input)
    ? input.filter(
        (item): item is RecordItem =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
function dateLabel(input: unknown): string {
  const date = new Date(stringValue(input));
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
function humanStatus(input: unknown): string {
  return stringValue(input).replaceAll("_", " ");
}

async function workforceApi<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/workforce${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    message?: string;
    detail?: unknown;
  } | null;
  if (!response.ok || !payload?.success)
    throw new Error(
      payload?.message || "The workforce request could not be completed.",
    );
  return payload.data as T;
}

function StatusBadge({
  status,
  tone,
}: {
  status: unknown;
  tone?: "good" | "warn" | "danger" | "info";
}) {
  const normalized = stringValue(status) || "unknown";
  const resolvedTone =
    tone ??
    (["approved", "deployed", "completed", "passed", "active"].includes(
      normalized,
    )
      ? "good"
      : ["failed", "rejected", "blocked"].includes(normalized)
        ? "danger"
        : ["review", "awaiting_review", "testing", "escalated"].includes(
              normalized,
            )
          ? "warn"
          : "info");
  return (
    <span className={`workforce-status ${resolvedTone}`}>
      <i />
      {humanStatus(normalized)}
    </span>
  );
}

function EmptyState({
  icon: Icon = BriefcaseBusiness,
  title,
  copy,
  action,
}: {
  icon?: typeof BriefcaseBusiness;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="workforce-empty">
      <span>
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="workforce-loading" role="status">
      <RefreshCw size={20} />
      Loading the governed workforce…
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="workforce-alert danger" role="alert">
      <CircleAlert size={19} />
      <div>
        <strong>Could not complete this action</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function DefinitionStrip() {
  const items = [
    {
      icon: UserRound,
      title: "Digital Human",
      copy: "The disclosed visual and conversational identity: face, voice, gesture and presence.",
      accent: "cyan",
    },
    {
      icon: BrainCircuit,
      title: "Persona",
      copy: "The versioned behaviour layer: instructions, style, language and conversational boundaries.",
      accent: "violet",
    },
    {
      icon: BriefcaseBusiness,
      title: "Digital Colleague",
      copy: "The business worker that combines identity and Persona with functions, skills, tools, workflow, objectives and accountability.",
      accent: "magenta",
    },
  ];
  return (
    <section
      className="workforce-definition"
      aria-label="VowHumans operating model"
    >
      {items.map((item, index) => (
        <article
          key={item.title}
          className={`workforce-definition-card ${item.accent}`}
        >
          <span>
            <item.icon size={21} />
          </span>
          <div>
            <small>
              {index === 2 ? "Composes the foundations" : "Reusable foundation"}
            </small>
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
          </div>
          {index < 2 && <ChevronRight className="definition-arrow" size={20} />}
        </article>
      ))}
    </section>
  );
}

function WorkforceDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      workforceApi<DashboardPayload>()
        .then(setData)
        .catch((reason: Error) => setError(reason.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data && !error) return <LoadingState />;
  if (!data) return <ErrorBanner message={error} />;
  const deployed = data.colleagues.filter(
    (item) => value(item, "status") === "deployed",
  ).length;
  const review = data.colleagues.filter(
    (item) => value(item, "status") === "review",
  ).length;
  const openWork = data.tasks.filter(
    (item) =>
      !["completed", "failed", "cancelled"].includes(
        stringValue(value(item, "status")),
      ),
  ).length;
  const pendingProducts = data.work_products.filter(
    (item) => value(item, "status") === "awaiting_review",
  ).length;
  return (
    <div className="content-stack workforce-dashboard">
      <DefinitionStrip />
      <section className="workforce-command-hero">
        <div>
          <p className="eyebrow">
            <span className="pulse-dot" /> Governed operating layer
          </p>
          <h2>Design work around accountable digital colleagues.</h2>
          <p>
            Give every role a disclosed identity, a published Persona, bounded
            work, approved knowledge, least-privilege tools and a named human
            escalation route.
          </p>
          <div className="workforce-hero-actions">
            <Link href="/studio/workforce/create" className="primary-button">
              <Plus size={18} />
              Create Digital Colleague
            </Link>
            <Link href="/workforce/how-it-works" className="secondary-button">
              View operating model <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        <div className="workforce-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
          <div>
            <BriefcaseBusiness size={30} />
            <strong>Role</strong>
            <small>Human governed</small>
          </div>
          <span className="orbit-node one">
            <BrainCircuit size={18} />
          </span>
          <span className="orbit-node two">
            <UserRound size={18} />
          </span>
          <span className="orbit-node three">
            <ShieldCheck size={18} />
          </span>
        </div>
      </section>
      <section
        className="workforce-metrics"
        aria-label="Recorded workforce state"
      >
        {[
          {
            label: "Digital colleagues",
            figure: data.colleagues.length,
            note: "Configured in this organisation",
            icon: UsersRound,
          },
          {
            label: "Deployed",
            figure: deployed,
            note: "Governed work-queue deployments",
            icon: Rocket,
          },
          {
            label: "Open work",
            figure: openWork,
            note: "Recorded work items",
            icon: Workflow,
          },
          {
            label: "Human review",
            figure: pendingProducts + review,
            note: "Products and colleagues awaiting review",
            icon: ClipboardCheck,
          },
        ].map((item) => (
          <article key={item.label}>
            <span>
              <item.icon size={20} />
            </span>
            <small>{item.label}</small>
            <strong>{item.figure}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </section>
      <div className="workforce-dashboard-grid">
        <section className="workforce-panel workforce-colleague-list">
          <div className="workforce-panel-heading">
            <div>
              <p className="eyebrow">Digital workforce</p>
              <h2>Your Digital Colleagues</h2>
            </div>
            <Link href="/studio/workforce/create" className="plain-button">
              Add colleague <Plus size={16} />
            </Link>
          </div>
          {data.colleagues.length === 0 ? (
            <EmptyState
              title="No Digital Colleagues yet"
              copy="Start with a governed role template, then connect its Digital Human and published Persona."
              action={
                <Link
                  href="/studio/workforce/create"
                  className="primary-button"
                >
                  Choose a template
                </Link>
              }
            />
          ) : (
            <div className="workforce-list">
              {data.colleagues.map((item) => (
                <Link
                  key={stringValue(value(item, "id"))}
                  href={`/studio/workforce/${stringValue(value(item, "id"))}/${WORKFORCE_BUILDER_STEPS[Math.max(0, Math.min(11, numberValue(value(item, "builder_step")) - 1))]}`}
                  className="workforce-list-row"
                >
                  <span className="colleague-avatar">
                    <Bot size={20} />
                  </span>
                  <div>
                    <strong>{stringValue(value(item, "name"))}</strong>
                    <small>
                      {stringValue(value(item, "role_title")) ||
                        "Role definition in progress"}{" "}
                      ·{" "}
                      {stringValue(value(item, "department")) ||
                        "Unassigned team"}
                    </small>
                  </div>
                  <div className="list-row-meta">
                    <StatusBadge status={value(item, "status")} />
                    <small>
                      {numberValue(value(item, "function_count"))} functions ·{" "}
                      {numberValue(value(item, "open_work_count"))} open
                    </small>
                  </div>
                  <ChevronRight size={18} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside className="workforce-panel workforce-review-rail">
          <div className="workforce-panel-heading">
            <div>
              <p className="eyebrow">Human authority</p>
              <h2>Review queue</h2>
            </div>
          </div>
          <div className="review-rail-stat">
            <span>
              <ClipboardCheck size={18} />
            </span>
            <div>
              <strong>{pendingProducts}</strong>
              <small>work products awaiting a person</small>
            </div>
          </div>
          <div className="review-rail-stat">
            <span>
              <CircleAlert size={18} />
            </span>
            <div>
              <strong>{data.escalations.length}</strong>
              <small>open exceptions</small>
            </div>
          </div>
          <Link href="/studio/approvals" className="secondary-button">
            Open approvals <ArrowRight size={16} />
          </Link>
          <div className="capability-truth">
            <strong>Capability truth</strong>
            <p>
              Model execution:{" "}
              {data.capabilities.model_execution ? "configured" : "disabled"}
            </p>
            <p>
              External tools:{" "}
              {data.capabilities.tool_execution ? "configured" : "disabled"}
            </p>
            <p>
              Schedules:{" "}
              {data.capabilities.schedules ? "configured" : "disabled"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CreateColleague() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkforceTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkforceTemplate | null>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    workforceApi<{ items: WorkforceTemplate[] }>("/templates")
      .then((result) => setTemplates(result.items))
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const visible = templates.filter((item) =>
    `${item.name} ${item.department} ${item.summary}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function create() {
    setBusy(true);
    setError("");
    try {
      const colleague = await workforceApi<ColleagueDetail>("", {
        method: "POST",
        body: JSON.stringify({
          template_slug: selected?.slug,
          name: name || selected?.name,
          purpose: purpose || selected?.summary,
        }),
      });
      router.push(
        `/studio/workforce/${stringValue(value(colleague, "id"))}/role`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create the Digital Colleague.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="content-stack workforce-create">
      <section className="workforce-create-intro">
        <div>
          <p className="eyebrow">Template catalogue</p>
          <h2>Start with a bounded role, not a blank agent.</h2>
          <p>
            Each template creates an editable draft with recommended functions,
            skills, guardrails, workflow, objective and human-review policy. It
            never approves or deploys itself.
          </p>
        </div>
        <div className="template-search">
          <Search size={18} />
          <input
            aria-label="Search role templates"
            placeholder="Search roles or departments"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>
      {error && <ErrorBanner message={error} />}
      <section
        className="workforce-template-grid"
        aria-label="Digital Colleague templates"
      >
        {visible.map((item) => (
          <button
            key={item.slug}
            type="button"
            className={selected?.slug === item.slug ? "selected" : ""}
            onClick={() => {
              setSelected(item);
              setName(item.name);
              setPurpose(item.summary);
            }}
          >
            <span className="template-icon">
              <BriefcaseBusiness size={21} />
            </span>
            <div className="template-card-head">
              <small>{item.department}</small>
              <StatusBadge
                status={`${item.riskLevel} risk`}
                tone={
                  item.riskLevel === "regulated" || item.riskLevel === "high"
                    ? "warn"
                    : "info"
                }
              />
            </div>
            <h3>{item.name}</h3>
            <p>{item.summary}</p>
            <ul>
              {item.functions.slice(0, 3).map((fn) => (
                <li key={fn}>
                  <Check size={14} />
                  {fn}
                </li>
              ))}
            </ul>
            <span className="template-select">
              {selected?.slug === item.slug ? "Selected" : "Use template"}
              <ArrowRight size={15} />
            </span>
          </button>
        ))}
      </section>
      <section
        className="workforce-panel create-confirm"
        id="studio-primary-action"
      >
        <div>
          <p className="eyebrow">Draft identity</p>
          <h2>
            {selected ? `Configure ${selected.name}` : "Create a manual role"}
          </h2>
          <p>
            Give the draft a working name and clarify its purpose. You will
            connect a Digital Human and published Persona in step one.
          </p>
        </div>
        <div className="form-grid two">
          <label>
            Colleague name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Naledi — Customer Care"
            />
          </label>
          <label>
            Role template
            <input value={selected?.name || "Manual configuration"} readOnly />
          </label>
          <label className="span-two">
            Bounded purpose
            <textarea
              rows={4}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What this colleague exists to do—and what remains human-owned."
            />
          </label>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={create}
          disabled={busy || (!selected && !name.trim())}
        >
          {busy ? (
            <RefreshCw className="spin" size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
          {busy ? "Creating governed draft…" : "Create draft and configure"}
        </button>
      </section>
    </div>
  );
}

function defaultStepState(
  step: WorkforceBuilderStep,
  colleague: ColleagueDetail,
): RecordItem {
  if (step === "role")
    return {
      name: value(colleague, "name"),
      role_title: value(colleague, "role_title"),
      department: value(colleague, "department"),
      team_name: value(colleague, "team_name"),
      purpose: value(colleague, "purpose"),
      seniority: value(colleague, "seniority"),
      digital_human_id: value(colleague, "digital_human_id"),
      persona_version_id: value(colleague, "persona_version_id"),
      workforce_team_id: value(colleague, "workforce_team_id"),
      human_owner_user_id: value(colleague, "human_owner_user_id"),
      escalation_owner_user_id: value(colleague, "escalation_owner_user_id"),
      risk_level: value(colleague, "risk_level"),
      autonomy_level: value(colleague, "autonomy_level"),
      supported_languages: listValue(
        value(colleague, "supported_languages"),
      ).join(", "),
    };
  if (step === "functions")
    return {
      items: colleague.functions.map((item) => ({
        ...item,
        in_scope_text: listValue(value(item, "in_scope")).join("\n"),
        out_of_scope_text: listValue(value(item, "out_of_scope")).join("\n"),
      })),
    };
  if (step === "skills")
    return { items: colleague.skills.map((item) => ({ ...item })) };
  if (step === "knowledge")
    return {
      selected: colleague.knowledge.map((item) =>
        stringValue(value(item, "knowledge_base_id")),
      ),
    };
  if (step === "tools")
    return {
      selected: colleague.tools.map((item) =>
        stringValue(value(item, "workforce_tool_id")),
      ),
    };
  if (step === "workflows")
    return {
      items: colleague.workflows.length
        ? colleague.workflows.map((item) => ({
            ...item,
            step_text: recordList(value(item, "steps"))
              .map((entry) => stringValue(value(entry, "action")))
              .join("\n"),
          }))
        : [
            {
              name: "Primary work intake",
              trigger_type: "manual",
              expected_output: "Reviewable work product",
              exception_policy: "Escalate exceptions to the human owner",
              human_checkpoint_policy: "Human review before external release",
              step_text:
                "Validate the request scope\nUse approved knowledge and tools\nPrepare a reviewable work product\nEscalate exceptions",
            },
          ],
    };
  if (step === "objectives")
    return {
      items: colleague.objectives.length
        ? colleague.objectives.map((item) => ({
            ...item,
            kpis: colleague.kpis.filter(
              (kpi) => value(kpi, "objective_id") === value(item, "id"),
            ),
          }))
        : [
            {
              label: "Deliver safe, reviewable work",
              description: value(colleague, "purpose"),
              kpis: [
                {
                  name: "Human-approved completion rate",
                  unit: "percent",
                  direction: "increase",
                  measurement_policy: "Measured from explicit reviews only",
                },
              ],
            },
          ],
    };
  if (step === "guardrails")
    return { items: colleague.guardrails.map((item) => ({ ...item })) };
  if (step === "collaboration")
    return {
      items: colleague.collaboration.length
        ? colleague.collaboration.map((item) => ({ ...item }))
        : [
            {
              route_type: "human_escalation",
              target_user_id: value(colleague, "escalation_owner_user_id"),
              condition:
                "Anything sensitive, disputed, out of scope or below confidence threshold",
              service_level_minutes: 60,
              channel: "work_queue",
            },
          ],
    };
  return {};
}

function TextField({
  label,
  name,
  form,
  setForm,
  textarea = false,
  rows = 3,
  placeholder = "",
  required = false,
}: {
  label: string;
  name: string;
  form: RecordItem;
  setForm: (next: RecordItem) => void;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const props = {
    value: stringValue(form[name]),
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm({ ...form, [name]: event.target.value }),
    placeholder,
    required,
  };
  return (
    <label>
      {label}
      {textarea ? <textarea {...props} rows={rows} /> : <input {...props} />}
    </label>
  );
}

function ConfigurationStep({
  step,
  colleague,
  references,
  onUpdated,
}: {
  step: WorkforceBuilderStep;
  colleague: ColleagueDetail;
  references: References;
  onUpdated: (next: ColleagueDetail) => void;
}) {
  const [form, setForm] = useState<RecordItem>(() =>
    defaultStepState(step, colleague),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const items = recordList(form.items);
  function setItems(next: RecordItem[]) {
    setForm({ ...form, items: next });
  }
  function updateItem(index: number, key: string, next: unknown) {
    setItems(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: next } : item,
      ),
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    let payload = form;
    if (step === "role")
      payload = {
        ...form,
        autonomy_level: numberValue(form.autonomy_level),
        supported_languages: stringValue(form.supported_languages)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    if (step === "functions")
      payload = {
        items: items.map((item) => ({
          ...item,
          in_scope: stringValue(
            value(item, "in_scope_text") ||
              listValue(value(item, "in_scope")).join("\n"),
          )
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean),
          out_of_scope: stringValue(
            value(item, "out_of_scope_text") ||
              listValue(value(item, "out_of_scope")).join("\n"),
          )
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean),
        })),
      };
    if (step === "knowledge")
      payload = {
        items: listValue(form.selected).map((id) => ({
          knowledge_base_id: id,
          required: true,
          purpose: "Approved role knowledge",
        })),
      };
    if (step === "tools")
      payload = {
        items: listValue(form.selected).map((id) => ({
          workforce_tool_id: id,
          permitted_actions: ["read", "draft"],
          denied_actions: ["delete", "publish", "commit_funds"],
          requires_human_review: true,
          required: false,
          status: "pending",
        })),
      };
    if (step === "workflows")
      payload = {
        items: items.map((item) => ({
          ...item,
          steps: stringValue(value(item, "step_text"))
            .split("\n")
            .map((action, index) => ({
              order: index + 1,
              action: action.trim(),
            }))
            .filter((entry) => entry.action),
          max_iterations: 1,
        })),
      };
    try {
      const updated = await workforceApi<ColleagueDetail>(
        `/colleagues/${stringValue(value(colleague, "id"))}/steps/${step}`,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      onUpdated(updated);
      setNotice("Saved to the organisation workspace.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save this step.",
      );
    }
    setBusy(false);
  }
  async function runTests() {
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await workforceApi<ColleagueDetail>(
          `/colleagues/${stringValue(value(colleague, "id"))}/tests/run`,
          { method: "POST", body: "{}" },
        ),
      );
      setNotice("Readiness tests completed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not run readiness tests.",
      );
    }
    setBusy(false);
  }
  async function approve() {
    const rationale = stringValue(form.rationale);
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await workforceApi<ColleagueDetail>(
          `/colleagues/${stringValue(value(colleague, "id"))}/approvals`,
          { method: "POST", body: JSON.stringify({ rationale }) },
        ),
      );
      setNotice("Immutable approval recorded.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not approve this colleague.",
      );
    }
    setBusy(false);
  }
  async function deploy() {
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await workforceApi<ColleagueDetail>(
          `/colleagues/${stringValue(value(colleague, "id"))}/deployments`,
          {
            method: "POST",
            body: JSON.stringify({
              environment: form.environment || "sandbox",
              channels: ["work_queue"],
            }),
          },
        ),
      );
      setNotice("Governed work-queue deployment created.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not deploy this colleague.",
      );
    }
    setBusy(false);
  }
  return (
    <section
      className="workforce-panel workforce-step-card"
      id="studio-primary-action"
    >
      <div className="workforce-panel-heading">
        <div>
          <p className="eyebrow">
            Step {WORKFORCE_BUILDER_STEPS.indexOf(step) + 1} of 12
          </p>
          <h2>{stepLabels[step]}</h2>
          <p>{stepDescriptions[step]}</p>
        </div>
        {step !== "testing" && step !== "approval" && step !== "deployment" && (
          <button
            type="button"
            className="primary-button"
            onClick={save}
            disabled={busy}
          >
            {busy ? (
              <RefreshCw className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Save step
          </button>
        )}
      </div>
      {error && <ErrorBanner message={error} />}
      {notice && (
        <div className="workforce-alert good" role="status">
          <BadgeCheck size={19} />
          <div>
            <strong>Workspace updated</strong>
            <p>{notice}</p>
          </div>
        </div>
      )}
      {step === "role" && (
        <div className="form-grid two">
          <TextField
            label="Colleague name"
            name="name"
            form={form}
            setForm={setForm}
            required
          />
          <TextField
            label="Business role"
            name="role_title"
            form={form}
            setForm={setForm}
            required
          />
          <TextField
            label="Department"
            name="department"
            form={form}
            setForm={setForm}
          />
          <TextField
            label="Team"
            name="team_name"
            form={form}
            setForm={setForm}
          />
          <label>
            Digital Human
            <select
              value={stringValue(form.digital_human_id)}
              onChange={(event) =>
                setForm({ ...form, digital_human_id: event.target.value })
              }
            >
              <option value="">Choose disclosed identity…</option>
              {references.humans.map((item) => (
                <option
                  key={stringValue(value(item, "id"))}
                  value={stringValue(value(item, "id"))}
                >
                  {stringValue(value(item, "name"))} —{" "}
                  {humanStatus(value(item, "state"))}
                </option>
              ))}
            </select>
            <small>Visible identity; reusable across roles.</small>
          </label>
          <label>
            Published Persona
            <select
              value={stringValue(form.persona_version_id)}
              onChange={(event) =>
                setForm({ ...form, persona_version_id: event.target.value })
              }
            >
              <option value="">Choose published behaviour…</option>
              {references.personas.map((item) => (
                <option
                  key={stringValue(value(item, "id"))}
                  value={stringValue(value(item, "id"))}
                  disabled={value(item, "state") !== "published"}
                >
                  {stringValue(value(item, "name"))} v
                  {stringValue(value(item, "version"))} —{" "}
                  {humanStatus(value(item, "state"))}
                </option>
              ))}
            </select>
            <small>Only a published version can pass readiness.</small>
          </label>
          <TextField
            label="Bounded purpose"
            name="purpose"
            form={form}
            setForm={setForm}
            textarea
            rows={5}
            required
          />
          <TextField
            label="Seniority / operating level"
            name="seniority"
            form={form}
            setForm={setForm}
            placeholder="e.g. Coordinating assistant"
          />
          <label>
            Risk level
            <select
              value={stringValue(form.risk_level)}
              onChange={(event) =>
                setForm({ ...form, risk_level: event.target.value })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="regulated">Regulated</option>
            </select>
          </label>
          <label>
            Autonomy
            <select
              value={stringValue(form.autonomy_level)}
              onChange={(event) =>
                setForm({ ...form, autonomy_level: Number(event.target.value) })
              }
            >
              {AUTONOMY_LEVELS.filter((item) => item.level < 5).map((item) => (
                <option value={item.level} key={item.level}>
                  Level {item.level} — {item.label}
                </option>
              ))}
            </select>
            <small>Risk policy may lower the allowed ceiling.</small>
          </label>
          <label>
            Human owner
            <select
              value={stringValue(form.human_owner_user_id)}
              onChange={(event) =>
                setForm({ ...form, human_owner_user_id: event.target.value })
              }
            >
              {references.users.map((item) => (
                <option
                  key={stringValue(value(item, "id"))}
                  value={stringValue(value(item, "id"))}
                >
                  {stringValue(value(item, "display_name"))}
                </option>
              ))}
            </select>
          </label>
          <label>
            Escalation owner
            <select
              value={stringValue(form.escalation_owner_user_id)}
              onChange={(event) =>
                setForm({
                  ...form,
                  escalation_owner_user_id: event.target.value,
                })
              }
            >
              {references.users.map((item) => (
                <option
                  key={stringValue(value(item, "id"))}
                  value={stringValue(value(item, "id"))}
                >
                  {stringValue(value(item, "display_name"))}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Languages (comma separated)"
            name="supported_languages"
            form={form}
            setForm={setForm}
            placeholder="en-ZA, zu-ZA"
          />
        </div>
      )}
      {step === "functions" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="function"
          updateItem={updateItem}
        />
      )}
      {step === "skills" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="skill"
          updateItem={updateItem}
        />
      )}
      {step === "knowledge" && (
        <ChoiceGrid
          items={references.knowledge}
          selected={listValue(form.selected)}
          onChange={(selected) => setForm({ ...form, selected })}
          empty="Create and activate a Knowledge base before assigning role knowledge."
          labelKey="name"
          detailKey="description"
          statusKey="state"
        />
      )}
      {step === "tools" && (
        <>
          <div className="workforce-alert info">
            <Wrench size={19} />
            <div>
              <strong>Permissions, not credentials</strong>
              <p>
                This step assigns tool policy only. Secrets remain in
                server-side integration installations. New tool permissions stay
                pending until a reviewer approves them.
              </p>
            </div>
          </div>
          <ChoiceGrid
            items={references.tools}
            selected={listValue(form.selected)}
            onChange={(selected) => setForm({ ...form, selected })}
            empty="No tools are registered. This is valid for roles that only prepare work inside the VowHumans queue."
            labelKey="name"
            detailKey="description"
            statusKey="status"
          />
        </>
      )}
      {step === "workflows" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="workflow"
          updateItem={updateItem}
        />
      )}
      {step === "objectives" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="objective"
          updateItem={updateItem}
        />
      )}
      {step === "guardrails" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="guardrail"
          updateItem={updateItem}
        />
      )}
      {step === "collaboration" && (
        <EditableRows
          items={items}
          setItems={setItems}
          kind="collaboration"
          updateItem={updateItem}
          references={references}
        />
      )}
      {step === "testing" && (
        <div className="workforce-testing">
          <div className="readiness-score">
            <Gauge size={25} />
            <strong>{colleague.readiness.score}%</strong>
            <span>configuration readiness</span>
          </div>
          <div className="readiness-checks">
            {colleague.readiness.checks.map((check) => (
              <div
                key={check.code}
                className={check.passed ? "passed" : "failed"}
              >
                {check.passed ? <Check size={16} /> : <CircleAlert size={16} />}
                <div>
                  <strong>{check.label}</strong>
                  <small>
                    {check.passed ? "Requirement met" : check.detail}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={runTests}
            disabled={busy}
          >
            <Play size={17} />
            {busy ? "Running deterministic checks…" : "Run readiness tests"}
          </button>
        </div>
      )}
      {step === "approval" && (
        <div className="approval-step">
          <div
            className={`approval-readiness ${colleague.readiness.readyForReview ? "ready" : "blocked"}`}
          >
            {colleague.readiness.readyForReview ? (
              <BadgeCheck size={28} />
            ) : (
              <CircleAlert size={28} />
            )}
            <div>
              <strong>
                {colleague.readiness.readyForReview
                  ? "Ready for accountable review"
                  : `${colleague.readiness.blockers.length} blockers remain`}
              </strong>
              <p>
                {colleague.readiness.readyForReview
                  ? "Approval will preserve an immutable snapshot of this configuration and its passing tests."
                  : "Return to the named steps and resolve every blocker before recording approval."}
              </p>
            </div>
          </div>
          {!colleague.readiness.readyForReview && (
            <div className="blocker-list">
              {colleague.readiness.blockers.map((blocker) => (
                <Link
                  key={blocker.code}
                  href={`/studio/workforce/${stringValue(value(colleague, "id"))}/${blocker.step}`}
                >
                  <CircleAlert size={15} />
                  <span>
                    <strong>{blocker.label}</strong>
                    <small>{blocker.detail}</small>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          )}
          <label>
            Reviewer rationale
            <textarea
              rows={5}
              value={stringValue(form.rationale)}
              onChange={(event) =>
                setForm({ ...form, rationale: event.target.value })
              }
              placeholder="Explain why this role, risk, autonomy, tests and escalation model are acceptable."
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={approve}
            disabled={
              busy ||
              !colleague.readiness.readyForReview ||
              stringValue(form.rationale).trim().length < 10
            }
          >
            <BadgeCheck size={18} />
            Record immutable approval
          </button>
          {colleague.approvals.length > 0 && (
            <div className="history-list">
              <h3>Approval history</h3>
              {colleague.approvals.map((item) => (
                <div key={stringValue(value(item, "id"))}>
                  <StatusBadge status={value(item, "decision")} />
                  <span>
                    <strong>
                      {stringValue(value(item, "approved_by_name"))}
                    </strong>
                    <small>
                      {stringValue(value(item, "rationale"))} ·{" "}
                      {dateLabel(value(item, "created_at"))}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {step === "deployment" && (
        <div className="deployment-step">
          <div className="workforce-alert info">
            <Rocket size={19} />
            <div>
              <strong>Deployment means an enabled operating policy</strong>
              <p>
                The work queue can run without external providers. Model, tool
                and scheduled execution remain independently gated and cannot be
                implied by this deployment.
              </p>
            </div>
          </div>
          <div className="form-grid two">
            <label>
              Environment
              <select
                value={stringValue(form.environment) || "sandbox"}
                onChange={(event) =>
                  setForm({ ...form, environment: event.target.value })
                }
              >
                <option value="sandbox">Sandbox</option>
                <option value="pilot">Pilot</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label>
              Enabled channel
              <input value="Governed work queue" readOnly />
            </label>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={deploy}
            disabled={busy || !colleague.readiness.readyForDeployment}
          >
            <Rocket size={18} />
            Deploy governed role
          </button>
          {!colleague.readiness.readyForDeployment && (
            <p className="panel-note">
              A passing readiness result and immutable approval are required
              before deployment.
            </p>
          )}
          {colleague.deployments.length > 0 && (
            <div className="history-list">
              <h3>Deployment history</h3>
              {colleague.deployments.map((item) => (
                <div key={stringValue(value(item, "id"))}>
                  <StatusBadge status={value(item, "status")} />
                  <span>
                    <strong>
                      {humanStatus(value(item, "environment"))} · version{" "}
                      {stringValue(value(item, "version"))}
                    </strong>
                    <small>
                      {listValue(value(item, "channels")).join(", ")} ·{" "}
                      {dateLabel(value(item, "created_at"))}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function EditableRows({
  items,
  setItems,
  kind,
  updateItem,
  references,
}: {
  items: RecordItem[];
  setItems: (next: RecordItem[]) => void;
  kind:
    | "function"
    | "skill"
    | "workflow"
    | "objective"
    | "guardrail"
    | "collaboration";
  updateItem: (index: number, key: string, next: unknown) => void;
  references?: References;
}) {
  const defaults: Record<typeof kind, RecordItem> = {
    function: {
      name: "",
      description: "",
      in_scope_text: "",
      out_of_scope_text: "",
      human_review_required: true,
    },
    skill: { name: "", proficiency: "guided", evidence: "" },
    workflow: {
      name: "",
      trigger_type: "manual",
      expected_output: "",
      exception_policy: "",
      human_checkpoint_policy: "",
      step_text: "",
    },
    objective: {
      label: "",
      description: "",
      kpis: [
        {
          name: "",
          unit: "count",
          direction: "increase",
          measurement_policy: "",
        },
      ],
    },
    guardrail: {
      code: "",
      instruction: "",
      enforcement: "hard",
      action_on_violation: "escalate",
    },
    collaboration: {
      route_type: "human_escalation",
      target_user_id: "",
      condition: "",
      service_level_minutes: 60,
      channel: "work_queue",
    },
  };
  function prepareForSave(item: RecordItem): RecordItem {
    if (kind !== "function") return item;
    return {
      ...item,
      in_scope: stringValue(
        value(item, "in_scope_text") ||
          listValue(value(item, "in_scope")).join("\n"),
      )
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean),
      out_of_scope: stringValue(
        value(item, "out_of_scope_text") ||
          listValue(value(item, "out_of_scope")).join("\n"),
      )
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
  }
  return (
    <div className="editable-list">
      {items.length === 0 && (
        <EmptyState
          title={`No ${kind}s configured`}
          copy={`Add the first ${kind} to make this role operationally explicit.`}
        />
      )}
      {items.map((item, index) => (
        <article
          key={stringValue(value(item, "id")) || `${kind}-${index}`}
          className="editable-row"
        >
          <div className="editable-row-head">
            <strong>
              {stringValue(
                value(
                  item,
                  kind === "objective"
                    ? "label"
                    : kind === "collaboration"
                      ? "route_type"
                      : kind === "guardrail"
                        ? "code"
                        : "name",
                ),
              ) || `New ${kind}`}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${kind}`}
              onClick={() =>
                setItems(items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="form-grid two">
            {kind === "function" && (
              <>
                <label>
                  Name
                  <input
                    value={stringValue(value(item, "name"))}
                    onChange={(event) =>
                      updateItem(index, "name", event.target.value)
                    }
                  />
                </label>
                <label>
                  Human review
                  <select
                    value={
                      boolValue(value(item, "human_review_required"))
                        ? "yes"
                        : "no"
                    }
                    onChange={(event) =>
                      updateItem(
                        index,
                        "human_review_required",
                        event.target.value === "yes",
                      )
                    }
                  >
                    <option value="yes">Required</option>
                    <option value="no">Not always required</option>
                  </select>
                </label>
                <label className="span-two">
                  Description
                  <textarea
                    rows={2}
                    value={stringValue(value(item, "description"))}
                    onChange={(event) =>
                      updateItem(index, "description", event.target.value)
                    }
                  />
                </label>
                <label>
                  In scope (one per line)
                  <textarea
                    rows={4}
                    value={stringValue(value(item, "in_scope_text"))}
                    onChange={(event) =>
                      updateItem(index, "in_scope_text", event.target.value)
                    }
                  />
                </label>
                <label>
                  Out of scope (one per line)
                  <textarea
                    rows={4}
                    value={stringValue(value(item, "out_of_scope_text"))}
                    onChange={(event) =>
                      updateItem(index, "out_of_scope_text", event.target.value)
                    }
                  />
                </label>
              </>
            )}
            {kind === "skill" && (
              <>
                <label>
                  Skill
                  <input
                    value={stringValue(value(item, "name"))}
                    onChange={(event) =>
                      updateItem(index, "name", event.target.value)
                    }
                  />
                </label>
                <label>
                  Proficiency
                  <select
                    value={stringValue(value(item, "proficiency")) || "guided"}
                    onChange={(event) =>
                      updateItem(index, "proficiency", event.target.value)
                    }
                  >
                    <option value="observing">Observing</option>
                    <option value="guided">Guided</option>
                    <option value="proficient">Proficient</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <label className="span-two">
                  Evidence / validation requirement
                  <textarea
                    rows={3}
                    value={stringValue(value(item, "evidence"))}
                    onChange={(event) =>
                      updateItem(index, "evidence", event.target.value)
                    }
                  />
                </label>
              </>
            )}
            {kind === "workflow" && (
              <>
                <label>
                  Name
                  <input
                    value={stringValue(value(item, "name"))}
                    onChange={(event) =>
                      updateItem(index, "name", event.target.value)
                    }
                  />
                </label>
                <label>
                  Trigger
                  <select
                    value={stringValue(value(item, "trigger_type")) || "manual"}
                    onChange={(event) =>
                      updateItem(index, "trigger_type", event.target.value)
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="event">Event</option>
                    <option value="schedule">Schedule</option>
                    <option value="api">API</option>
                    <option value="handoff">Hand-off</option>
                  </select>
                </label>
                <label className="span-two">
                  Steps (one per line)
                  <textarea
                    rows={6}
                    value={stringValue(value(item, "step_text"))}
                    onChange={(event) =>
                      updateItem(index, "step_text", event.target.value)
                    }
                  />
                </label>
                <label>
                  Expected output
                  <textarea
                    rows={3}
                    value={stringValue(value(item, "expected_output"))}
                    onChange={(event) =>
                      updateItem(index, "expected_output", event.target.value)
                    }
                  />
                </label>
                <label>
                  Exception policy
                  <textarea
                    rows={3}
                    value={stringValue(value(item, "exception_policy"))}
                    onChange={(event) =>
                      updateItem(index, "exception_policy", event.target.value)
                    }
                  />
                </label>
              </>
            )}
            {kind === "objective" && (
              <>
                <label>
                  Objective
                  <input
                    value={stringValue(value(item, "label"))}
                    onChange={(event) =>
                      updateItem(index, "label", event.target.value)
                    }
                  />
                </label>
                <label>
                  Description
                  <input
                    value={stringValue(value(item, "description"))}
                    onChange={(event) =>
                      updateItem(index, "description", event.target.value)
                    }
                  />
                </label>
                <label>
                  KPI name
                  <input
                    value={stringValue(
                      value(recordList(value(item, "kpis"))[0], "name"),
                    )}
                    onChange={(event) =>
                      updateItem(index, "kpis", [
                        {
                          ...recordList(value(item, "kpis"))[0],
                          name: event.target.value,
                        },
                      ])
                    }
                  />
                </label>
                <label>
                  Measurement policy
                  <input
                    value={stringValue(
                      value(
                        recordList(value(item, "kpis"))[0],
                        "measurement_policy",
                      ),
                    )}
                    onChange={(event) =>
                      updateItem(index, "kpis", [
                        {
                          ...recordList(value(item, "kpis"))[0],
                          measurement_policy: event.target.value,
                          unit: "percent",
                          direction: "increase",
                        },
                      ])
                    }
                  />
                </label>
              </>
            )}
            {kind === "guardrail" && (
              <>
                <label>
                  Code
                  <input
                    value={stringValue(value(item, "code"))}
                    onChange={(event) =>
                      updateItem(index, "code", event.target.value)
                    }
                    placeholder="e.g. disclose_ai"
                  />
                </label>
                <label>
                  Enforcement
                  <select
                    value={stringValue(value(item, "enforcement")) || "hard"}
                    onChange={(event) =>
                      updateItem(index, "enforcement", event.target.value)
                    }
                  >
                    <option value="hard">Hard block</option>
                    <option value="human_review">Human review</option>
                    <option value="policy">Policy</option>
                    <option value="prompt">Prompt</option>
                  </select>
                </label>
                <label className="span-two">
                  Instruction
                  <textarea
                    rows={3}
                    value={stringValue(value(item, "instruction"))}
                    onChange={(event) =>
                      updateItem(index, "instruction", event.target.value)
                    }
                  />
                </label>
              </>
            )}
            {kind === "collaboration" && (
              <>
                <label>
                  Route
                  <select
                    value={
                      stringValue(value(item, "route_type")) ||
                      "human_escalation"
                    }
                    onChange={(event) =>
                      updateItem(index, "route_type", event.target.value)
                    }
                  >
                    <option value="human_owner">Human owner</option>
                    <option value="human_escalation">Human escalation</option>
                    <option value="digital_colleague_handoff">
                      Controlled colleague hand-off
                    </option>
                  </select>
                </label>
                <label>
                  Human target
                  <select
                    value={stringValue(value(item, "target_user_id"))}
                    onChange={(event) =>
                      updateItem(index, "target_user_id", event.target.value)
                    }
                  >
                    <option value="">Choose accountable person…</option>
                    {references?.users.map((user) => (
                      <option
                        key={stringValue(value(user, "id"))}
                        value={stringValue(value(user, "id"))}
                      >
                        {stringValue(value(user, "display_name"))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-two">
                  When to use this route
                  <textarea
                    rows={3}
                    value={stringValue(value(item, "condition"))}
                    onChange={(event) =>
                      updateItem(index, "condition", event.target.value)
                    }
                  />
                </label>
              </>
            )}
          </div>
        </article>
      ))}
      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          setItems([...items.map(prepareForSave), { ...defaults[kind] }])
        }
      >
        <Plus size={16} />
        Add {kind}
      </button>
    </div>
  );
}

function ChoiceGrid({
  items,
  selected,
  onChange,
  empty,
  labelKey,
  detailKey,
  statusKey,
}: {
  items: RecordItem[];
  selected: string[];
  onChange: (next: string[]) => void;
  empty: string;
  labelKey: string;
  detailKey: string;
  statusKey: string;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Layers3}
        title="Nothing available to assign"
        copy={empty}
      />
    );
  return (
    <div className="choice-grid">
      {items.map((item) => {
        const id = stringValue(value(item, "id"));
        const checked = selected.includes(id);
        return (
          <label key={id} className={checked ? "selected" : ""}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((entry) => entry !== id)
                    : [...selected, id],
                )
              }
            />
            <span>
              <Check size={16} />
            </span>
            <div>
              <strong>{stringValue(value(item, labelKey))}</strong>
              <p>
                {stringValue(value(item, detailKey)) ||
                  "No description supplied."}
              </p>
              <StatusBadge status={value(item, statusKey)} />
            </div>
          </label>
        );
      })}
    </div>
  );
}

function ColleagueBuilder({
  colleagueId,
  requestedStep,
}: {
  colleagueId: string;
  requestedStep?: string;
}) {
  const router = useRouter();
  const currentStep = WORKFORCE_BUILDER_STEPS.includes(
    requestedStep as WorkforceBuilderStep,
  )
    ? (requestedStep as WorkforceBuilderStep)
    : "role";
  const [colleague, setColleague] = useState<ColleagueDetail | null>(null);
  const [references, setReferences] = useState<References | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      workforceApi<ColleagueDetail>(`/colleagues/${colleagueId}`),
      workforceApi<References>("/reference"),
    ])
      .then(([nextColleague, nextReferences]) => {
        if (!active) return;
        setColleague(nextColleague);
        setReferences(nextReferences);
      })
      .catch((reason: Error) => {
        if (active)
          setError(reason.message || "Could not load this Digital Colleague.");
      });
    return () => {
      active = false;
    };
  }, [colleagueId]);
  if (error && !colleague) return <ErrorBanner message={error} />;
  if (!colleague || !references) return <LoadingState />;
  const currentIndex = WORKFORCE_BUILDER_STEPS.indexOf(currentStep);
  return (
    <div className="workforce-builder">
      <aside className="workforce-builder-rail">
        <div className="builder-identity">
          <span>
            <Bot size={22} />
          </span>
          <div>
            <small>{stringValue(value(colleague, "public_id"))}</small>
            <strong>{stringValue(value(colleague, "name"))}</strong>
            <p>
              {stringValue(value(colleague, "role_title")) ||
                "Role in configuration"}
            </p>
          </div>
        </div>
        <div className="builder-progress">
          <div>
            <span>Readiness</span>
            <strong>{colleague.readiness.score}%</strong>
          </div>
          <i>
            <b style={{ width: `${colleague.readiness.score}%` }} />
          </i>
        </div>
        <nav aria-label="12-step workforce configuration">
          {WORKFORCE_BUILDER_STEPS.map((step, index) => {
            const passed = colleague.readiness.checks.some(
              (check) => check.step === step && check.passed,
            );
            const active = step === currentStep;
            return (
              <Link
                key={step}
                href={`/studio/workforce/${colleagueId}/${step}`}
                className={active ? "active" : passed ? "passed" : ""}
                aria-current={active ? "step" : undefined}
              >
                <span>{passed ? <Check size={14} /> : index + 1}</span>
                <div>
                  <strong>{stepLabels[step]}</strong>
                  <small>
                    {index < 9
                      ? "Configure"
                      : index === 9
                        ? "Validate"
                        : index === 10
                          ? "Govern"
                          : "Activate"}
                  </small>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="workforce-builder-main">
        <div className="builder-summary">
          <div>
            <span className="eyebrow">
              {stringValue(value(colleague, "department")) ||
                "Digital workforce"}
            </span>
            <h2>{stringValue(value(colleague, "name"))}</h2>
            <p>
              {stringValue(value(colleague, "purpose")) ||
                "Complete the role purpose in step one."}
            </p>
          </div>
          <div>
            <StatusBadge status={value(colleague, "status")} />
            <StatusBadge
              status={`${stringValue(value(colleague, "risk_level"))} risk`}
              tone={
                value(colleague, "risk_level") === "high" ||
                value(colleague, "risk_level") === "regulated"
                  ? "warn"
                  : "info"
              }
            />
          </div>
        </div>
        <ConfigurationStep
          key={currentStep}
          step={currentStep}
          colleague={colleague}
          references={references}
          onUpdated={setColleague}
        />
        <div className="builder-pagination">
          <button
            type="button"
            className="secondary-button"
            disabled={currentIndex === 0}
            onClick={() =>
              router.push(
                `/studio/workforce/${colleagueId}/${WORKFORCE_BUILDER_STEPS[currentIndex - 1]}`,
              )
            }
          >
            Previous
          </button>
          <span>Step {currentIndex + 1} of 12</span>
          <button
            type="button"
            className="primary-button"
            disabled={currentIndex === 11}
            onClick={() =>
              router.push(
                `/studio/workforce/${colleagueId}/${WORKFORCE_BUILDER_STEPS[currentIndex + 1]}`,
              )
            }
          >
            Next step <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksWorkspace() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [selectedTask, setSelectedTask] = useState<RecordItem | null>(null);
  const [selectedColleague, setSelectedColleague] =
    useState<ColleagueDetail | null>(null);
  const [form, setForm] = useState<RecordItem>({
    digital_colleague_id: "",
    title: "",
    request: "",
    priority: "normal",
    risk_level: "medium",
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      workforceApi<DashboardPayload>()
        .then(setData)
        .catch((reason: Error) => setError(reason.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function chooseColleague(id: string) {
    setForm({ ...form, digital_colleague_id: id });
    setSelectedColleague(
      id ? await workforceApi<ColleagueDetail>(`/colleagues/${id}`) : null,
    );
  }
  async function createTask() {
    setBusy("create");
    setError("");
    try {
      const task = await workforceApi<RecordItem>("/tasks", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSelectedTask(task);
      setForm({
        digital_colleague_id: form.digital_colleague_id,
        title: "",
        request: "",
        priority: "normal",
        risk_level: value(selectedColleague, "risk_level") || "medium",
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create the task.",
      );
    }
    setBusy("");
  }
  async function openTask(id: string) {
    setBusy(id);
    try {
      setSelectedTask(await workforceApi<RecordItem>(`/tasks/${id}`));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load the task.",
      );
    }
    setBusy("");
  }
  async function taskAction(action: "review-brief" | "execute") {
    if (!selectedTask) return;
    setBusy(action);
    try {
      const result = await workforceApi<{ task: RecordItem }>(
        `/tasks/${stringValue(value(selectedTask, "id"))}/${action}`,
        { method: "POST", body: "{}" },
      );
      setSelectedTask(result.task);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not prepare the work product.",
      );
    }
    setBusy("");
  }
  async function review(productId: string, decision: string) {
    setBusy(productId);
    try {
      setSelectedTask(
        await workforceApi<RecordItem>(`/products/${productId}/reviews`, {
          method: "POST",
          body: JSON.stringify({
            decision,
            notes:
              decision === "approved"
                ? "Reviewed and approved by the accountable Studio user."
                : "Returned for accountable revision.",
          }),
        }),
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not review the work product.",
      );
    }
    setBusy("");
  }
  if (!data && !error) return <LoadingState />;
  if (!data) return <ErrorBanner message={error} />;
  const deployed = data.colleagues.filter(
    (item) => value(item, "status") === "deployed",
  );
  const products = recordList(value(selectedTask, "products"));
  return (
    <div className="content-stack workforce-tasks">
      {error && <ErrorBanner message={error} />}
      <section
        className="workforce-panel task-composer"
        id="studio-primary-action"
      >
        <div className="workforce-panel-heading">
          <div>
            <p className="eyebrow">Assign accountable work</p>
            <h2>New work item</h2>
            <p>
              Every item is tenant-scoped, event-traced and routed through a
              human review policy.
            </p>
          </div>
        </div>
        {deployed.length === 0 ? (
          <EmptyState
            title="Deploy a colleague first"
            copy="Only approved and deployed Digital Colleagues can receive live work."
            action={
              <Link href="/studio/workforce" className="secondary-button">
                Open Digital Workforce
              </Link>
            }
          />
        ) : (
          <div className="form-grid two">
            <label>
              Digital Colleague
              <select
                value={stringValue(form.digital_colleague_id)}
                onChange={(event) => void chooseColleague(event.target.value)}
              >
                <option value="">Choose deployed colleague…</option>
                {deployed.map((item) => (
                  <option
                    key={stringValue(value(item, "id"))}
                    value={stringValue(value(item, "id"))}
                  >
                    {stringValue(value(item, "name"))} —{" "}
                    {stringValue(value(item, "role_title"))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={stringValue(form.priority)}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Task title
              <input
                value={stringValue(form.title)}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label>
              Risk level
              <select
                value={stringValue(form.risk_level)}
                onChange={(event) =>
                  setForm({ ...form, risk_level: event.target.value })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="regulated">Regulated</option>
              </select>
            </label>
            <label className="span-two">
              Clear request
              <textarea
                rows={5}
                value={stringValue(form.request)}
                onChange={(event) =>
                  setForm({ ...form, request: event.target.value })
                }
                placeholder="Describe the outcome, constraints and information the colleague may use."
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={createTask}
              disabled={
                busy === "create" ||
                !form.digital_colleague_id ||
                stringValue(form.request).length < 10
              }
            >
              <Plus size={17} />
              Create work item
            </button>
          </div>
        )}
      </section>
      <div className="workforce-task-layout">
        <section className="workforce-panel">
          <div className="workforce-panel-heading">
            <div>
              <p className="eyebrow">Work queue</p>
              <h2>Recorded items</h2>
            </div>
          </div>
          {data.tasks.length === 0 ? (
            <EmptyState
              title="No work assigned"
              copy="New work items will appear here with their real status."
            />
          ) : (
            <div className="task-list">
              {data.tasks.map((item) => (
                <button
                  type="button"
                  key={stringValue(value(item, "id"))}
                  className={
                    value(selectedTask, "id") === value(item, "id")
                      ? "active"
                      : ""
                  }
                  onClick={() => void openTask(stringValue(value(item, "id")))}
                >
                  <span>
                    <strong>{stringValue(value(item, "title"))}</strong>
                    <small>
                      {stringValue(value(item, "colleague_name"))} ·{" "}
                      {dateLabel(value(item, "created_at"))}
                    </small>
                  </span>
                  <StatusBadge status={value(item, "status")} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="workforce-panel task-detail">
          {!selectedTask ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Choose a work item"
              copy="Inspect its request, event trail, work products and human-review decisions."
            />
          ) : (
            <>
              <div className="workforce-panel-heading">
                <div>
                  <p className="eyebrow">
                    {stringValue(value(selectedTask, "public_id"))}
                  </p>
                  <h2>{stringValue(value(selectedTask, "title"))}</h2>
                  <p>{stringValue(value(selectedTask, "request"))}</p>
                </div>
                <StatusBadge status={value(selectedTask, "status")} />
              </div>
              <div className="task-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void taskAction("review-brief")}
                  disabled={Boolean(busy)}
                >
                  <Sparkles size={17} />
                  Prepare deterministic brief
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void taskAction("execute")}
                  disabled={Boolean(busy) || !data.capabilities.model_execution}
                >
                  <Play size={17} />
                  Generate model draft
                </button>
              </div>
              {!data.capabilities.model_execution && (
                <p className="panel-note">
                  Model execution is disabled. The deterministic review brief
                  remains fully operational and is explicitly labelled.
                </p>
              )}
              <div className="work-product-list">
                {products.map((product) => (
                  <article key={stringValue(value(product, "id"))}>
                    <div>
                      <small>
                        {humanStatus(value(product, "product_type"))} · v
                        {stringValue(value(product, "version"))}
                      </small>
                      <h3>{stringValue(value(product, "title"))}</h3>
                    </div>
                    <StatusBadge status={value(product, "status")} />
                    <pre>
                      {JSON.stringify(value(product, "content"), null, 2)}
                    </pre>
                    {value(product, "status") === "awaiting_review" && (
                      <div>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            void review(
                              stringValue(value(product, "id")),
                              "approved",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          <Check size={16} />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            void review(
                              stringValue(value(product, "id")),
                              "changes_requested",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          Request changes
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ApprovalsWorkspace() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      workforceApi<DashboardPayload>()
        .then(setData)
        .catch((reason: Error) => setError(reason.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function review(
    product: RecordItem,
    decision: "approved" | "changes_requested",
  ) {
    try {
      await workforceApi(
        `/products/${stringValue(value(product, "id"))}/reviews`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            notes:
              decision === "approved"
                ? "Approved from the governed review queue."
                : "Changes requested from the governed review queue.",
          }),
        },
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not record the review.",
      );
    }
  }
  if (!data && !error) return <LoadingState />;
  if (!data) return <ErrorBanner message={error} />;
  const colleagues = data.colleagues.filter((item) =>
    ["review", "testing"].includes(stringValue(value(item, "status"))),
  );
  const products = data.work_products.filter(
    (item) => value(item, "status") === "awaiting_review",
  );
  return (
    <div className="content-stack approvals-workspace">
      {error && <ErrorBanner message={error} />}
      <section className="workforce-approval-banner">
        <ShieldCheck size={28} />
        <div>
          <p className="eyebrow">Human authority is final</p>
          <h2>Review configurations and work products before release.</h2>
          <p>
            Approvals are append-only. A rejection or later revocation creates
            new history; it never rewrites the original decision.
          </p>
        </div>
      </section>
      <div className="workforce-dashboard-grid">
        <section className="workforce-panel">
          <div className="workforce-panel-heading">
            <div>
              <p className="eyebrow">Configuration approvals</p>
              <h2>Digital Colleagues</h2>
            </div>
          </div>
          {colleagues.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No configurations awaiting review"
              copy="Colleagues appear here after deterministic readiness testing."
            />
          ) : (
            <div className="workforce-list">
              {colleagues.map((item) => (
                <Link
                  className="workforce-list-row"
                  key={stringValue(value(item, "id"))}
                  href={`/studio/workforce/${stringValue(value(item, "id"))}/approval`}
                >
                  <span className="colleague-avatar">
                    <Bot size={19} />
                  </span>
                  <div>
                    <strong>{stringValue(value(item, "name"))}</strong>
                    <small>
                      {stringValue(value(item, "role_title"))} ·{" "}
                      {numberValue(value(item, "function_count"))} functions
                    </small>
                  </div>
                  <StatusBadge status={value(item, "status")} />
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="workforce-panel">
          <div className="workforce-panel-heading">
            <div>
              <p className="eyebrow">Output approvals</p>
              <h2>Work products</h2>
            </div>
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No work products awaiting review"
              copy="Drafts appear here only when a recorded work item produces an output."
            />
          ) : (
            <div className="approval-product-list">
              {products.map((item) => (
                <article key={stringValue(value(item, "id"))}>
                  <div>
                    <small>
                      {stringValue(value(item, "colleague_name"))} ·{" "}
                      {humanStatus(value(item, "product_type"))}
                    </small>
                    <strong>{stringValue(value(item, "title"))}</strong>
                    <p>{stringValue(value(item, "task_title"))}</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void review(item, "approved")}
                    >
                      <Check size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void review(item, "changes_requested")}
                    >
                      Changes
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AnalyticsWorkspace() {
  const [data, setData] = useState<RecordItem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    workforceApi<RecordItem>("/analytics")
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  if (!data && !error) return <LoadingState />;
  if (!data) return <ErrorBanner message={error} />;
  const sections = [
    { key: "colleague_status", title: "Colleague lifecycle", icon: UsersRound },
    { key: "work_status", title: "Work items", icon: Workflow },
    {
      key: "review_decisions",
      title: "Human review decisions",
      icon: ClipboardCheck,
    },
  ];
  return (
    <div className="content-stack workforce-analytics">
      <div className="workforce-alert info">
        <Gauge size={20} />
        <div>
          <strong>Recorded evidence only</strong>
          <p>{stringValue(value(data, "disclosure"))}</p>
        </div>
      </div>
      <section className="analytics-status-grid">
        {sections.map((section) => {
          const rows = recordList(value(data, section.key));
          const total = rows.reduce(
            (sum, row) => sum + numberValue(value(row, "count")),
            0,
          );
          return (
            <article className="workforce-panel" key={section.key}>
              <span>
                <section.icon size={22} />
              </span>
              <small>{section.title}</small>
              <strong>{total}</strong>
              <div>
                {rows.length === 0 ? (
                  <p>No recorded events</p>
                ) : (
                  rows.map((row) => (
                    <div
                      key={stringValue(
                        value(row, "status") || value(row, "decision"),
                      )}
                    >
                      <span>
                        {humanStatus(
                          value(row, "status") || value(row, "decision"),
                        )}
                      </span>
                      <b>{numberValue(value(row, "count"))}</b>
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="workforce-panel">
        <div className="workforce-panel-heading">
          <div>
            <p className="eyebrow">Provider costs</p>
            <h2>Recorded Digital Colleague costs</h2>
          </div>
        </div>
        {recordList(value(data, "costs")).length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No provider costs recorded"
            copy="The dashboard will not substitute demo spend or fabricated savings."
          />
        ) : (
          <div className="cost-table">
            {recordList(value(data, "costs")).map((row) => (
              <div
                key={`${stringValue(value(row, "day"))}-${stringValue(value(row, "currency"))}`}
              >
                <span>{dateLabel(value(row, "day"))}</span>
                <strong>
                  {stringValue(value(row, "currency"))}{" "}
                  {(numberValue(value(row, "amount_minor")) / 100).toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function WorkforceStudio({
  mode = "dashboard",
  path = [],
}: {
  mode?:
    "dashboard" | "builder" | "tasks" | "approvals" | "analytics" | "create";
  path?: string[];
}) {
  if (mode === "create") return <CreateColleague />;
  if (mode === "builder" && path[0])
    return <ColleagueBuilder colleagueId={path[0]} requestedStep={path[1]} />;
  if (mode === "tasks") return <TasksWorkspace />;
  if (mode === "approvals") return <ApprovalsWorkspace />;
  if (mode === "analytics") return <AnalyticsWorkspace />;
  return <WorkforceDashboard />;
}
