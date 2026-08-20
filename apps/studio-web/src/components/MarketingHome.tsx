import Image from "next/image";
import Link from "next/link";
import { ArrowRight, AudioLines, BadgeCheck, BarChart3, BookOpenCheck, Bot, Boxes, Check, CircleDollarSign, Clock3, Code2, Gauge, GraduationCap, Headphones, Languages, LockKeyhole, Play, Radio, ShieldCheck, Sparkles, UsersRound, Video } from "lucide-react";
import { plans } from "@vowhumans/commercial-core";
import { employeeRoles, industries, integrations, products, templates } from "@/data/commercial";
import { humans } from "@/data/platform";
import { MarketingShell } from "./MarketingShell";
import { EditorialVisual } from "./EditorialVisual";

const outcomes = [
  [Clock3, "24/7 availability", "Extend service beyond office hours without hiding that the interaction is AI."],
  [Languages, "Multilingual architecture", "Prepare one governed experience for several approved languages."],
  [Gauge, "Faster first response", "Answer repeatable questions immediately and route exceptions to people."],
  [BookOpenCheck, "Controlled knowledge", "Ground every answer in organisation-approved sources and citations."],
  [BarChart3, "Measurable operations", "Track usage, latency, cost and outcomes without reading private content."],
  [LockKeyhole, "Organisation ownership", "Keep identities, Personas, knowledge and credentials inside tenant boundaries."],
] as const;

const productIcons = [Sparkles, Radio, Video, Code2, Boxes, GraduationCap, ShieldCheck];
const steps = ["Choose a proven template", "Select or create a disclosed digital human", "Configure the Persona and objectives", "Connect trusted knowledge", "Test behaviour and escalation", "Choose channels and applications", "Publish with the right approvals", "Measure usage and improve"];

