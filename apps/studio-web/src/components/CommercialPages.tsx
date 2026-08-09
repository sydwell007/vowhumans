import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, CircleAlert, FileCheck2, LockKeyhole, Scale, Search, ShieldCheck, Sparkles } from "lucide-react";
import { ANNUAL_DISCOUNT_RATE } from "@vowhumans/commercial-core";
import { academyCourses, customerStories, industries, integrations, legalDocuments, products, publicPages, templates } from "@/data/commercial";
import { humans } from "@/data/platform";
import { MarketingShell } from "./MarketingShell";
import { InlineAction } from "./CommercialInteractive";
import { PricingCatalog, TemplateCatalog } from "./CommercialCatalogs";

function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="commercial-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link>{items.map((item)=><span key={item.label}>/ {item.href?<Link href={item.href}>{item.label}</Link>:item.label}</span>)}</nav>;
}

function Hero({ eyebrow, title, summary, crumbs = [], actions = true }: { eyebrow: string; title: string; summary: string; crumbs?: {label:string;href?:string}[]; actions?: boolean }) {
  return <section className="commercial-page-hero">{crumbs.length>0?<Crumb items={crumbs}/>:null}<p className="commercial-kicker"><span/>{eyebrow}</p><h1>{title}</h1><p>{summary}</p>{actions?<div className="page-cta-row"><Link href="/sign-up" className="public-button">Start building <ArrowRight size={16}/></Link><Link href="/book-demo" className="public-button ghost">Book a demo</Link></div>:null}</section>;
}

export function PublicContentPage({ slug }: { slug: keyof typeof publicPages }) {
  const page = publicPages[slug];
  const isTrustPage = slug === "security" || slug === "trust";
  return (
    <MarketingShell>
      <Hero eyebrow={page.eyebrow} title={page.title} summary={page.summary} />
      <section className="commercial-page-body">
        {slug === "investors" ? (
          <section className="investor-snapshot" aria-label="Platform snapshot">
            <div><strong>7</strong><span>connected product surfaces</span></div>
            <div><strong>13</strong><span>industry deployment patterns</span></div>
            <div><strong>1</strong><span>shared governance layer</span></div>
            <div><strong>Global</strong><span>architecture · South African foundation</span></div>
          </section>
        ) : null}
        <div className="content-card-grid">{page.sections.map((section)=><article className="content-card" key={section.title}><span className="commercial-status">Platform foundation</span><h2>{section.title}</h2><p>{section.copy}</p></article>)}</div>
        {slug === "investors" ? (
          <section className="investor-evidence">
            <div><p>INVESTMENT THESIS</p><h2>A reusable operating layer, not a single avatar feature.</h2><span>Identity, Persona, governed knowledge, channels, applications, integrations, usage and audit contracts are designed to compound across products and organisations.</span></div>
            <div className="evidence-list">
              <article><small>PLATFORM</small><strong>Commercial surface built</strong><span>Public site, Studio, portal, admin, API contracts and Afrihost backend assets exist.</span></article>
              <article><small>GO-TO-MARKET</small><strong>Demonstration-led validation</strong><span>Industry patterns, pricing logic and safe public demos support structured customer discovery.</span></article>
              <article><small>EVIDENCE STANDARD</small><strong>No invented traction</strong><span>Revenue, customer, certification and provider claims remain unpublished until independently supportable.</span></article>
            </div>
          </section>
        ) : null}
        {isTrustPage ? (
          <section className="trust-evidence" aria-label="Control readiness">
            <article><span>ACTIVE FOUNDATION</span><strong>Tenant-scoped access design</strong><p>Organisation context, roles and scoped server credentials are represented in platform contracts.</p></article>
            <article><span>REQUIRED AT LAUNCH</span><strong>Identity consent and disclosure</strong><p>Face, voice, purpose, geography, expiry and revocation are separated from application publishing.</p></article>
            <article><span>ROADMAP — NOT CERTIFIED</span><strong>External assurance</strong><p>POPIA/GDPR support, SOC 2 and ISO 27001 are readiness workstreams, not current certification claims.</p></article>
          </section>
        ) : null}
        <section className="sub-conversion"><div><h2>{page.cta??"Build with VowHumans"}</h2><p>Use safe sandbox mode now. External services remain gated until configuration and approval are complete.</p></div><Link href={slug === "investors" ? "/investor-contact" : isTrustPage ? "/trust-request" : "/studio"} className="public-button">{slug === "investors" ? "Contact investor relations" : isTrustPage ? "Request trust materials" : "Open Studio"} <ArrowRight size={15}/></Link></section>
      </section>
    </MarketingShell>
  );
}

