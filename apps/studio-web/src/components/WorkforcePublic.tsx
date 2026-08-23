import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  ClipboardCheck,
  Gauge,
  Handshake,
  Layers3,
  LockKeyhole,
  Network,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import {
  AUTONOMY_LEVELS,
  WORKFORCE_BUILDER_STEPS,
  workforceTemplates,
} from "@vowhumans/commercial-core/workforce";
import { MarketingShell } from "./MarketingShell";

export const publicWorkforcePaths = [
  "roles",
  "how-it-works",
  "deployment",
  "human-collaboration",
  "governance",
] as const;
export type PublicWorkforcePath = (typeof publicWorkforcePaths)[number];

const publicSteps = [
  "Choose a proven template",
  "Select or create a disclosed Digital Human",
  "Configure the Persona and objectives",
  "Connect trusted knowledge",
  "Test behaviour and escalation",
  "Choose channels and applications",
  "Publish with the right approvals",
  "Measure usage and improve",
];

const builderStepCopy = [
  "Connect identity, Persona and accountable role ownership.",
  "Bound what work is in and out of scope.",
  "Assign skills and define validation evidence.",
  "Select active, approved sources only.",
  "Grant least-privilege actions—not credentials.",
  "Define triggers, traceable steps, outputs and exceptions.",
  "Set measurable outcomes without invented baselines.",
  "Enforce disclosure, privacy and human authority.",
  "Name owners, escalation and controlled hand-offs.",
  "Run deterministic readiness and safety checks.",
  "Record an immutable human decision snapshot.",
  "Enable only approved environments and channels.",
];

function WorkforceHero({
  eyebrow,
  title,
  summary,
  secondary = "/workforce/roles",
}: {
  eyebrow: string;
  title: React.ReactNode;
  summary: string;
  secondary?: string;
}) {
  return (
    <section className="workforce-public-hero">
      <div className="workforce-public-copy">
        <p className="commercial-kicker">
          <span />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p>{summary}</p>
        <div className="page-cta-row">
          <Link href="/sign-up" className="public-button">
            Build a Digital Colleague <ArrowRight size={16} />
          </Link>
          <Link href={secondary} className="public-button ghost">
            Explore the operating model
          </Link>
        </div>
        <div className="workforce-hero-trust">
          <span>
            <ShieldCheck size={15} />
            Human accountable
          </span>
          <span>
            <BadgeCheck size={15} />
            AI disclosed
          </span>
          <span>
            <LockKeyhole size={15} />
            Least privilege
          </span>
        </div>
      </div>
      <OperatingModelVisual />
    </section>
  );
}

function OperatingModelVisual() {
  return (
    <div
      className="workforce-model-visual"
      aria-label="Digital Human plus Persona creates the foundations for a Digital Colleague"
    >
      <div className="model-grid-lines" aria-hidden="true" />
      <article className="model-node identity">
        <span>
          <UserRound size={24} />
        </span>
        <small>Identity</small>
        <strong>Digital Human</strong>
        <p>Face · voice · presence</p>
      </article>
      <article className="model-node persona">
        <span>
          <BrainCircuit size={24} />
        </span>
        <small>Behaviour</small>
        <strong>Persona</strong>
        <p>Style · instructions · boundaries</p>
      </article>
      <i className="model-connector a" />
      <i className="model-connector b" />
      <article className="model-node colleague">
        <span>
          <BriefcaseBusiness size={28} />
        </span>
        <small>Accountable worker</small>
        <strong>Digital Colleague</strong>
        <p>Role · skills · tools · workflow · objectives</p>
      </article>
      <div className="model-human">
        <Handshake size={18} />
        <span>
          <small>Human authority</small>
          <strong>Owns · reviews · escalates</strong>
        </span>
      </div>
    </div>
  );
}

