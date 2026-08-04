"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  BookOpenText,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Cloud,
  FileAudio,
  FileText,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  Languages,
  LockKeyhole,
  MessageSquareText,
  Mic2,
  MoreHorizontal,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserCheck,
  Video,
  WandSparkles,
  Webhook,
  X,
} from "lucide-react";
import { useState } from "react";
import { applications, humans, personas } from "@/data/platform";

const readiness = [
  { name: "Voice-only", state: "Adapter ready", tone: "good" },
  { name: "Static portrait", state: "Functional", tone: "good" },
  { name: "Pre-rendered avatar", state: "Scaffold", tone: "warn" },
  { name: "Live 2D avatar", state: "GPU required", tone: "muted" },
  { name: "3D avatar", state: "Planned", tone: "muted" },
];

function StatusPill({ children, tone = "good" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-pill ${tone}`}><i />{children}</span>;
}

function PanelTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="panel-title">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
      {action}
    </div>
  );
}

function EmptyAction({ icon: Icon, title, copy, button, onAction }: { icon: typeof Cloud; title: string; copy: string; button: string; onAction?: () => void }) {
  const [done, setDone] = useState(false);
  function completeAction() {
    setDone(true);
    onAction?.();
  }
  return (
    <div className="empty-action">
      <span className="empty-icon"><Icon size={23} /></span>
      <div><strong>{done ? "Draft created" : title}</strong><p>{done ? "The safe draft is ready for review. No external service was called." : copy}</p></div>
      <button className="secondary-button" onClick={completeAction}>{done ? <Check size={16} /> : null}{done ? "Ready" : button}</button>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="content-stack">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="pulse-dot" /> Phase 1 foundation · CPU-safe</div>
          <h2>Human presence.<br /><em>Honest by design.</em></h2>
          <p>Build reliable AI interviewers, tutors and presenters with consent, provenance and visible disclosure at the centre.</p>
          <div className="hero-actions">
            <Link className="button-light" href="/demos/interview"><Play size={17} fill="currentColor" />Try interview demo</Link>
            <Link className="button-ghost" href="/safety">View safety controls <ArrowRight size={16} /></Link>
          </div>
          <div className="hero-footnote"><ShieldCheck size={16} /> No cloning. No hidden AI. No appearance scoring.</div>
        </div>
        <div className="hero-human">
          <div className="portrait-orbit orbit-one" /><div className="portrait-orbit orbit-two" />
          <div className="hero-portrait-frame">
            <Image src={humans[0].image} alt="Original AI-generated portrait of Thandi Mokoena" fill priority sizes="(max-width: 900px) 70vw, 360px" />
            <span className="image-disclosure"><Sparkles size={13} /> AI-generated presenter</span>
          </div>
          <div className="floating-state state-listening"><AudioLines size={17} /><span><small>Current state</small>Listening</span></div>
          <div className="floating-state state-latency"><Gauge size={17} /><span><small>Mode</small>Static + voice</span></div>
        </div>
      </section>

      <section className="metric-grid">
        {[
          { label: "Active humans", value: "3", note: "+1 this month", icon: Bot, tone: "coral" },
          { label: "Sessions this month", value: "2,592", note: "+18.4%", icon: Radio, tone: "cyan" },
          { label: "Consent coverage", value: "100%", note: "All clear", icon: UserCheck, tone: "lime" },
          { label: "Estimated provider cost", value: "R 4,286", note: "Within budget", icon: Activity, tone: "violet" },
        ].map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className={`metric-icon ${metric.tone}`}><metric.icon size={20} /></span>
            <p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="split-grid wide-left">
        <div className="panel">
          <PanelTitle title="Digital humans" eyebrow="Ready to meet" action={<Link className="text-link" href="/digital-humans">View all <ArrowRight size={15} /></Link>} />
          <div className="human-list">
            {humans.map((human) => (
              <Link className="human-row" href="/digital-humans" key={human.id}>
                <span className="human-thumb"><Image src={human.image} alt="" fill sizes="52px" /></span>
                <span className="human-row-copy"><strong>{human.name}</strong><small>{human.role} · {human.applications.join(", ")}</small></span>
                <StatusPill>Ready</StatusPill><ChevronRight size={17} />
              </Link>
            ))}
          </div>
        </div>
        <div className="panel readiness-panel">
          <PanelTitle title="Capability truth" eyebrow="Exact mode status" />
          <div className="readiness-list">
            {readiness.map((item) => <div key={item.name}><span>{item.name}</span><StatusPill tone={item.tone}>{item.state}</StatusPill></div>)}
          </div>
          <p className="panel-note"><CircleAlert size={16} /> GPU modes remain off until licences, CUDA and approved infrastructure are ready.</p>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <PanelTitle title="Recent activity" eyebrow="Audit-friendly" />
          <div className="activity-list">
            {[
              ["Persona v3 published", "Professional Practice Interviewer", "8 min ago", "coral"],
              ["Practice session completed", "Candidate-owned · transcript consented", "21 min ago", "cyan"],
              ["Knowledge source indexed", "Interview Fundamentals · 24 chunks", "42 min ago", "lime"],
              ["Consent package reviewed", "GoalVow Tutor · approved", "Yesterday", "violet"],
            ].map(([title, sub, time, tone]) => <div className="activity-row" key={title}><i className={tone} /><span><strong>{title}</strong><small>{sub}</small></span><time>{time}</time></div>)}
          </div>
        </div>
        <div className="panel consent-panel">
          <PanelTitle title="Governance inbox" eyebrow="2 actions" />
          <div className="governance-card"><span><Clock3 size={20} /></span><div><strong>2 identities expire in 45 days</strong><p>Renew written permissions before new sessions are blocked.</p><Link href="/identity-consent">Review consent <ArrowRight size={15} /></Link></div></div>
          <div className="governance-card safe"><span><ShieldCheck size={20} /></span><div><strong>Disclosure checks passing</strong><p>All active surfaces show the required AI-generated label.</p></div></div>
        </div>
      </section>
    </div>
  );
}

function DigitalHumans() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="content-stack">
      <div className="filter-row"><div className="segmented"><button className="selected">All <b>3</b></button><button>Ready <b>3</b></button><button>Draft <b>0</b></button></div><span className="filter-note"><ShieldCheck size={16} /> Every live surface discloses AI</span></div>
      <section className="human-card-grid">
        {humans.map((human) => (
          <article className="human-card" key={human.id}>
            <div className="human-card-visual">
              <Image src={human.image} alt={`Original fictional AI-generated portrait of ${human.name}`} fill sizes="(max-width: 800px) 100vw, 33vw" />
              <span className="image-disclosure"><Sparkles size={13} /> AI-generated</span>
              <button className="image-menu" aria-label={`More actions for ${human.name}`}><MoreHorizontal size={18} /></button>
              <div className="voice-wave" aria-hidden="true">{[2,5,8,4,11,7,3,9,5,2].map((v,i)=><i key={i} style={{height: `${v + 4}px`}} />)}</div>
            </div>
            <div className="human-card-body">
              <div className="human-card-head"><div><h2>{human.name}</h2><p>{human.role}</p></div><StatusPill>{human.status}</StatusPill></div>
              <div className="human-meta"><span><BrainCircuit size={15} />{human.persona}</span><span><AppWindowIcon />{human.applications.join(" · ")}</span><span><Video size={15} />{human.mode}</span></div>
              <div className="human-card-actions"><button className="secondary-button" onClick={() => setSelected(human.id)}><Play size={15} />Test</button><button className="plain-button">Edit <ArrowRight size={15} /></button></div>
            </div>
          </article>
        ))}
      </section>
      <section className="panel identity-primer">
        <span className="primer-icon"><Fingerprint size={24} /></span>
        <div><p className="eyebrow">Keep the layers clear</p><h2>A face is not a Persona.</h2><p>Visual identity, voice identity, behaviour and application permissions are governed independently—then assembled into one disclosed experience.</p></div>
        <div className="layer-flow"><span>Face</span><i>+</i><span>Voice</span><i>+</i><span>Persona</span><i>→</i><strong>Digital human</strong></div>
      </section>
      {selected && <TestDrawer humanId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AppWindowIcon() { return <Globe2 size={15} />; }

function TestDrawer({ humanId, onClose }: { humanId: string; onClose: () => void }) {
  const human = humans.find((item) => item.id === humanId)!;
  return <div className="drawer-scrim"><aside className="test-drawer"><button className="icon-button drawer-close" aria-label="Close test panel" onClick={onClose}><X size={19} /></button><p className="eyebrow">Safe test console</p><h2>Meet {human.name}</h2><div className="drawer-portrait"><Image src={human.image} alt="" fill sizes="320px" /><span className="image-disclosure"><Sparkles size={13} /> AI-generated</span></div><StatusPill tone="warn">Mock conversation</StatusPill><p>{human.disclosure}. The live provider is not configured, so this test will not access your microphone.</p><Link href="/demos/interview" className="primary-button"><Play size={17} />Open interview demo</Link></aside></div>;
}

function Personas() {
  const [selected, setSelected] = useState(personas[0]);
  const [message, setMessage] = useState("Tell me about a time you solved a difficult problem.");
  const [tested, setTested] = useState(false);
  return (
    <div className="content-stack">
      <section className="split-grid persona-layout">
        <div className="panel persona-list-panel">
          <PanelTitle title="Persona library" eyebrow={`${personas.length} configurations`} />
          <div className="persona-list">{personas.map((persona) => <button key={persona.name} className={selected.name===persona.name ? "selected" : ""} onClick={() => {setSelected(persona);setTested(false);}}><span className="persona-glyph"><BrainCircuit size={19} /></span><span><strong>{persona.name}</strong><small>{persona.role}</small></span><StatusPill tone={persona.state === "Draft" ? "warn" : "good"}>{persona.state}</StatusPill></button>)}</div>
        </div>
        <div className="panel persona-editor">
          <div className="editor-top"><div><p className="eyebrow">{selected.version} · {selected.state}</p><h2>{selected.name}</h2><p>{selected.role}</p></div><button className="secondary-button">Duplicate as draft</button></div>
          <div className="form-grid two"><label>Conversation style<input value="Warm, professional and concise" readOnly /></label><label>Language<select defaultValue="English (South Africa)"><option>English (South Africa)</option><option>isiZulu</option><option>Sesotho</option></select></label><label className="full">Opening message<textarea value="Hello, I’m your AI-generated practice partner. I’ll help you prepare in a private, supportive session." readOnly /></label><label>Maximum response length<input value="120 words" readOnly /></label><label>Speaking rate<input value="0.96 × natural" readOnly /></label></div>
          <div className="guardrail-tags"><span><ShieldCheck size={14} />No employer access</span><span><ShieldCheck size={14} />No appearance scoring</span><span><ShieldCheck size={14} />Disclose AI</span></div>
          <div className="immutable-note"><LockKeyhole size={18} /><span><strong>Published versions are immutable.</strong> Changes create a new draft version with a complete audit trail.</span></div>
        </div>
      </section>
      <section className="panel test-console">
        <PanelTitle title="Persona test console" eyebrow="Mock provider · no microphone" action={<StatusPill tone="warn">Development</StatusPill>} />
        <div className="console-grid"><div className="console-chat"><div className="chat-message agent"><span>VH</span><p>Hello, I’m your disclosed AI practice interviewer. I’ll ask one question at a time and keep your answers private.</p></div>{tested && <div className="chat-message user"><span>YOU</span><p>{message}</p></div>}{tested && <div className="chat-message agent"><span>VH</span><p>Take a moment to structure your answer with the situation, your actions and the result. What made the problem especially difficult?</p></div>}</div><div className="console-controls"><label>Test message<textarea value={message} onChange={(e)=>setMessage(e.target.value)} /></label><button className="primary-button" onClick={()=>setTested(true)}><MessageSquareText size={17} />Run Persona test</button><p><ShieldCheck size={14} /> Deterministic mock response. No provider cost.</p></div></div>
      </section>
    </div>
  );
}

function Knowledge() {
  const [indexed, setIndexed] = useState(false);
  const documents = [
    { name: "Interview Fundamentals", type: "PDF", scope: "PlugConnect", chunks: 42, state: "Indexed", updated: "Today, 19:44" },
    { name: "Customer Service Essentials", type: "DOCX", scope: "GoalVow Academies", chunks: 68, state: "Indexed", updated: "Yesterday" },
    { name: "Career Readiness: Module 2", type: "Markdown", scope: "VowLMS", chunks: 31, state: "Indexed", updated: "30 Jul" },
    { name: "Support escalation guide", type: "Website", scope: "VowSupport", chunks: 0, state: "Draft", updated: "28 Jul" },
  ];
  return (
    <div className="content-stack">
      <section className="metric-grid compact-metrics">
        {[['Approved sources','4',BookOpenText],['Indexed chunks','141',Sparkles],['Languages','3',Languages],['Citation coverage','98.7%',BadgeCheck]].map(([label,value,Icon]) => <article className="metric-card" key={String(label)}><span className="metric-icon cyan"><Icon size={20} /></span><p>{String(label)}</p><strong>{String(value)}</strong></article>)}
      </section>
      <section className="panel">
        <PanelTitle title="Knowledge sources" eyebrow="Organisation-owned" action={<div className="table-tools"><button>All sources</button><button><RefreshCw size={15} />Sync</button></div>} />
        <div className="data-table knowledge-table">
          <div className="table-row table-head"><span>Source</span><span>Scope</span><span>Chunks</span><span>Status</span><span>Updated</span></div>
          {documents.map((doc) => <div className="table-row" key={doc.name}><span className="source-cell"><i><FileText size={17} /></i><b>{doc.name}<small>{doc.type}</small></b></span><span>{doc.scope}</span><span>{doc.chunks || '—'}</span><span><StatusPill tone={doc.state==='Draft'?'warn':'good'}>{doc.state}</StatusPill></span><span>{doc.updated}</span></div>)}
          {indexed && <div className="table-row"><span className="source-cell"><i><FileText size={17} /></i><b>New approved curriculum<small>Text</small></b></span><span>GoalVow Academies</span><span>12</span><span><StatusPill>Indexed</StatusPill></span><span>Just now</span></div>}
        </div>
      </section>
      <section className="split-grid">
        <div className="panel ingestion-card"><span className="empty-icon"><UploadCloud size={24} /></span><p className="eyebrow">Trusted ingestion</p><h2>Add approved knowledge</h2><p>PDF, DOCX, Markdown, text or administrator-approved website content. Uploaded text stays separated from system instructions.</p><button className="primary-button" onClick={()=>setIndexed(true)}>{indexed?<Check size={17}/>:<UploadCloud size={17}/>} {indexed?'Sample indexed':'Choose sample document'}</button></div>
        <div className="panel safety-checklist"><PanelTitle title="Retrieval safeguards" eyebrow="Always on" />{['Organisation ownership required','Source access checked before retrieval','Prompt injection patterns isolated','Every grounded answer carries citations','Deletion removes chunks and embeddings'].map(item=><div key={item}><CircleCheck size={17}/><span>{item}</span></div>)}</div>
      </section>
    </div>
  );
}

function IdentityConsent() {
  const [reviewed, setReviewed] = useState(false);
  const records = [
    { owner: "GoalVow original placeholder", identity: "Thandi Mokoena", scope: "PlugConnect practice", expiry: "31 Dec 2027", status: "Approved" },
    { owner: "GoalVow original placeholder", identity: "Sipho Daniels", scope: "PlugConnect practice", expiry: "31 Dec 2027", status: "Approved" },
    { owner: "GoalVow synthetic asset", identity: "GoalVow Tutor", scope: "Academies · VowLMS", expiry: "No actor likeness", status: "Approved" },
    { owner: "Awaiting owner verification", identity: "Custom presenter 04", scope: "Not assigned", expiry: "—", status: "Blocked" },
  ];
  return (
    <div className="content-stack">
      <section className="consent-banner"><span><ShieldCheck size={28}/></span><div><p className="eyebrow">Publication gate active</p><h2>No identity goes live on a handshake.</h2><p>Written permissions, provenance, purpose and expiry are mandatory. Revocation blocks new sessions and renders immediately.</p></div><div className="consent-score"><strong>100%</strong><small>active coverage</small></div></section>
      <section className="panel">
        <PanelTitle title="Identity register" eyebrow="4 identities" action={<button className="table-action">Filter <ChevronRight size={15}/></button>} />
        <div className="data-table consent-table"><div className="table-row table-head"><span>Identity</span><span>Owner</span><span>Permitted scope</span><span>Expiry</span><span>Status</span></div>{records.map(record=><div className="table-row" key={record.identity}><span className="source-cell"><i><Fingerprint size={17}/></i><b>{record.identity}</b></span><span>{record.owner}</span><span>{record.scope}</span><span>{record.expiry}</span><span><StatusPill tone={record.status==='Blocked'?'danger':'good'}>{record.status}</StatusPill></span></div>)}</div>
      </section>
      <section className="split-grid consent-workflow-grid">
        <div className="panel">
          <PanelTitle title="Consent package requirements" eyebrow="All required before publish" />
          <div className="requirement-list">{['Identity owner name recorded','Written consent document uploaded','Separate face and voice consent','Roles and applications selected','Commercial use confirmed','Geographic scope recorded','Expiry and revocation terms','Source-media provenance','Administrator approval'].map((item,index)=><div key={item} className={index<7?'done':''}><span>{index<7?<Check size={14}/>:index+1}</span>{item}</div>)}</div>
        </div>
        <div className="panel review-card"><span className="review-visual"><UserCheck size={31}/></span><p className="eyebrow">Pending review</p><h2>Custom presenter 04</h2><p>Publishing and rendering are blocked. Owner verification and administrator approval remain outstanding.</p><div className="review-warning"><CircleAlert size={17}/>No sessions can be created.</div><button className="primary-button" onClick={()=>setReviewed(true)}>{reviewed?<Check size={17}/>:<ShieldCheck size={17}/>} {reviewed?'Review recorded':'Record safe review'}</button></div>
      </section>
    </div>
  );
}

function LiveSessions() {
  const sessions = [
    { human: 'Thandi Mokoena', app: 'PlugConnect', owner: 'Candidate-owned', state: 'Listening', duration: '08:42', mode: 'Static + voice' },
    { human: 'GoalVow Tutor', app: 'GoalVow Academies', owner: 'Learner session', state: 'Speaking', duration: '14:05', mode: 'Audio-only' },
    { human: 'Sipho Daniels', app: 'PlugConnect', owner: 'Candidate-owned', state: 'Completed', duration: '17:19', mode: 'Static + voice' },
  ];
  return <div className="content-stack"><section className="session-overview"><div><span className="live-orb"><Radio size={25}/></span><p className="eyebrow">Live now</p><strong>2</strong><small>healthy sessions</small></div><div><p>Time to first audio</p><strong>684 ms</strong><small>p95 · mock transport</small></div><div><p>Reconnects</p><strong>0.4%</strong><small>rolling 30 days</small></div><div><p>Audio fallback</p><strong>100%</strong><small>verified in tests</small></div></section><section className="panel"><PanelTitle title="Session monitor" eyebrow="Private content hidden" action={<StatusPill>All systems nominal</StatusPill>}/><div className="data-table sessions-table"><div className="table-row table-head"><span>Human</span><span>Application</span><span>Ownership</span><span>State</span><span>Duration</span><span>Mode</span></div>{sessions.map(session=><div className="table-row" key={session.human+session.duration}><span><b>{session.human}</b></span><span>{session.app}</span><span><LockKeyhole size={14}/>{session.owner}</span><span><StatusPill tone={session.state==='Completed'?'muted':'good'}>{session.state}</StatusPill></span><span>{session.duration}</span><span>{session.mode}</span></div>)}</div></section><section className="split-grid"><div className="panel"><PanelTitle title="Realtime health" eyebrow="Provider boundaries"/><div className="health-grid">{[['LiveKit transport','Mock ready','good'],['OpenAI Realtime','Credentials needed','warn'],['Avatar worker','Audio fallback','good'],['Transcript store','Consent gated','good']].map(([name,state,tone])=><div key={name}><span>{name}</span><StatusPill tone={tone}>{state}</StatusPill></div>)}</div></div><div className="panel"><EmptyAction icon={Mic2} title="Run a safe test" copy="Start a disclosed mock room without requesting microphone access." button="Open test"/></div></section></div>;
}

function PresenterStudio() {
  const [script, setScript] = useState("Welcome to GoalVow Academy. In this lesson, we’ll explore how clear communication builds stronger customer relationships.");
  const [format, setFormat] = useState('16:9');
  const [status, setStatus] = useState('Draft');
  function renderPreview(){setStatus('Queued');window.setTimeout(()=>setStatus('Mock preview ready'),900);}
  return <div className="content-stack"><section className="presenter-workspace"><div className="panel scene-editor"><PanelTitle title="Customer Service Essentials" eyebrow="Module 1 · Lesson 2" action={<StatusPill tone={status==='Mock preview ready'?'good':'warn'}>{status}</StatusPill>}/><label className="script-field">Presenter script<textarea value={script} onChange={e=>setScript(e.target.value)}/><span>{script.length} characters · ~{Math.max(1,Math.round(script.split(/\s+/).length/2.3))} sec</span></label><div className="form-grid two"><label>Presenter<select defaultValue="GoalVow Tutor"><option>GoalVow Tutor</option><option>Thandi Mokoena</option></select></label><label>Voice<select defaultValue="Ayo · Warm"><option>Ayo · Warm</option><option>Development mock</option></select></label><label>Output language<select defaultValue="English (South Africa)"><option>English (South Africa)</option><option>isiZulu</option></select></label><label>Visual theme<select defaultValue="GoalVow Midnight"><option>GoalVow Midnight</option><option>Clean classroom</option></select></label></div><div className="format-picker">{['16:9','9:16','1:1','Audio'].map(item=><button key={item} className={format===item?'selected':''} onClick={()=>setFormat(item)}>{item==='Audio'?<FileAudio size={18}/>:<span className={`ratio ratio-${item.replace(':','')}`}/>}<b>{item}</b></button>)}</div><div className="pipeline-strip">{['Script','Scenes','Voice','Avatar','Captions','Assembly'].map((step,index)=><div key={step} className={index===0?'active':''}><span>{index+1}</span><small>{step}</small></div>)}</div><button className="primary-button render-button" onClick={renderPreview} disabled={!script.trim()||status==='Queued'}>{status==='Queued'?<RefreshCw className="spin" size={17}/>:<WandSparkles size={17}/>} {status==='Queued'?'Building mock preview…':'Generate mock preview'}</button></div><div className="presenter-preview"><div className={`preview-stage preview-${format.replace(':','')}`}><Image src={humans[2].image} alt="Original AI-generated GoalVow Tutor" fill sizes="480px"/><div className="preview-scrim"/><span className="preview-label"><Sparkles size={13}/>AI-generated presenter</span><div className="preview-caption">Clear communication begins with listening.</div><button aria-label="Play preview"><Play size={25} fill="currentColor"/></button></div><div className="preview-meta"><div><span>OUTPUT</span><strong>{format} · 1080p</strong></div><div><span>MODE</span><strong>Static mock</strong></div><div><span>EXPORT</span><strong>{status==='Mock preview ready'?'Ready to review':'Not rendered'}</strong></div></div><div className="truth-card"><CircleAlert size={18}/><p><strong>This is an honest static preview.</strong> Production voice, lip-sync and MP4 assembly require approved providers, GPU infrastructure and FFmpeg.</p></div></div></section></div>;
}

function Applications() {
  return <div className="content-stack"><section className="application-grid">{applications.map(app=><article className="application-card" key={app.name}><div className={`app-logo ${app.colour}`}>{app.code}</div><div className="application-head"><div><h2>{app.name}</h2><p>{app.status==='Connected'?'Production integration':'Development sandbox'}</p></div><StatusPill tone={app.status==='Connected'?'good':'warn'}>{app.status}</StatusPill></div><div className="app-stats"><span><small>Humans</small><strong>{app.humans}</strong></span><span><small>Sessions</small><strong>{app.sessions}</strong></span></div><button className="plain-button">Manage integration <ArrowRight size={15}/></button></article>)}</section><section className="panel integration-principle"><span><LockKeyhole size={23}/></span><div><p className="eyebrow">Server-to-server only</p><h2>Keys never visit the browser.</h2><p>Applications receive scoped service credentials and short-lived room tokens. Persona overrides stay versioned per application.</p></div><Link href="/api-keys" className="secondary-button">Manage API keys</Link></section></div>;
}

function Usage() {
  const bars=[38,51,44,72,64,81,70,92,74,61,88,77];
  return <div className="content-stack"><section className="metric-grid">{[['Session minutes','18,420','+12.8%'],['Realtime audio','13,104 min','71% of usage'],['Presenter jobs','84','12 queued'],['Estimated cost','R 4,286','68% of budget']].map(([label,value,note])=><article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</section><section className="split-grid wide-left"><div className="panel usage-chart"><PanelTitle title="Session volume" eyebrow="Last 12 months" action={<button className="table-action">Monthly <ChevronRight size={14}/></button>}/><div className="chart-area"><div className="chart-y"><span>3k</span><span>2k</span><span>1k</span><span>0</span></div><div className="bars">{bars.map((bar,index)=><div key={index}><i style={{height:`${bar}%`}}/><small>{['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][index]}</small></div>)}</div></div></div><div className="panel provider-cost"><PanelTitle title="Provider mix" eyebrow="Estimated cost"/>{[['Realtime voice','R 2,460','57%','coral'],['Transcription','R 814','19%','cyan'],['Language models','R 685','16%','lime'],['Storage + media','R 327','8%','violet']].map(([name,cost,share,tone])=><div className="cost-row" key={name}><i className={tone}/><span><b>{name}</b><small>{share}</small></span><strong>{cost}</strong></div>)}<div className="budget-meter"><span><i style={{width:'68%'}}/></span><small>68% of R 6,300 monthly budget</small></div></div></section></div>;
}

function AssetLibrary({ type }: { type: 'voices' | 'faces' | 'gesture-profiles' }) {
  const config = {
    voices: { icon: AudioLines, label: 'Voice', summary: 'Provider voice or consented custom asset', items: [['Ayo · Warm','OpenAI adapter','English (ZA)','Provider voice'],['Nandi · Clear','Development mock','English · isiZulu','Mock'],['Tutor neutral','OpenAI adapter','Multilingual','Provider voice']] },
    faces: { icon: Fingerprint, label: 'Face asset', summary: 'Provenance and consent remain separate', items: [['Thandi placeholder','GoalVow generated','PlugConnect','Approved'],['Sipho placeholder','GoalVow generated','PlugConnect','Approved'],['Tutor placeholder','GoalVow generated','Academies · VowLMS','Approved']] },
    'gesture-profiles': { icon: Sparkles, label: 'Gesture profile', summary: 'Natural timing with conservative limits', items: [['Professional calm','Blink 4–7s','Head ±3°','Published'],['Tutor engaged','Blink 3–6s','Head ±4°','Published'],['Presenter neutral','Blink 4–8s','Head ±2°','Draft']] },
  }[type];
  const Icon=config.icon;
  return <div className="content-stack"><section className="asset-intro"><span><Icon size={26}/></span><div><p className="eyebrow">Independent identity layer</p><h2>{config.label} library</h2><p>{config.summary}. Publication always checks current permissions and revocation status.</p></div></section><section className="asset-card-grid">{config.items.map(item=><article className="panel asset-card" key={item[0]}><div className="asset-card-top"><span className="empty-icon"><Icon size={21}/></span><StatusPill tone={item[3]==='Draft'?'warn':'good'}>{item[3]}</StatusPill></div><h2>{item[0]}</h2><p>{item[1]}</p><div className="asset-detail"><span>{item[2]}</span><button aria-label={`More actions for ${item[0]}`}><MoreHorizontal size={17}/></button></div>{type==='voices'&&<button className="secondary-button"><Play size={15}/>Play sample</button>}</article>)}</section><section className="panel"><EmptyAction icon={type==='voices'?Mic2:type==='faces'?Fingerprint:Sparkles} title={`Create a ${config.label.toLowerCase()} draft`} copy="New assets stay unpublished until provider, provenance and consent checks pass." button="Create safe draft"/></section></div>;
}

function ApiKeys() {
  const [created,setCreated]=useState(false);
  return <div className="content-stack"><section className="security-callout"><span><KeyRound size={27}/></span><div><p className="eyebrow">Hash-only credentials</p><h2>Scoped access, shown once.</h2><p>Raw service keys are never stored or placed in client-side code. Rotate immediately if a key may be exposed.</p></div></section><section className="panel"><PanelTitle title="Service API keys" eyebrow="3 active"/><div className="data-table keys-table"><div className="table-row table-head"><span>Name</span><span>Prefix</span><span>Scopes</span><span>Last used</span><span>Status</span></div>{[['PlugConnect production','vhm_pc_••••8A2F','sessions:create · usage:read-own','4 min ago'],['GoalVow Academies','vhm_ga_••••51BE','sessions:create · renders:create','18 min ago'],['VowLMS sandbox','vhm_vl_••••AA90','sessions:create','3 days ago']].map(row=><div className="table-row" key={row[0]}><span><b>{row[0]}</b></span><span><code>{row[1]}</code></span><span>{row[2]}</span><span>{row[3]}</span><span><StatusPill>Active</StatusPill></span></div>)}{created&&<div className="table-row new-row"><span><b>Development key draft</b></span><span><code>vhm_dev_••••NEW</code></span><span>health:read</span><span>Never</span><span><StatusPill tone="warn">Draft</StatusPill></span></div>}</div></section><section className="split-grid"><div className="panel"><EmptyAction icon={KeyRound} title="Issue a development key" copy="This local action creates a UI draft only—no raw credential is generated." button={created?'Draft ready':'Prepare key draft'} onAction={()=>setCreated(true)}/></div><div className="panel safety-checklist"><PanelTitle title="Key hygiene" eyebrow="Required"/>{['Minimum 32 random bytes','Explicit scopes and application binding','Expiry or rotation date','Rate-limit profile','Revocation audit event'].map(item=><div key={item}><CircleCheck size={17}/><span>{item}</span></div>)}</div></section></div>;
}

function WebhooksPage() {
  const [tested,setTested]=useState(false);
  return <div className="content-stack"><section className="panel"><PanelTitle title="Webhook endpoints" eyebrow="HMAC signed · retry safe"/><div className="webhook-list">{[['PlugConnect lifecycle','https://api.plugconnect.example/vowhumans/events','session.completed · session.deleted','Healthy'],['GoalVow Academies','https://academy.example/api/vowhumans/webhook','render.completed · render.failed','Healthy'],['Development inspector','https://example.invalid/hooks/vowhumans','All sandbox events','Paused']].map(row=><div className="webhook-row" key={row[0]}><span className="empty-icon"><Webhook size={19}/></span><div><strong>{row[0]}</strong><code>{row[1]}</code><small>{row[2]}</small></div><StatusPill tone={row[3]==='Paused'?'warn':'good'}>{row[3]}</StatusPill><button className="icon-button" aria-label={`More actions for ${row[0]}`}><MoreHorizontal size={18}/></button></div>)}</div></section><section className="split-grid"><div className="panel webhook-test"><p className="eyebrow">Delivery tester</p><h2>Verify without sending private content</h2><p>Generate a local signed event envelope with synthetic identifiers only.</p><button className="primary-button" onClick={()=>setTested(true)}>{tested?<Check size={17}/>:<RefreshCw size={17}/>} {tested?'Signature verified':'Run local verification'}</button></div><div className="panel code-panel"><div className="code-dots"><i/><i/><i/></div><pre>{tested?`HTTP/1.1 200 OK\nX-VowHumans-Event: evt_test_01\n\n{ "verified": true, "replayed": false }`:`X-VowHumans-Signature: t=...,v1=...\nX-VowHumans-Event: evt_...\n\nNo transcript fields are included.`}</pre></div></section></div>;
}

function Safety() {
  const controls=[['Visible AI disclosure','100% coverage','Every session, preview and export surface',Sparkles],['Identity consent gate','3 approved · 1 blocked','Revocation stops new work immediately',UserCheck],['Private transcript policy','Candidate/learner owned','No employer practice-answer access',LockKeyhole],['Moderation pipeline','Mock checks active','Provider moderation adapter ready',ShieldCheck],['Knowledge boundaries','141 cited chunks','Uploads never become system instructions',BookOpenText],['Retention controls','30 day default','Deletion queue contract enabled',Clock3]];
  return <div className="content-stack"><section className="safety-hero"><div><span className="safety-shield"><ShieldCheck size={34}/></span><p className="eyebrow">Safety posture</p><h2>Trust is a system property.</h2><p>VowHumans makes consent, disclosure and data boundaries visible—and keeps unsafe capabilities out of the product.</p></div><div className="safety-score"><span>CONTROL COVERAGE</span><strong>96<small>/100</small></strong><StatusPill>Healthy foundation</StatusPill></div></section><section className="safety-control-grid">{controls.map(([name,state,copy,Icon])=><article className="panel" key={String(name)}><span className="empty-icon"><Icon size={20}/></span><StatusPill>Enforced</StatusPill><h2>{String(name)}</h2><strong>{String(state)}</strong><p>{String(copy)}</p></article>)}</section><section className="prohibited-panel"><PanelTitle title="Never supported" eyebrow="Product-level prohibitions"/><div className="prohibited-grid">{['Unauthorised face or voice cloning','Public-figure impersonation','Hidden AI or covert recording','Appearance-based employment scoring','Face-based emotion or honesty detection','Medical diagnosis or clinical claims','Stolen source media','Employer access to practice answers'].map(item=><span key={item}><X size={14}/>{item}</span>)}</div></section></div>;
}

function AuditLogs() {
  const events=[['Persona published','Naledi M.','Professional Practice Interviewer v3','persona.publish','Today 19:52'],['Session consent recorded','PlugConnect service','ses_01K19A…','consent.transcript.accept','Today 19:41'],['Knowledge source indexed','System worker','Interview Fundamentals','knowledge.index','Today 19:20'],['Identity approval reviewed','Naledi M.','GoalVow Tutor','identity.approve','Yesterday 16:08'],['API key scope updated','Platform admin','VowLMS sandbox','api_key.scope.update','30 Jul 14:22'],['Deletion request completed','System worker','del_01K02F…','deletion.complete','29 Jul 11:04']];
  return <div className="content-stack"><section className="panel"><div className="audit-toolbar"><div><p className="eyebrow">Append-only event history</p><h2>Organisation audit trail</h2></div><div><button>All actors <ChevronRight size={14}/></button><button>Last 30 days <ChevronRight size={14}/></button></div></div><div className="audit-list">{events.map(event=><div className="audit-event" key={event[0]+event[4]}><span className="audit-icon"><Activity size={17}/></span><div><strong>{event[0]}</strong><p>{event[2]}</p><code>{event[3]}</code></div><span><b>{event[1]}</b><time>{event[4]}</time></span></div>)}</div></section></div>;
}

function SettingsPage() {
  const [saved,setSaved]=useState(false);
  const [retention,setRetention]=useState('30 days');
  return <div className="content-stack"><section className="settings-layout"><nav className="settings-nav"><button className="selected">Organisation</button><button>Data & retention</button><button>Feature flags</button><button>Provider health</button><button>Notifications</button></nav><div className="panel settings-form"><PanelTitle title="Organisation defaults" eyebrow="GoalVow Platform"/><div className="form-grid two"><label>Organisation name<input defaultValue="GoalVow Platform"/></label><label>Primary region<select defaultValue="South Africa"><option>South Africa</option><option>European Union</option></select></label><label>Default language<select defaultValue="English (South Africa)"><option>English (South Africa)</option><option>isiZulu</option></select></label><label>Transcript retention<select value={retention} onChange={e=>setRetention(e.target.value)}><option>Session only</option><option>7 days</option><option>30 days</option><option>90 days</option></select></label></div><div className="settings-switches">{[['Visible AI disclosure','Locked on','Cannot be disabled'],['Transcript capture','Consent required','Per-session decision'],['Recording','Off','Requires separate consent'],['GPU avatar modes','Off','Licence and health gate']].map(([label,state,note])=><div key={label}><span><strong>{label}</strong><small>{note}</small></span><StatusPill tone={state==='Off'?'muted':'good'}>{state}</StatusPill></div>)}</div><button className="primary-button" onClick={()=>setSaved(true)}>{saved?<Check size={17}/>:null}{saved?'Settings saved':'Save organisation settings'}</button></div></section></div>;
}

export function StudioView({ section }: { section: string }) {
  switch(section){
    case 'dashboard': return <Dashboard/>;
    case 'digital-humans': return <DigitalHumans/>;
    case 'personas': return <Personas/>;
    case 'knowledge': return <Knowledge/>;
    case 'voices': return <AssetLibrary type="voices"/>;
    case 'faces': return <AssetLibrary type="faces"/>;
    case 'gesture-profiles': return <AssetLibrary type="gesture-profiles"/>;
    case 'live-sessions': return <LiveSessions/>;
    case 'presenter-studio': return <PresenterStudio/>;
    case 'applications': return <Applications/>;
    case 'usage': return <Usage/>;
    case 'identity-consent': return <IdentityConsent/>;
    case 'api-keys': return <ApiKeys/>;
    case 'webhooks': return <WebhooksPage/>;
    case 'safety': return <Safety/>;
    case 'audit-logs': return <AuditLogs/>;
    case 'settings': return <SettingsPage/>;
    default: return null;
  }
}