export function MarketingHome() {
  const starter = plans.find((plan) => plan.id === "starter");
  return (
    <MarketingShell tone="dark">
      <section className="commercial-hero">
        <div className="commercial-hero-copy">
          <p className="commercial-kicker"><span /> AI DIGITAL WORKFORCE PLATFORM</p>
          <h1>Human presence.<br /><em>AI intelligence.</em></h1>
          <p>Build a secure, branded AI digital workforce that teaches, interviews, sells, guides and supports people across websites, applications and enterprise systems.</p>
          <div className="commercial-actions"><Link href="/sign-up" className="public-button">Start building <ArrowRight size={17} /></Link><Link href="/book-demo" className="public-button ghost">Book an enterprise demo</Link></div>
          <Link href="/demos/interview" className="overview-link"><span><Play size={16} fill="currentColor" /></span> Watch the platform overview <ArrowRight size={14} /></Link>
          <div className="hero-proof"><span><Check size={14} /> Safe sandbox included</span><span><Check size={14} /> No card for evaluation</span><span><Check size={14} /> POPIA-aware foundations</span></div>
        </div>
        <div className="workforce-visual" aria-label="VowHumans disclosed digital workforce preview">
          <div className="workforce-window">
            <div className="window-top"><span><i /><i /><i /></span><b>Workforce operations</b><small>SAFE DEMO</small></div>
            <div className="workforce-grid">
              <div className="main-human-tile"><Image src={humans[0].image} alt="Fictional AI-generated Talent Partner" fill priority loading="eager" sizes="(max-width: 800px) 80vw, 500px" /><div className="human-tile-shade"/><span className="disclosure-tag"><Sparkles size={12}/>AI-GENERATED</span><div className="conversation-state"><AudioLines size={18}/><span><small>THANDI IS</small>Listening</span></div><p>“Let’s work through your interview preparation one step at a time.”</p></div>
              <div className="workforce-side"><div className="mini-human"><Image src={humans[2].image} alt="AI-generated course tutor" fill sizes="180px"/><span><Radio size={12}/>Tutor ready</span></div><div className="workflow-card"><span>LIVE WORKFLOW</span><b>Question received</b><i><em /></i><b>Knowledge checked</b><i className="done"><em /></i><b>Answer + citation</b><i className="active"><em /></i></div></div>
            </div>
            <div className="workforce-stats"><span><b>3</b><small>disclosed digital humans</small></span><span><b>684 ms</b><small>illustrative first audio</small></span><span><b>100%</b><small>consent-gated identities</small></span></div>
          </div>
          <div className="floating-workflow left"><Bot size={17}/><span><small>ROLE</small>Talent Partner</span></div><div className="floating-workflow right"><ShieldCheck size={17}/><span><small>GOVERNANCE</small>Disclosure on</span></div>
        </div>
      </section>

      <section className="trust-strip"><p>Built for GoalVow platforms</p><div><span>PLUGCONNECT <small>INTERNAL DEMO</small></span><span>GOALVOW ACADEMIES <small>PILOT FOUNDATION</small></span><span>VOWLMS <small>INTERNAL DEMO</small></span><span>VOWSUPPORT <small>PLANNED</small></span><span>VOWTOOLS <small>PLANNED</small></span></div></section>

      <section className="editorial-manifesto">
        <EditorialVisual variant="enterprise" priority sizes="(max-width: 860px) 100vw, 58vw" />
        <div className="editorial-manifesto-copy">
          <p>THE WORKFORCE, REIMAGINED RESPONSIBLY</p>
          <h2>AI presence that strengthens human capability.</h2>
          <span>VowHumans gives organisations a governed way to create digital colleagues while keeping people, consent and accountability visibly in control.</span>
          <dl>
            <div><dt>Human</dt><dd>judgement and escalation</dd></div>
            <div><dt>AI</dt><dd>availability and consistency</dd></div>
            <div><dt>One</dt><dd>governance foundation</dd></div>
          </dl>
          <Link href="/platform" className="text-link light-text">Explore the platform architecture <ArrowRight size={14}/></Link>
        </div>
      </section>

      <section className="commercial-section light outcomes-section"><div className="section-heading"><p>OUTCOMES BEFORE AVATARS</p><h2>Make every interaction more useful.</h2><span>Digital employees work best when their role, knowledge, escalation and economics are clear.</span></div><div className="outcome-grid">{outcomes.map(([Icon,title,copy])=><article key={title}><span><Icon size={20}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="commercial-section product-section"><div className="section-heading invert"><p>ONE CONNECTED PLATFORM</p><h2>Seven products. One governance layer.</h2><span>Start with a template or API, then scale into realtime, media and enterprise controls.</span></div><div className="product-commercial-grid">{products.map((product,index)=>{const Icon=productIcons[index];return <Link href={`/products/${product.slug}`} key={product.slug} className="commercial-product-card"><span><Icon size={22}/></span><small>{product.kicker}</small><h3>{product.name.replace('VowHumans ','')}</h3><p>{product.summary}</p><b>Explore product <ArrowRight size={14}/></b></Link>})}</div></section>

      <section className="commercial-section light roles-section"><div className="section-heading"><p>DIGITAL EMPLOYEE LIBRARY</p><h2>Choose the role. Keep control.</h2><span>Every role starts with a bounded Persona, approved knowledge and an explicit route to a person.</span></div><div className="role-cloud">{employeeRoles.map((role,index)=><Link href={`/templates/${templates[index%templates.length].slug}`} key={role}><span>{String(index+1).padStart(2,'0')}</span>{role}<ArrowRight size={14}/></Link>)}</div></section>

      <section className="commercial-section light sa-languages-section"><div className="section-heading"><p>ONE DIGITAL WORKFORCE. MANY LANGUAGES.</p><h2>Built for how South Africans actually speak.</h2><span>VowHumans is being designed to enable organisations to engage South Africans in the languages they are most comfortable using. Status is shown honestly — a language is never presented as ready before it has passed testing.</span></div><div className="sa-language-grid">{[["English","Available"],["Afrikaans","Beta"],["isiZulu","Planned"],["isiXhosa","Planned"],["Sepedi","Planned"],["Setswana","Planned"],["Sesotho","Planned"],["Xitsonga","Planned"],["siSwati","Planned"],["Tshivenda","Planned"],["isiNdebele","Planned"]].map(([name,status])=><span key={name} className={`language-chip status-${status.toLowerCase()}`}>{name}<small>{status}</small></span>)}</div></section>

      <section className="commercial-section industry-feature"><div className="industry-copy"><p className="commercial-kicker"><span/>BUILT FOR OPERATIONS</p><h2>Patterns for the industries that cannot afford guesswork.</h2><p>Each industry architecture documents required integrations, security boundaries and what must escalate to a qualified human.</p><Link href="/industries" className="public-button light-button">Explore industry solutions <ArrowRight size={16}/></Link></div><div className="industry-list">{industries.slice(0,8).map((industry,index)=><Link href={`/industries/${industry.slug}`} key={industry.slug}><span>{String(index+1).padStart(2,'0')}</span><b>{industry.name}</b><small>{industry.roles[0]}</small><ArrowRight size={16}/></Link>)}</div></section>

      <section className="commercial-section light how-section"><div className="section-heading"><p>FROM IDEA TO GOVERNED EXPERIENCE</p><h2>Launch in eight clear steps.</h2></div><ol className="how-grid">{steps.map((step,index)=><li key={step}><span>{String(index+1).padStart(2,'0')}</span><b>{step}</b></li>)}</ol></section>

      <section className="commercial-section demo-showcase"><div className="demo-showcase-head"><div><p>CONTROLLED PUBLIC DEMOS</p><h2>Experience the workflow—without hidden dependencies.</h2></div><span><BadgeCheck size={18}/>AI disclosure, consent and fallback included</span></div><div className="demo-cards"><Link href="/demos/interview"><span><UsersRound size={20}/></span><small>PLUGCONNECT</small><h3>Interview practice</h3><p>Candidate-owned rehearsal with private completion feedback.</p><b>Try the demo <ArrowRight size={14}/></b></Link><Link href="/demos/tutor"><span><GraduationCap size={20}/></span><small>GOALVOW ACADEMY</small><h3>Course tutor</h3><p>Ask approved lesson content and receive displayed citations.</p><b>Ask the tutor <ArrowRight size={14}/></b></Link><Link href="/demos/presenter"><span><Video size={20}/></span><small>VOWHUMANS PRESENT</small><h3>Presenter preview</h3><p>Build a disclosed static scene before connecting media workers.</p><b>Build a preview <ArrowRight size={14}/></b></Link></div></section>

      <section className="commercial-section light roi-teaser"><div><p>TRANSPARENT BUSINESS CASE</p><h2>Estimate value without promising magic.</h2><p>Model redirected hours, usage, cost per interaction and a sensitivity range using editable assumptions.</p><Link href="/roi-calculator" className="public-button">Open ROI calculator <ArrowRight size={16}/></Link></div><div className="roi-metric-board"><span><CircleDollarSign size={19}/><small>STARTER FROM</small><b>{starter ? `R${(starter.monthlyMinor!/100).toLocaleString('en-ZA')}` : 'Configure'}</b><em>Proposed monthly price · excl. VAT</em></span><span><Headphones size={19}/><small>LIVE USAGE</small><b>Metered</b><em>Included allowance + transparent overage</em></span><span><BarChart3 size={19}/><small>ROI OUTPUT</small><b>Range</b><em>Low, expected and high scenarios</em></span></div></section>

      <section className="commercial-section security-feature"><div className="security-ring"><ShieldCheck size={50}/><span>96<small>/100</small></span><em>FOUNDATION CONTROL COVERAGE</em></div><div><p>SECURITY AND RESPONSIBLE AI</p><h2>Every digital employee needs a permission slip.</h2><p>Identity, face, voice, role, application, geography, disclosure and revocation are separate controls—not a single checkbox.</p><div className="security-points"><span><Check size={14}/>Tenant isolation</span><span><Check size={14}/>Consent records</span><span><Check size={14}/>Scoped API keys</span><span><Check size={14}/>Immutable audit design</span><span><Check size={14}/>Retention controls</span><span><Check size={14}/>Abuse reporting</span></div><div className="inline-links"><Link href="/security">Security Centre <ArrowRight size={14}/></Link><Link href="/trust">Trust Centre <ArrowRight size={14}/></Link></div></div></section>

      <section className="commercial-section light integrations-home"><div className="section-heading"><p>CONNECT THE WORK YOU ALREADY RUN</p><h2>Integrations with honest status.</h2><span>Available means a repository contract exists. Planned never masquerades as connected.</span></div><div className="integration-logo-grid">{integrations.slice(0,10).map(item=><Link href={`/integrations/${item.slug}`} key={item.slug}><span>{item.name.slice(0,2).toUpperCase()}</span><b>{item.name}</b><small className={`status-${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</small></Link>)}</div></section>

      <section className="commercial-final"><div><p>YOUR FIRST DIGITAL EMPLOYEE STARTS WITH A ROLE.</p><h2>Build the experience.<br/>Keep the trust.</h2></div><div><Link href="/sign-up" className="public-button light-button">Create your first digital human <ArrowRight size={16}/></Link><Link href="/book-demo" className="public-button outline-light">Book a platform consultation</Link><Link href="/developers" className="text-link light-text">Explore API documentation <ArrowRight size={14}/></Link></div></section>
    </MarketingShell>
  );
}