export function ProductsPage(){return <MarketingShell><Hero eyebrow="PRODUCT FAMILY" title="One platform. Seven ways to deploy value." summary="Create in Studio, converse with Live, publish with Present, integrate through Connect and scale with Marketplace, Academy and Enterprise."/><section className="commercial-page-body"><div className="content-card-grid">{products.map(product=><Link className="content-card link-card" href={`/products/${product.slug}`} key={product.slug}><span className="commercial-status">{product.kicker}</span><h2>{product.name}</h2><p>{product.summary}</p><ul>{product.capabilities.slice(0,3).map(item=><li key={item}>{item}</li>)}</ul><b>Explore {product.name.replace('VowHumans ','')} <ArrowRight size={14}/></b></Link>)}</div></section></MarketingShell>}

export function ProductDetail({slug}:{slug:string}){const product=products.find(item=>item.slug===slug);if(!product)return null;return <MarketingShell><Hero eyebrow={product.kicker.toUpperCase()} title={product.name} summary={product.summary} crumbs={[{label:"Products",href:"/products"},{label:product.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside"><span className="commercial-status">Commercial foundation</span><dl><div><dt>PRODUCT</dt><dd>{product.name}</dd></div><div><dt>PROVIDER MODE</dt><dd>{slug==='studio'?'Functional Studio':slug==='connect'?'SDK + API foundation':'Feature-gated'}</dd></div><div><dt>DISCLOSURE</dt><dd>Required in every experience</dd></div></dl><Link href={slug==='studio'?'/studio':'/book-demo'} className="public-button">{slug==='studio'?'Open Studio':'Plan this deployment'}</Link></aside><div className="detail-content"><article className="content-card"><h2>What teams can build</h2><ul>{product.capabilities.map(item=><li key={item}>{item}</li>)}</ul></article><article className="content-card"><h2>Production boundary</h2><p>{slug==='live'?'Realtime voice and video require LiveKit, provider credentials, TURN and separately deployed workers. Audio and text fallback remain available.':slug==='present'?'Production voice, captions and video export require TTS, object storage, FFmpeg and approved media/GPU workers.':'Persistent customer operation requires configured authentication, database, email, storage and observability.'}</p></article><article className="content-card"><h2>Governance included</h2><p>Organisation scope, consent, identity provenance, disclosure, revocation, usage records, abuse reporting and audit contracts are shared across products.</p></article></div></section></MarketingShell>}

export function IndustriesPage(){return <MarketingShell><Hero eyebrow="INDUSTRY SOLUTIONS" title="Operational patterns with the boundaries written down." summary="Explore recommended roles, integrations, plans and safety controls for thirteen commercial sectors."/><section className="commercial-page-body"><div className="content-card-grid">{industries.map(industry=><Link className="content-card link-card" href={`/industries/${industry.slug}`} key={industry.slug}><span className="commercial-status">Recommended: {industry.plan}</span><h2>{industry.name}</h2><p>{industry.headline}</p><ul>{industry.roles.map(role=><li key={role}>{role}</li>)}</ul><b>Explore solution <ArrowRight size={14}/></b></Link>)}</div></section></MarketingShell>}

export function IndustryDetail({slug}:{slug:string}){const item=industries.find(industry=>industry.slug===slug);if(!item)return null;return <MarketingShell><Hero eyebrow={`${item.name.toUpperCase()} SOLUTION`} title={item.headline} summary={`Deploy bounded digital employees for ${item.workflows.join(', ').toLowerCase()} with explicit integration and security controls.`} crumbs={[{label:"Industries",href:"/industries"},{label:item.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside"><span className="commercial-status">Pilot architecture</span><dl><div><dt>RECOMMENDED PLAN</dt><dd>{item.plan}</dd></div><div><dt>PRIMARY ROLE</dt><dd>{item.roles[0]}</dd></div><div><dt>CASE STUDY</dt><dd>Internal pilot placeholder—no fabricated customer</dd></div></dl><Link href="/book-demo" className="public-button">Book industry demo</Link></aside><div className="detail-content"><article className="content-card"><h2>Problems addressed</h2><p>Waiting, repetitive guidance, inconsistent explanations and limited after-hours availability—while retaining human escalation for exceptions and regulated decisions.</p></article><article className="content-card"><h2>Recommended digital employees</h2><ul>{item.roles.map(role=><li key={role}>{role}</li>)}</ul></article><article className="content-card"><h2>Typical workflows</h2><ul>{item.workflows.map(flow=><li key={flow}>{flow}</li>)}</ul></article><article className="content-card"><h2>Required integrations</h2><ul>{item.integrations.map(integration=><li key={integration}>{integration}</li>)}</ul></article><article className="content-card"><h2>Security considerations</h2><p>{item.security}</p></article><article className="content-card"><h2>ROI model</h2><p>Model interaction demand, staff time, response targets and plan usage in the transparent calculator. Results are estimates, never guaranteed savings.</p><Link href={`/roi-calculator?industry=${item.slug}`}>Open ROI calculator <ArrowRight size={13}/></Link></article><div className="faq-list"><details><summary>Can this replace qualified professionals?</summary><p>No. VowHumans provides bounded information and workflow guidance with human escalation.</p></details><details><summary>Is a live avatar required?</summary><p>No. Text, voice-only and static portrait modes provide safe fallbacks.</p></details><details><summary>How is organisation data isolated?</summary><p>Every tenant-owned record carries an organisation ID from verified auth context, supported by role checks and database policies.</p></details></div></div></section></MarketingShell>}

export function PricingPage(){return <MarketingShell><Hero eyebrow="CONFIGURABLE PRICING" title="Start safely. Scale when the economics are clear." summary={`Proposed launch pricing in South African rand. Annual billing currently models a ${ANNUAL_DISCOUNT_RATE*100}% discount; final tax and commercial approval remain configurable.`}/><section className="commercial-page-body"><PricingCatalog/><div className="pricing-note"><CircleAlert size={18}/><p><b>Pricing is proposed and centrally configurable.</b> Prices exclude VAT and provider-specific premium identity, voice, GPU, storage and bandwidth usage. No payment is captured until an approved provider is enabled.</p></div><section className="sub-conversion"><h2>Estimate the complete usage picture.</h2><p>Compare live minutes, video generation, API calls and your current operating assumptions.</p><Link href="/roi-calculator" className="public-button">Open ROI calculator <ArrowRight size={15}/></Link></section></section></MarketingShell>}

export function GalleryPage(){return <MarketingShell><Hero eyebrow="AI HUMAN GALLERY" title="Fictional launch identities. Visible disclosure." summary="Explore role-ready digital humans without implying that synthetic placeholders are real actors or licensed customer identities."/><section className="commercial-page-body"><div className="catalog-toolbar"><h2>{humans.length} launch identities</h2><div className="filter-chips"><span>Fictional identity</span><span>Static portrait</span><span>Live-ready architecture</span><span>Presenter compatible</span></div></div><div className="gallery-grid">{humans.map(human=><Link href={`/digital-humans/${human.id}`} className="gallery-card" key={human.id}><div className="gallery-portrait"><Image src={human.image} alt={`Fictional AI-generated portrait of ${human.name}`} fill sizes="(max-width: 700px) 90vw, 33vw"/><span><Sparkles size={12}/> {human.disclosure}</span></div><div><span className="commercial-status">{human.status}</span><h3>{human.name}</h3><p>{human.role} · {human.applications.join(', ')}</p><b>View identity <ArrowRight size={14}/></b></div></Link>)}</div></section></MarketingShell>}

export function HumanDetail({slug}:{slug:string}){const human=humans.find(item=>item.id===slug);if(!human)return null;return <MarketingShell><Hero eyebrow="FICTIONAL AI-GENERATED IDENTITY" title={human.name} summary={`${human.role}. ${human.use}. This placeholder identity is synthetic and must never be represented as a real actor.`} crumbs={[{label:"Digital Humans",href:"/digital-humans"},{label:human.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside portrait-detail"><div className="gallery-portrait"><Image src={human.image} alt={`Fictional AI-generated portrait of ${human.name}`} fill priority sizes="380px"/></div><span className="commercial-status">{human.status}</span></aside><div className="detail-content"><article className="content-card"><h2>Role and applications</h2><p>{human.role} for {human.applications.join(', ')}.</p></article><article className="content-card"><h2>Identity classification</h2><p>Fictional AI-generated identity. No actor source media, cloned face or cloned voice is included.</p></article><article className="content-card"><h2>Current capability</h2><p>{human.mode}. Provider-backed realtime and video modes remain gated by credentials, consent and worker health.</p></article><div className="page-cta-row"><Link href="/demos/interview" className="public-button">Try safe demo</Link><Link href="/studio" className="public-button ghost dark-ghost">Add in Studio</Link></div></div></section></MarketingShell>}

export function TemplatesPage(){return <MarketingShell><Hero eyebrow="TEMPLATE LIBRARY" title="Start with a role that already knows its boundaries." summary="Search reviewed Persona, objective, guardrail, knowledge and channel recommendations, then install a safe draft workspace."/><section className="commercial-page-body"><TemplateCatalog/></section></MarketingShell>}

export function TemplateDetail({slug}:{slug:string}){const item=templates.find(template=>template.slug===slug);if(!item)return null;return <MarketingShell><Hero eyebrow={item.category.toUpperCase()} title={item.name} summary={item.description} crumbs={[{label:"Templates",href:"/templates"},{label:item.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside"><span className="commercial-status">{item.status}</span><dl><div><dt>INDUSTRY</dt><dd>{item.industry}</dd></div><div><dt>CHANNELS</dt><dd>{item.channels.join(', ')}</dd></div><div><dt>LICENCE</dt><dd>{item.price}</dd></div><div><dt>VERSION</dt><dd>v1 · GoalVow publisher seed</dd></div></dl><Link href="/app/templates" className="public-button">Install as draft</Link></aside><div className="detail-content"><article className="content-card"><h2>Persona objective</h2><p>Deliver the named role consistently, stay inside approved knowledge and escalate when the request leaves scope.</p></article><article className="content-card"><h2>Required guardrails</h2><ul><li>Visible AI disclosure</li><li>No unsupported professional advice</li><li>No hidden recording or transcript capture</li><li>Human escalation available</li></ul></article><article className="content-card"><h2>Suggested knowledge</h2><p>Organisation-approved policies, product or course material with access rules, version dates and source citations.</p></article></div></section></MarketingShell>}

export function IntegrationsPage(){return <MarketingShell><Hero eyebrow="INTEGRATIONS" title="Connect systems without overstating readiness." summary="Every connector shows authentication, data scope and implementation status before installation."/><section className="commercial-page-body"><div className="content-card-grid">{integrations.map(item=><Link className="content-card link-card" href={`/integrations/${item.slug}`} key={item.slug}><span className={`commercial-status status-${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</span><h2>{item.name}</h2><p>{item.scope}</p><small>{item.category} · {item.auth}</small><b>View integration <ArrowRight size={14}/></b></Link>)}</div></section></MarketingShell>}

export function IntegrationDetail({slug}:{slug:string}){const item=integrations.find(integration=>integration.slug===slug);if(!item)return null;return <MarketingShell><Hero eyebrow={`${item.category.toUpperCase()} INTEGRATION`} title={item.name} summary={item.scope} crumbs={[{label:"Integrations",href:"/integrations"},{label:item.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside"><span className="commercial-status">{item.status}</span><dl><div><dt>AUTHENTICATION</dt><dd>{item.auth}</dd></div><div><dt>DATA ACCESS</dt><dd>{item.scope}</dd></div><div><dt>HEALTH</dt><dd>{item.status==='Available'?'Contract verified in repository':'No live health claim'}</dd></div></dl><InlineAction className="public-button" idleLabel={item.status==='Available'?'Open installation guide':'Join waitlist'} doneLabel={item.status==='Available'?'Guide opening — check your inbox':'Added to the waitlist'} /></aside><div className="detail-content"><article className="content-card"><h2>Installation workflow</h2><ol><li>Review data scope and privacy.</li><li>Create a scoped environment credential.</li><li>Complete server-side authentication.</li><li>Run a health check with synthetic data.</li><li>Review sync and error logs before production.</li></ol></article><article className="content-card"><h2>Removal</h2><p>Revokes credentials, stops sync jobs and records an audit event. Required retained records remain subject to policy.</p></article></div></section></MarketingShell>}

export function CustomersPage(){return <MarketingShell><Hero eyebrow="CUSTOMER AND INTERNAL STORIES" title="Evidence with the status left intact." summary="These are internal demonstrations, pilot foundations and planned use cases—not fabricated customer endorsements."/><section className="commercial-page-body"><div className="content-card-grid">{customerStories.map(item=><Link className="content-card link-card" href={`/customers/${item.slug}`} key={item.slug}><span className="commercial-status">{item.status}</span><h2>{item.name}</h2><p>{item.problem}</p><b>Review case structure <ArrowRight size={14}/></b></Link>)}</div></section></MarketingShell>}

export function CustomerDetail({slug}:{slug:string}){const item=customerStories.find(story=>story.slug===slug);if(!item)return null;return <MarketingShell><Hero eyebrow={item.status.toUpperCase()} title={item.name} summary={item.problem} crumbs={[{label:"Customers",href:"/customers"},{label:item.name}]}/><section className="commercial-page-body"><div className="content-card-grid"><article className="content-card"><h2>Industry</h2><p>{item.industry}</p></article><article className="content-card"><h2>VowHumans solution</h2><p>{item.solution}</p></article><article className="content-card"><h2>Current outcome</h2><p>{item.outcome}</p></article></div><div className="pricing-note"><CircleAlert size={18}/><p>No external customer quote or commercial performance metric is asserted. Publication requires customer approval and evidence review.</p></div></section></MarketingShell>}

export function MarketplacePage({path=[]}:{path?:string[]}){const category=path[0]?.replaceAll('-',' ')??'All reviewed assets';return <MarketingShell><Hero eyebrow="VOWHUMANS MARKETPLACE" title={category==='seller'?'Publisher workspace foundation':`Discover ${category}.`} summary="Browse reviewed templates, Personas, knowledge packs, integrations and presentation assets. Purchases and payouts stay disabled until payment, tax and legal controls are approved."/><section className="commercial-page-body"><div className="marketplace-notice"><LockKeyhole size={18}/><span><b>Catalogue preview active</b>Purchases, seller payouts and reviews are feature-gated.</span></div><div className="content-card-grid">{templates.slice(0,6).map((item,index)=><article className="content-card" key={item.slug}><span className="commercial-status">{index<2?'Included':'Preview only'}</span><h2>{item.name}</h2><p>{item.description}</p><small>GoalVow seed publisher · Compatibility checked</small>{index<2?<InlineAction className="public-button" idleLabel="Install draft" doneLabel="Draft installed locally" />:<button className="public-button" disabled>Purchases disabled</button>}</article>)}</div></section></MarketingShell>}

export function AcademyPage({path=[]}:{path?:string[]}){const title=path[0]==='dashboard'?'Your learning dashboard':path[0]==='certifications'?'Certification paths':'Build a capable digital workforce';return <MarketingShell><Hero eyebrow="VOWHUMANS ACADEMY" title={title} summary="Role-based learning for creators, administrators, developers, partners and governance teams, supported by disclosed digital tutors."/><section className="commercial-page-body"><div className="content-card-grid">{academyCourses.map(course=><Link className="content-card link-card" href={`/academy/courses/${course.slug}`} key={course.slug}><span className="commercial-status">{course.status}</span><h2>{course.name}</h2><p>{course.level} · {course.lessons} lessons</p><b>View course <ArrowRight size={14}/></b></Link>)}</div></section></MarketingShell>}

export function CourseDetail({slug}:{slug:string}){const course=academyCourses.find(item=>item.slug===slug);if(!course)return null;return <MarketingShell><Hero eyebrow={`${course.level.toUpperCase()} COURSE`} title={course.name} summary={`${course.lessons} lesson learning path with text, exercises, quiz contracts and a disclosed digital tutor.`} crumbs={[{label:"Academy",href:"/academy"},{label:"Courses",href:"/academy/courses"},{label:course.name}]}/><section className="commercial-page-body detail-split"><aside className="detail-aside"><span className="commercial-status">{course.status}</span><dl><div><dt>LEVEL</dt><dd>{course.level}</dd></div><div><dt>LESSONS</dt><dd>{course.lessons}</dd></div><div><dt>CERTIFICATE</dt><dd>Verification architecture</dd></div></dl>{course.status==='Available'?<InlineAction className="public-button" idleLabel="Enrol in sandbox" doneLabel="Enrolled in sandbox" />:<button className="public-button" disabled>Coming later</button>}</aside><div className="detail-content"><article className="content-card"><h2>Learning outcomes</h2><ul><li>Understand the relevant VowHumans workflow</li><li>Apply responsible-AI and consent controls</li><li>Complete a practical configuration exercise</li><li>Pass a knowledge check without exposed answer keys</li></ul></article><article className="content-card"><h2>Digital tutor</h2><p>The GoalVow Tutor uses approved course material and cites displayed sample sources. Persistent learner progress requires configured authentication and database services.</p></article></div></section></MarketingShell>}

export function DeveloperPortalPage({section="developers"}:{section?:string}){const samples={typescript:`const client = new VowHumans({ apiKey: process.env.VOWHUMANS_API_KEY! });\nawait client.sessions.create({ digitalHumanId, mode: "static-portrait" });`,python:`client = VowHumans(api_key=os.environ["VOWHUMANS_API_KEY"])\nsession = client.create_interview_session(payload)`,php:`$client = new VowHumansClient(getenv('VOWHUMANS_API_KEY'));\n$session = $client->post('/api/v1/sessions', $payload);`,curl:`curl -X POST https://api.vowhumans.com/api/v1/sessions \\\n  -H "Authorization: Bearer $VOWHUMANS_API_KEY"`};return <MarketingShell><Hero eyebrow="VOWHUMANS CONNECT" title={section==='status'?'Platform and provider status':'APIs that preserve the boundary.'} summary="Versioned server APIs, short-lived session tokens, SDKs, signed webhooks and a safe sandbox for every integration."/><section className="commercial-page-body dev-layout"><aside className="dev-nav"><Link href="/developers">Quick start</Link><Link href="/api-reference">API reference</Link><Link href="/sdks">SDKs</Link><Link href="/webhooks">Webhooks</Link><Link href="/status">Status</Link></aside><div className="detail-content"><article className="content-card"><span className="commercial-status">SANDBOX READY</span><h2>{section.replaceAll('-',' ')}</h2><p>Use server-side credentials only. The browser receives short-lived, scoped session tokens from a trusted backend.</p></article><div className="code-sample-grid">{Object.entries(samples).map(([language,code])=><article key={language}><span>{language.toUpperCase()}</span><pre><code>{code}</code></pre></article>)}</div><article className="content-card"><h2>API surface</h2><p>Auth, organisations, workspaces, users, digital humans, identities, consent, voices, Personas, knowledge, sessions, LiveKit tokens, presenter projects, renders, applications, integrations, templates, marketplace, webhooks, usage, billing, analytics and health.</p><Link href="/api/openapi">Open development specification <ArrowRight size={14}/></Link></article></div></section></MarketingShell>}

type LegalDocumentSection = {
  id: string;
  title: string;
  copy: string;
  points?: string[];
};

type LegalDocumentProfile = {
  eyebrow: string;
  summary: string;
  introduction: string;
  sections: LegalDocumentSection[];
};

const legalProfiles: Partial<Record<(typeof legalDocuments)[number], LegalDocumentProfile>> = {
  privacy: {
    eyebrow: "PRIVACY & DATA GOVERNANCE",
    summary: "A draft framework for how VowHumans handles personal information, organisation data and disclosed digital-human activity.",
    introduction: "This document is being structured to explain what information the platform expects to process, why it is needed, how it is protected and which choices remain with customers and individuals.",
    sections: [
      { id: "scope", title: "Scope and application", copy: "The final notice will identify the VowHumans services, websites, Studio workspaces, customer portals and support interactions covered by the privacy framework." },
      { id: "information", title: "Information handled", copy: "The platform architecture separates account and organisation information from customer-provided content, identity permissions, consent records, usage events and security metadata.", points: ["Account, organisation and workspace details", "Customer-provided knowledge and configuration", "Identity, face and voice permission records", "Usage, audit, security and support events"] },
      { id: "purpose", title: "Purpose and controlled use", copy: "Information should be used only for defined platform operations, security, support, legal obligations and customer-authorised digital-human experiences. New purposes require review and appropriate notice." },
      { id: "providers", title: "Service providers and transfers", copy: "The approved document will list relevant provider categories, processing locations and safeguards. No provider or cross-border readiness claim should be published before configuration and counsel review." },
      { id: "retention", title: "Retention and security", copy: "Retention periods, deletion workflows, access controls and incident processes must be documented against the production systems actually enabled for each organisation." },
      { id: "rights", title: "Individual rights and contact", copy: "The final notice will explain how people can request access, correction, deletion or restriction where applicable, and how privacy questions or complaints are escalated." },
    ],
  },
  terms: {
    eyebrow: "PLATFORM TERMS",
    summary: "A draft commercial framework for responsible access to VowHumans products, Studio workspaces and digital-human services.",
    introduction: "These terms are being organised to make authority, acceptable operation, customer content, service dependencies and account responsibilities understandable before acceptance is requested.",
    sections: [
      { id: "agreement", title: "Agreement and service scope", copy: "The approved terms will identify the contracting entity, eligible services, incorporated policies, order documents and the date on which an agreement becomes effective." },
      { id: "accounts", title: "Accounts and authority", copy: "Organisations are responsible for authorised users, accurate workspace information, role assignment, credential security and activity performed through their accounts." },
      { id: "acceptable-use", title: "Permitted and prohibited use", copy: "Customers may use VowHumans only for lawful, disclosed and appropriately supervised experiences.", points: ["No hidden AI or covert recording", "No unauthorised face or voice cloning", "No impersonation, fraud or deceptive identity use", "No unsupported regulated or harmful decision-making"] },
      { id: "content", title: "Customer content and permissions", copy: "Customers must hold the rights and permissions required for source media, knowledge, scripts, brands and personal information they submit or connect to the platform." },
      { id: "availability", title: "Availability and external dependencies", copy: "Realtime, media, storage, payment and AI-provider capabilities depend on separately configured services. Draft or preview status must not be represented as a production service commitment." },
      { id: "suspension", title: "Suspension, termination and export", copy: "The final terms will define proportionate suspension grounds, termination rights, data export windows, retained records and obligations that continue after access ends." },
    ],
  },
  "responsible-ai": {
    eyebrow: "RESPONSIBLE AI",
    summary: "A draft governance standard for transparent, consent-based and human-accountable digital-human experiences.",
    introduction: "This framework is designed to make AI disclosure, identity provenance, consent, knowledge boundaries, escalation and prohibited capabilities visible throughout the product lifecycle.",
    sections: [
      { id: "principles", title: "Governance principles", copy: "VowHumans experiences should be purpose-bound, proportionate, reviewable and designed around a named human or organisational owner." },
      { id: "disclosure", title: "Disclosure and human agency", copy: "People should know when they are interacting with an AI system, understand its role and retain a clear route to stop, leave or reach a human where the context requires it." },
      { id: "identity", title: "Identity and voice consent", copy: "Faces, voices and source media require documented authority, defined uses, expiry and revocation. Fictional or synthetic identities must not be represented as real people." },
      { id: "prohibited", title: "Prohibited capabilities", copy: "Product and customer controls should prevent deceptive or unsafe uses.", points: ["Public-figure or unauthorised impersonation", "Appearance-based employment scoring", "Face-based emotion or honesty detection", "Hidden recording or undisclosed transcript capture", "Medical diagnosis or unsupported professional claims"] },
      { id: "data", title: "Data and knowledge boundaries", copy: "Digital employees should use approved, access-controlled knowledge; distinguish evidence from uncertainty; and avoid exposing private organisation or individual information." },
      { id: "oversight", title: "Oversight, testing and incidents", copy: "Owners should test behaviour before publication, monitor outcomes, preserve relevant audit events, support abuse reporting and suspend unsafe experiences while incidents are reviewed." },
    ],
  },
};

function defaultLegalProfile(title: string): LegalDocumentProfile {
  return {
    eyebrow: "LEGAL & GOVERNANCE",
    summary: `A structured draft for the VowHumans ${title.toLowerCase()} framework, pending specialist legal review and publication approval.`,
    introduction: "This document structure identifies the operational topics expected in the final policy while clearly separating platform foundations from approved legal commitments.",
    sections: [
      { id: "scope", title: "Purpose and scope", copy: "The approved document will define who and what it covers, when it applies and how it interacts with customer agreements and other VowHumans policies." },
      { id: "platform", title: "Platform responsibilities", copy: "VowHumans will describe active controls accurately and distinguish working foundations, external provider dependencies, readiness activity and independently certified status." },
      { id: "customer", title: "Customer responsibilities", copy: "Customers must use authorised identities and content, obtain required consent, protect credentials, follow prohibited-use controls and configure suitable human escalation." },
      { id: "operation", title: "Operational controls", copy: "The final document will identify applicable access, security, retention, reporting and audit processes against the production services that are actually enabled." },
      { id: "changes", title: "Changes and contact", copy: "Publication, material changes, effective dates and contact routes will be recorded here after legal and operational approval." },
    ],
  };
}

export function LegalPage({ slug }: { slug: string }) {
  if (!legalDocuments.includes(slug as typeof legalDocuments[number])) return null;
  const title = slug.split("-").map((word) => word.toLowerCase() === "ai" ? "AI" : word[0].toUpperCase() + word.slice(1)).join(" ");
  const profile = legalProfiles[slug as keyof typeof legalProfiles] ?? defaultLegalProfile(title);

  return (
    <MarketingShell>
      <Hero eyebrow={profile.eyebrow} title={title} summary={profile.summary} actions={false} crumbs={[{ label: "Legal" }, { label: title }]} />
      <section className="legal-page-shell">
        <div className="legal-document-layout">
          <aside className="legal-document-sidebar" aria-label={`${title} document navigation`}>
            <div className="legal-status-card">
              <span><FileCheck2 size={18} /> Document status</span>
              <strong>Draft for counsel</strong>
              <p>Not yet an approved policy or contractual commitment.</p>
            </div>
            <nav className="legal-toc" aria-label="On this page">
              <span>ON THIS PAGE</span>
              {profile.sections.map((section, index) => (
                <a href={`#${section.id}`} key={section.id}><b>{String(index + 1).padStart(2, "0")}</b>{section.title}</a>
              ))}
            </nav>
            <div className="legal-contact-card">
              <Scale size={21} />
              <strong>Need clarification?</strong>
              <p>Direct legal, privacy and governance questions to the VowHumans review team.</p>
              <Link href="/contact">Contact the team <ArrowRight size={14} /></Link>
            </div>
          </aside>

          <article className="legal-document">
            <header className="legal-document-header">
              <span className="legal-document-label"><BookOpenText size={16} /> Controlled document</span>
              <h2>Document overview</h2>
              <p className="legal-document-lede">{profile.introduction}</p>
              <dl className="legal-document-meta">
                <div><dt>VERSION</dt><dd>0.2 draft</dd></div>
                <div><dt>LAST STRUCTURED</dt><dd><CalendarDays size={14} /> 9 August 2026</dd></div>
                <div><dt>OWNER</dt><dd>Legal & governance</dd></div>
              </dl>
            </header>

            <div className="legal-review-notice" role="note">
              <CircleAlert size={20} />
              <p><b>Legal review required.</b> This structured draft supports counsel review and must not be treated as approved terms, a final privacy notice or formal legal advice until its publication status changes.</p>
            </div>

            <div className="legal-section-list">
              {profile.sections.map((section, index) => (
                <section className="legal-section" id={section.id} key={section.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h2>{section.title}</h2>
                  <p>{section.copy}</p>
                  {section.points ? <ul>{section.points.map((point) => <li key={point}><ShieldCheck size={16} />{point}</li>)}</ul> : null}
                </section>
              ))}
            </div>

            <footer className="legal-document-footer">
              <div><strong>Change history</strong><p>Draft v0.2 restructured on 9 August 2026 for clearer review and navigation. Acceptance is not requested while review status remains active.</p></div>
              <Link href="/trust">Visit Trust Centre <ArrowRight size={14} /></Link>
            </footer>
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}

export function SearchPage({query}:{query:string}){const q=query.trim().toLowerCase();const items=[...products.map(item=>({title:item.name,copy:item.summary,href:`/products/${item.slug}`,type:'Product'})),...industries.map(item=>({title:item.name,copy:item.headline,href:`/industries/${item.slug}`,type:'Industry'})),...templates.map(item=>({title:item.name,copy:item.description,href:`/templates/${item.slug}`,type:'Template'})),...academyCourses.map(item=>({title:item.name,copy:`${item.level} Academy course`,href:`/academy/courses/${item.slug}`,type:'Course'}))];const results=q?items.filter(item=>(item.title+' '+item.copy).toLowerCase().includes(q)):items.slice(0,8);return <MarketingShell><Hero eyebrow="PUBLIC SEARCH" title={q?`Results for “${query}”`:'Search VowHumans'} summary="Public results include products, industries, templates and Academy content only. Private organisation data never enters this index." actions={false}/><section className="commercial-page-body"><form action="/search" className="public-search"><Search size={18}/><input name="q" defaultValue={query} aria-label="Search public VowHumans content" placeholder="Search products, industries, templates…"/><button className="public-button">Search</button></form><div className="search-results-public">{results.map(item=><Link href={item.href} key={item.href}><span>{item.type}</span><h2>{item.title}</h2><p>{item.copy}</p><ArrowRight size={15}/></Link>)}{results.length===0?<div className="content-card"><h2>No public results</h2><p>Try a broader term. Private organisation and admin resources are intentionally excluded.</p></div>:null}</div></section></MarketingShell>}