function PublicDefinition() {
  return (
    <section className="workforce-public-section definition-section">
      <div className="workforce-section-heading">
        <p>THE OPERATING MODEL</p>
        <h2>Three concepts. No blurred responsibility.</h2>
        <span>
          A beautiful identity is not a job description, and a Persona is not a
          workforce deployment.
        </span>
      </div>
      <div className="public-definition-grid">
        <article>
          <span>
            <UserRound size={22} />
          </span>
          <small>Reusable identity</small>
          <h3>Digital Human</h3>
          <p>
            The visible and conversational identity: face, voice, gesture and
            disclosed presence.
          </p>
          <ul>
            <li>
              <Check size={14} />
              Identity provenance
            </li>
            <li>
              <Check size={14} />
              Consent and disclosure
            </li>
            <li>
              <Check size={14} />
              Channel-ready presence
            </li>
          </ul>
        </article>
        <article>
          <span>
            <BrainCircuit size={22} />
          </span>
          <small>Versioned behaviour</small>
          <h3>Persona</h3>
          <p>
            The behavioural configuration: style, language, instructions,
            knowledge boundaries and opening message.
          </p>
          <ul>
            <li>
              <Check size={14} />
              Immutable published versions
            </li>
            <li>
              <Check size={14} />
              Conversation boundaries
            </li>
            <li>
              <Check size={14} />
              Approved knowledge links
            </li>
          </ul>
        </article>
        <article className="emphasis">
          <span>
            <BriefcaseBusiness size={22} />
          </span>
          <small>Business-facing worker</small>
          <h3>Digital Colleague</h3>
          <p>
            Combines a Digital Human and Persona with role, functions, skills,
            tools, workflows, objectives and accountability.
          </p>
          <ul>
            <li>
              <Check size={14} />
              Named human owner
            </li>
            <li>
              <Check size={14} />
              Test and approval gates
            </li>
            <li>
              <Check size={14} />
              Work queue and reviews
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function WorkforceLanding() {
  const outcomes = [
    {
      icon: UsersRound,
      title: "Extend teams responsibly",
      copy: "Give repeatable work a bounded digital owner while people retain authority for judgement, exceptions and relationships.",
    },
    {
      icon: Workflow,
      title: "Turn roles into workflows",
      copy: "Move from a marketing description to explicit functions, sources, tools, steps, outputs and hand-offs.",
    },
    {
      icon: ShieldCheck,
      title: "Govern before deployment",
      copy: "Tests, risk-aware autonomy, immutable approval and human escalation are deployment requirements—not afterthoughts.",
    },
  ];
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="AI DIGITAL WORKFORCE"
        title={
          <>
            Digital colleagues.
            <br />
            <em>Human authority.</em>
          </>
        }
        summary="Build an AI Digital Workforce from disclosed identities, bounded Personas and accountable Digital Colleagues that operate inside approved knowledge, tools and workflows."
      />
      <PublicDefinition />
      <section className="workforce-public-section public-outcomes">
        <div className="workforce-section-heading">
          <p>WORK THAT FITS THE ORGANISATION</p>
          <h2>Start with an operating outcome, then design the colleague.</h2>
        </div>
        <div>
          {outcomes.map((item) => (
            <article key={item.title}>
              <span>
                <item.icon size={22} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="workforce-public-section journey-section">
        <div className="workforce-section-heading">
          <p>FROM IDEA TO GOVERNED EXPERIENCE</p>
          <h2>Keep the customer journey clear.</h2>
          <span>
            The public eight-step journey stays simple. Studio expands it into
            the deeper 12-step workforce configuration when an enterprise
            administrator is ready.
          </span>
        </div>
        <ol>
          {publicSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <Link href="/workforce/how-it-works" className="public-button ghost">
          See all 12 Studio controls <ArrowRight size={15} />
        </Link>
      </section>
      <section className="workforce-public-section role-preview">
        <div className="workforce-section-heading">
          <p>ROLE CATALOGUE</p>
          <h2>A serious starting point for real teams.</h2>
          <span>
            Every template creates a draft recommendation. People still connect
            identity, publish the Persona, validate knowledge, approve tools,
            test the role and authorise deployment.
          </span>
        </div>
        <div className="role-preview-grid">
          {workforceTemplates.slice(0, 8).map((item) => (
            <article key={item.slug}>
              <small>{item.department}</small>
              <h3>{item.name}</h3>
              <p>{item.summary}</p>
              <span>
                {item.riskLevel} risk · autonomy {item.autonomyLevel}
              </span>
            </article>
          ))}
        </div>
        <Link href="/workforce/roles" className="public-button">
          Explore {workforceTemplates.length} role foundations{" "}
          <ArrowRight size={15} />
        </Link>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function RolesPage() {
  const departments = Array.from(
    new Set(workforceTemplates.map((item) => item.department)),
  );
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="DIGITAL COLLEAGUE ROLES"
        title={
          <>
            A role catalogue with
            <br />
            <em>the boundaries included.</em>
          </>
        }
        summary="Choose a proven starting point across customer experience, operations, learning, sales, people, finance, risk, technology and more."
        secondary="/workforce/how-it-works"
      />
      <section className="workforce-public-section roles-catalogue">
        <div className="department-index">
          {departments.map((department) => (
            <span key={department}>{department}</span>
          ))}
        </div>
        <div className="public-role-grid">
          {workforceTemplates.map((item) => (
            <article key={item.slug}>
              <div>
                <span>
                  <BriefcaseBusiness size={20} />
                </span>
                <small>{item.department}</small>
              </div>
              <h2>{item.name}</h2>
              <p>{item.summary}</p>
              <h3>Recommended functions</h3>
              <ul>
                {item.functions.map((fn) => (
                  <li key={fn}>
                    <Check size={13} />
                    {fn}
                  </li>
                ))}
              </ul>
              <div className="role-policy">
                <span>{item.riskLevel} risk</span>
                <span>Autonomy {item.autonomyLevel}</span>
              </div>
              <aside>
                <ShieldCheck size={15} />
                <span>
                  <strong>Human review</strong>
                  {item.humanReview}
                </span>
              </aside>
              <Link href={`/sign-up?template=${item.slug}`}>
                Configure in Studio <ArrowRight size={14} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function HowItWorksPage() {
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="FROM IDEA TO ACCOUNTABLE WORK"
        title={
          <>
            Eight steps outside.
            <br />
            <em>Twelve controls inside.</em>
          </>
        }
        summary="The public journey stays easy to understand. Studio gives enterprise administrators the deeper controls needed for actual deployment."
        secondary="/workforce/governance"
      />
      <section className="workforce-public-section journey-compare">
        <div className="public-journey">
          <p>Customer-facing journey</p>
          <h2>Eight clear steps</h2>
          <ol>
            {publicSteps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </div>
        <div className="studio-journey">
          <p>Studio configuration</p>
          <h2>Twelve persistent controls</h2>
          <ol>
            {WORKFORCE_BUILDER_STEPS.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.replaceAll("-", " ")}</strong>
                  <small>{builderStepCopy[index]}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="workforce-public-section autonomy-section">
        <div className="workforce-section-heading">
          <p>BOUNDED AUTONOMY</p>
          <h2>Autonomy is a policy level, not a personality trait.</h2>
          <span>
            Higher-risk work receives a lower ceiling. Level five remains
            reserved and cannot be enabled by default.
          </span>
        </div>
        <div>
          {AUTONOMY_LEVELS.map((item) => (
            <article
              key={item.level}
              className={item.level === 5 ? "reserved" : ""}
            >
              <span>{item.level}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function DeploymentPage() {
  const stages = [
    {
      icon: Sparkles,
      title: "Draft",
      copy: "Choose a template or define the role manually. Nothing can execute or deploy.",
    },
    {
      icon: ClipboardCheck,
      title: "Test",
      copy: "Validate identity, published Persona, functions, knowledge, tools, guardrails, escalation and risk.",
    },
    {
      icon: BadgeCheck,
      title: "Approve",
      copy: "An authorised person records an immutable snapshot and rationale.",
    },
    {
      icon: Rocket,
      title: "Deploy",
      copy: "Enable only approved environments and channels. Model, tool and schedule gates remain separate.",
    },
  ];
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="WORKFORCE DEPLOYMENT"
        title={
          <>
            Move from draft to work
            <br />
            <em>without skipping governance.</em>
          </>
        }
        summary="Deploy Digital Colleagues through an evidence-backed lifecycle with clear provider truth and reversible operating controls."
        secondary="/workforce/governance"
      />
      <section className="workforce-public-section deployment-stages">
        <div className="workforce-section-heading">
          <p>CONTROLLED LIFECYCLE</p>
          <h2>Every transition has a gate.</h2>
        </div>
        <div>
          {stages.map((stage, index) => (
            <article key={stage.title}>
              <span>
                <stage.icon size={22} />
              </span>
              <small>0{index + 1}</small>
              <h2>{stage.title}</h2>
              <p>{stage.copy}</p>
              {index < stages.length - 1 && <ArrowRight size={21} />}
            </article>
          ))}
        </div>
      </section>
      <section className="workforce-public-section deployment-truth">
        <div>
          <p>CAPABILITY TRUTH</p>
          <h2>A deployment cannot invent infrastructure.</h2>
          <span>
            The governed work queue is useful on its own. External models,
            tools, scheduled jobs, realtime voice and GPU media remain
            independently configured and visibly labelled.
          </span>
        </div>
        <div>
          <article>
            <Bot size={19} />
            <span>
              <strong>Model execution</strong>
              <small>
                Disabled until a provider and server-side feature gate are
                configured.
              </small>
            </span>
          </article>
          <article>
            <Wrench size={19} />
            <span>
              <strong>Tool execution</strong>
              <small>
                Permissions never expose credentials; high-risk actions route to
                a person.
              </small>
            </span>
          </article>
          <article>
            <Network size={19} />
            <span>
              <strong>Schedules and events</strong>
              <small>
                Prepared in the schema, disabled until an approved worker is
                operating.
              </small>
            </span>
          </article>
        </div>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function CollaborationPage() {
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="HUMAN + DIGITAL COLLABORATION"
        title={
          <>
            Digital scale where it helps.
            <br />
            <em>People where it matters.</em>
          </>
        }
        summary="Design Digital Colleagues to prepare, coordinate and escalate work while named people retain authority for judgement, relationships and high-stakes outcomes."
        secondary="/workforce/governance"
      />
      <section className="workforce-public-section collaboration-map">
        <div className="collaboration-human">
          <span>
            <UsersRound size={27} />
          </span>
          <small>Human team</small>
          <h2>Owns outcomes</h2>
          <ul>
            <li>
              <Check size={14} />
              Approves role and risk
            </li>
            <li>
              <Check size={14} />
              Reviews sensitive work
            </li>
            <li>
              <Check size={14} />
              Handles exceptions and disputes
            </li>
            <li>
              <Check size={14} />
              Owns external commitments
            </li>
          </ul>
        </div>
        <div className="collaboration-bridge">
          <Handshake size={28} />
          <strong>Work queue</strong>
          <span>assign → prepare → review → release</span>
        </div>
        <div className="collaboration-digital">
          <span>
            <BriefcaseBusiness size={27} />
          </span>
          <small>Digital Colleague</small>
          <h2>Extends capacity</h2>
          <ul>
            <li>
              <Check size={14} />
              Handles repeatable intake
            </li>
            <li>
              <Check size={14} />
              Uses approved knowledge
            </li>
            <li>
              <Check size={14} />
              Prepares traceable products
            </li>
            <li>
              <Check size={14} />
              Escalates outside boundaries
            </li>
          </ul>
        </div>
      </section>
      <section className="workforce-public-section collaboration-principles">
        <div className="workforce-section-heading">
          <p>COLLABORATION PRINCIPLES</p>
          <h2>No silent substitution. No uncontrolled loops.</h2>
        </div>
        <div>
          <article>
            <CircleAlert size={20} />
            <h3>Explicit escalation</h3>
            <p>
              Every deployed role names a human destination, condition, channel
              and response expectation.
            </p>
          </article>
          <article>
            <Network size={20} />
            <h3>Controlled hand-offs</h3>
            <p>
              Digital Colleague hand-offs are bounded workflow steps. They
              cannot create recursive agent loops.
            </p>
          </article>
          <article>
            <BadgeCheck size={20} />
            <h3>Human release</h3>
            <p>
              Drafts affecting people, money, safety, rights or external
              commitments remain subject to accountable human review.
            </p>
          </article>
        </div>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function GovernancePage() {
  const controls = [
    {
      icon: UserRound,
      title: "Identity provenance",
      copy: "Digital Human consent, disclosure and revocation stay separate from its work role.",
    },
    {
      icon: BrainCircuit,
      title: "Published behaviour",
      copy: "A Digital Colleague links an immutable Persona version, not an unreviewed behavioural draft.",
    },
    {
      icon: Layers3,
      title: "Approved knowledge",
      copy: "Required sources must be active. Retrieved content is treated as untrusted data, never hidden instructions.",
    },
    {
      icon: Wrench,
      title: "Least-privilege tools",
      copy: "Tool policies record permitted and denied actions while credentials remain server-side.",
    },
    {
      icon: Gauge,
      title: "Risk-aware autonomy",
      copy: "High-risk and regulated work receives a lower autonomy ceiling and stronger human review.",
    },
    {
      icon: ClipboardCheck,
      title: "Append-only decisions",
      copy: "Approvals, work events and reviews preserve history instead of silently rewriting it.",
    },
  ];
  return (
    <MarketingShell>
      <WorkforceHero
        eyebrow="DIGITAL WORKFORCE GOVERNANCE"
        title={
          <>
            Govern the work,
            <br />
            <em>not only the avatar.</em>
          </>
        }
        summary="Make disclosure, role scope, risk, knowledge, tools, testing, human authority and deployment truth part of the operating system."
        secondary="/legal/responsible-ai"
      />
      <section className="workforce-public-section governance-grid">
        <div className="workforce-section-heading">
          <p>CONTROL SURFACE</p>
          <h2>Controls that survive beyond the demo.</h2>
        </div>
        <div>
          {controls.map((control) => (
            <article key={control.title}>
              <span>
                <control.icon size={21} />
              </span>
              <h3>{control.title}</h3>
              <p>{control.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="workforce-public-section prohibited-work">
        <div>
          <p>HUMAN AUTHORITY REQUIRED</p>
          <h2>Some work should never become a hidden autonomous action.</h2>
          <span>
            VowHumans blocks or escalates requests that exceed configured role,
            tool, budget, privacy or risk policy.
          </span>
        </div>
        <ul>
          <li>
            <CircleAlert size={15} />
            Employment, legal, medical or financial determinations
          </li>
          <li>
            <CircleAlert size={15} />
            Appearance, emotion, honesty or protected-trait scoring
          </li>
          <li>
            <CircleAlert size={15} />
            Unapproved access, destructive changes or financial commitments
          </li>
          <li>
            <CircleAlert size={15} />
            Undisclosed AI interaction or unauthorised identity simulation
          </li>
          <li>
            <CircleAlert size={15} />
            Uncontrolled agent-to-agent loops or silent Persona mutation
          </li>
        </ul>
      </section>
      <WorkforceConversion />
    </MarketingShell>
  );
}

function WorkforceConversion() {
  return (
    <section className="workforce-conversion">
      <div>
        <p>BUILD THE OPERATING MODEL</p>
        <h2>Turn a role into an accountable Digital Colleague.</h2>
        <span>
          Start with a template, then complete identity, Persona, work, risk,
          tests, approval and deployment in Studio.
        </span>
      </div>
      <div>
        <Link href="/sign-up" className="public-button">
          Start building <ArrowRight size={16} />
        </Link>
        <Link href="/book-demo" className="public-button ghost">
          Book an enterprise demo
        </Link>
      </div>
    </section>
  );
}

export function WorkforcePublic({ path }: { path?: PublicWorkforcePath }) {
  if (path === "roles") return <RolesPage />;
  if (path === "how-it-works") return <HowItWorksPage />;
  if (path === "deployment") return <DeploymentPage />;
  if (path === "human-collaboration") return <CollaborationPage />;
  if (path === "governance") return <GovernancePage />;
  return <WorkforceLanding />;
}
