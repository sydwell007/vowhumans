"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusPill } from "./StatusPill";
import { FALLBACK_LANGUAGES, LanguageSelect, LanguageStatusBadge } from "./LanguageSelect";
import {
  Activity,
  AppWindow,
  ArrowLeft,
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
  Copy,
  FileText,
  Fingerprint,
  Gauge,
  KeyRound,
  Languages,
  LockKeyhole,
  MessageSquareText,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCheck,
  WandSparkles,
  Webhook,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { applications, humans, identityAlertCount, identityRecords } from "@/data/platform";
import { useAuth } from "./AuthContext";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";
import type { Room } from "livekit-client";
import {
  ProductionApiKeys,
  ProductionAuditLogs,
  ProductionDashboard,
  ProductionIdentityConsent,
  ProductionSafety,
  ProductionSettings,
  ProductionUsage,
  ProductionWebhooks,
} from "./ProductionControlPlane";

const readiness = [
  { name: "Voice-only", state: "Adapter ready", tone: "good" },
  { name: "Static portrait", state: "Functional", tone: "good" },
  { name: "Pre-rendered avatar", state: "Scaffold", tone: "warn" },
  { name: "Live 2D avatar", state: "GPU required", tone: "muted" },
  { name: "3D avatar", state: "Planned", tone: "muted" },
];


function PanelTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="panel-title">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
      {action}
    </div>
  );
}

function EmptyAction({ icon: Icon, title, copy, button, onAction, doneTitle = "Draft created", doneCopy = "The safe draft is ready for review. No external service was called.", doneButton = "Ready" }: { icon: typeof Cloud; title: string; copy: string; button: string; onAction?: () => void; doneTitle?: string; doneCopy?: string; doneButton?: string }) {
  const [done, setDone] = useState(false);
  function completeAction() {
    setDone(true);
    onAction?.();
  }
  return (
    <div className="empty-action">
      <span className="empty-icon"><Icon size={23} /></span>
      <div><strong>{done ? doneTitle : title}</strong><p>{done ? doneCopy : copy}</p></div>
      <button className="secondary-button" onClick={completeAction}>{done ? <Check size={16} /> : null}{done ? doneButton : button}</button>
    </div>
  );
}

function InlineAction({ className, idleLabel, doneLabel, icon: Icon = Check }: { className?: string; idleLabel: React.ReactNode; doneLabel: string; icon?: typeof Check }) {
  const [done, setDone] = useState(false);
  return <button className={className} onClick={() => setDone(true)}>{done ? <><Icon size={14} />{doneLabel}</> : idleLabel}</button>;
}

function IconMenuButton({ className, label }: { className: string; label: string }) {
  const [acted, setActed] = useState(false);
  return <button className={className} aria-label={acted ? `Actions noted for ${label}` : `More actions for ${label}`} onClick={() => setActed(true)}>{acted ? <Check size={18} /> : <MoreHorizontal size={18} />}</button>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
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
            <Link className="button-ghost" href="/studio/safety">View safety controls <ArrowRight size={16} /></Link>
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
          { label: "Local human catalogue", value: "5", note: "Preview definitions", icon: Bot, tone: "coral" },
          { label: "Persistent sessions", value: "0", note: "Backend not connected", icon: Radio, tone: "cyan" },
          { label: "Consent coverage", value: "—", note: "Not measured", icon: UserCheck, tone: "lime" },
          { label: "Provider cost source", value: "R 0", note: "No live provider data", icon: Activity, tone: "violet" },
        ].map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className={`metric-icon ${metric.tone}`}><metric.icon size={20} /></span>
            <p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="split-grid wide-left">
        <div className="panel">
          <PanelTitle title="Digital humans" eyebrow="Ready to meet" action={<Link className="text-link" href="/studio/digital-humans">View all <ArrowRight size={15} /></Link>} />
          <div className="human-list">
            {humans.map((human) => (
              <Link className="human-row" href="/studio/digital-humans" key={human.id}>
                <span className="human-thumb"><Image src={human.image} alt={`AI-generated portrait of ${human.name}`} fill sizes="52px" /></span>
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
          <PanelTitle title="Sample workflow activity" eyebrow="Illustrative only" />
          <div className="activity-list">
            {[
              ["Persona v3 published", "Professional Practice Interviewer", "Example", "coral"],
              ["Practice session completed", "Candidate-owned · transcript consented", "Example", "cyan"],
              ["Knowledge source indexed", "Interview Fundamentals · sample chunks", "Example", "lime"],
              ["Consent package reviewed", "GoalVow Tutor · sample approval", "Example", "violet"],
            ].map(([title, sub, time, tone]) => <div className="activity-row" key={title}><i className={tone} /><span><strong>{title}</strong><small>{sub}</small></span><time>{time}</time></div>)}
          </div>
        </div>
        <div className="panel consent-panel">
          <PanelTitle title="Governance inbox" eyebrow="2 actions" />
          <div className="governance-card"><span><CircleAlert size={20} /></span><div><strong>{identityAlertCount} {identityAlertCount === 1 ? "identity is" : "identities are"} awaiting owner verification</strong><p>Publishing and new sessions stay blocked until the identity owner and administrator approve.</p><Link href="/studio/identity-consent">Review consent <ArrowRight size={15} /></Link></div></div>
          <div className="governance-card safe"><span><ShieldCheck size={20} /></span><div><strong>Disclosure checks passing</strong><p>All active surfaces show the required AI-generated label.</p></div></div>
        </div>
      </section>
    </div>
  );
}

type DigitalHumanSummary = { id: string; name: string; role: string; disclosure: string; state: string; created_at: string; updated_at: string };
type DigitalHumanProfile = {
  human: DigitalHumanSummary;
  face: { id: string; media_type: string; detector_provider: string | null; preprocessing_state: string; state: string } | null;
  voice: { id: string; name: string; provider: string; provider_voice_id: string | null; language: string; is_custom: boolean } | null;
  gesture_profile: { id: string; name: string; state_config: { features: Record<string, { enabled: boolean; range: string }> } } | null;
  persona: { persona_id: string; persona_name: string; version_id: string; version: number; role: string; state: string } | null;
  knowledge_bases: { id: string; name: string }[];
  languages: { code: string; english_name: string; status: string; voice_id: string | null; voice_name: string | null }[];
};

function DigitalHumans() {
  const [items, setItems] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DigitalHumanProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDisclosure, setEditDisclosure] = useState('');
  const [saving, setSaving] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardHumanId, setWizardHumanId] = useState<string | null>(null);
  const [wizardStartStep, setWizardStartStep] = useState(1);

  const [testMessage, setTestMessage] = useState('Tell me about a time you solved a difficult problem.');
  const [testTurns, setTestTurns] = useState<{ role: 'user' | 'agent'; content: string; citations?: { document_title: string; content: string }[] }[]>([]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [apps, setApps] = useState<RealApplication[]>([]);
  const [appLinks, setAppLinks] = useState<DigitalHumanApplicationLink[]>([]);
  const [appBusyId, setAppBusyId] = useState<string | null>(null);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  async function refresh() {
    const [res, appsRes, linksRes] = await Promise.all([
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
      fetch('/api/v1/applications').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-human-applications').then(r => r.json()).catch(() => null),
    ]);
    if (appsRes?.success) setApps(appsRes.data.items);
    if (linksRes?.success) setAppLinks(linksRes.data.items);
    if (res?.success) {
      setItems(res.data.items);
      setSelectedId((prev) => prev ?? res.data.items[0]?.id ?? null);
    }
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh()/loadDetail() reused by handlers below
  useEffect(() => { refresh(); }, []);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    const res = await fetch(`/api/v1/digital-humans/${id}`).then(r => r.json()).catch(() => null);
    if (res?.success) {
      const loadedDetail = res.data as DigitalHumanProfile;
      setDetail(loadedDetail);
      setEditName(loadedDetail.human.name);
      setEditRole(loadedDetail.human.role);
      setEditDisclosure(loadedDetail.human.disclosure);
    } else {
      setDetail(null);
    }
    setDetailLoading(false);
    setTestTurns([]);
    setTestError(null);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the selected human's profile; re-runs when the list selection changes
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  async function runTest(event: React.FormEvent) {
    event.preventDefault();
    if (!detail?.persona || !testMessage.trim() || testing) return;
    setTesting(true);
    setTestError(null);
    const outgoing = testMessage.trim();
    setTestTurns((prev) => [...prev, { role: 'user', content: outgoing }]);
    setTestMessage('');
    try {
      const res = await fetch(`/api/v1/personas/${detail.persona.persona_id}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: outgoing }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not run this test.');
      setTestTurns((prev) => [...prev, { role: 'agent', content: body.data.reply, citations: body.data.citations }]);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Could not run this test.');
    } finally {
      setTesting(false);
    }
  }

  function openWizard(resumeId: string | null, startStep: number) {
    setWizardHumanId(resumeId);
    setWizardStartStep(startStep);
    setWizardOpen(true);
  }

  // Wires StudioShell's top-bar "+ New digital human" button, which lives outside this
  // component tree — a CustomEvent avoids prop-drilling or a new context just for this.
  useEffect(() => {
    function handleNew() { openWizard(null, 1); }
    window.addEventListener('studio:new-digital-human', handleNew);
    return () => window.removeEventListener('studio:new-digital-human', handleNew);
  }, []);

  function closeWizard(refreshNeeded: boolean) {
    const resumedId = wizardHumanId;
    setWizardOpen(false);
    if (refreshNeeded) {
      refresh();
      if (resumedId) loadDetail(resumedId);
    }
  }

  async function saveIdentity() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/digital-humans/${detail.human.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: editName.trim(), role: editRole.trim(), disclosure: editDisclosure.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not save changes.');
      await loadDetail(detail.human.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteHuman(id: string) {
    setBusy(true);
    await fetch(`/api/v1/digital-humans/${id}`, { method: 'DELETE' }).catch(() => {});
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    await refresh();
    setBusy(false);
  }

  async function toggleApplication(applicationId: string, enabled: boolean) {
    if (!detail) return;
    setAppBusyId(applicationId);
    setError(null);
    try {
      const res = await fetch('/api/v1/digital-human-applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ digital_human_id: detail.human.id, application_id: applicationId, enabled }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not update this application.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this application.');
    } finally {
      setAppBusyId(null);
    }
  }

  function copyEmbedSnippet(app: RealApplication) {
    if (!detail) return;
    const snippet = `<iframe src="${window.location.origin}/embed/${detail.human.id}/${app.slug}" allow="microphone; camera" width="480" height="720" style="border:0;border-radius:16px;"></iframe>`;
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopiedAppId(app.id);
      window.setTimeout(() => setCopiedAppId((current) => (current === app.id ? null : current)), 2500);
    }).catch(() => setError('Could not copy the embed snippet — copy it manually from the page source.'));
  }

  return (
    <div className="content-stack">
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && items.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><Bot size={24} /></span><p className="eyebrow">No digital humans yet</p><h2>Build your first VowHuman</h2><p>Start from one of the demo templates or from scratch — face, voice, knowledge, persona and gestures are assembled step by step, and you can always finish a piece later.</p></section>
      )}
      <section className="split-grid persona-layout">
        <div className="panel persona-list-panel">
          <PanelTitle title="Your digital humans" eyebrow={`${items.length} VowHuman${items.length === 1 ? '' : 's'}`} action={<button className="secondary-button" onClick={() => openWizard(null, 1)}><Bot size={15} />New</button>} />
          <div className="persona-list">
            {items.map((human) => (
              <button key={human.id} className={selectedId === human.id ? 'selected' : ''} onClick={() => { setSelectedId(human.id); setError(null); }}>
                <span className="persona-glyph"><Bot size={19} /></span>
                <span><strong>{human.name}</strong><small>{human.role}</small></span>
                <StatusPill tone={human.state === 'active' ? 'good' : human.state === 'draft' ? 'warn' : 'muted'}>{human.state}</StatusPill>
              </button>
            ))}
          </div>
        </div>
        <div className="panel persona-editor">
          {detailLoading && <p className="panel-note">Loading profile…</p>}
          {!detailLoading && detail && (
            <>
              <div className="editor-top">
                <div><p className="eyebrow">{detail.human.state}</p><h2>{detail.human.name}</h2><p>{detail.human.role}</p></div>
                <div className="editor-actions">
                  <button className="icon-button" aria-label="Delete digital human" onClick={() => deleteHuman(detail.human.id)} disabled={busy}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="form-grid two">
                <label>Name<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
                <label>Role<input value={editRole} onChange={(e) => setEditRole(e.target.value)} /></label>
                <label className="full">Disclosure<textarea value={editDisclosure} onChange={(e) => setEditDisclosure(e.target.value)} /></label>
              </div>
              <div className="editor-actions" style={{ marginTop: 14 }}>
                <button className="primary-button" onClick={saveIdentity} disabled={saving}>{saving ? <RefreshCw size={17} className="spin" /> : <Check size={17} />}{saving ? 'Saving…' : 'Save'}</button>
              </div>
              <section className="profile-slot-grid">
                <ProfileSlot icon={Fingerprint} label="Face" filled={Boolean(detail.face)}
                  content={detail.face && <div className="face-asset-preview"><Image src={`/api/v1/faces/${detail.face.id}/image`} alt="" fill sizes="140px" unoptimized /></div>}
                  meta={detail.face ? (detail.face.detector_provider === 'gpt-image-1' ? 'AI-generated' : 'Uploaded') : undefined}
                  onSetup={() => openWizard(detail.human.id, 2)} />
                <ProfileSlot icon={AudioLines} label="Voice" filled={Boolean(detail.voice)} meta={detail.voice?.name} onSetup={() => openWizard(detail.human.id, 3)} />
                <ProfileSlot icon={BookOpenText} label="Knowledge" filled={detail.knowledge_bases.length > 0} meta={detail.knowledge_bases.map((k) => k.name).join(', ') || undefined} onSetup={() => openWizard(detail.human.id, 4)} />
                <ProfileSlot icon={BrainCircuit} label="Persona" filled={Boolean(detail.persona)} meta={detail.persona ? `${detail.persona.persona_name} · v${detail.persona.version}` : undefined} onSetup={() => openWizard(detail.human.id, 5)} />
                <ProfileSlot icon={Sparkles} label="Gestures" filled={Boolean(detail.gesture_profile)} meta={detail.gesture_profile?.name} onSetup={() => openWizard(detail.human.id, 6)} />
              </section>
              {detail.languages.length > 0 && (
                <div className="wizard-subsection">
                  <PanelTitle title="Languages" eyebrow="Real status — never shown as production without passing the quality gate" />
                  <DigitalHumanLanguageRow humanId={detail.human.id} languages={detail.languages} onChanged={() => loadDetail(detail.human.id)} />
                </div>
              )}
              <div className="wizard-subsection">
                <PanelTitle title="Applications" eyebrow="Where this VowHuman can be embedded" />
                {apps.length === 0 && <p className="panel-note">No applications connected yet — connect one from the Applications page.</p>}
                {apps.length > 0 && (
                  <div className="application-toggle-list">
                    {apps.map((app) => {
                      const link = appLinks.find((l) => l.digital_human_id === detail.human.id && l.application_id === app.id);
                      const enabled = Boolean(link?.enabled);
                      const canEnable = detail.persona?.state === 'published';
                      return (
                        <div className="application-toggle-row" key={app.id}>
                          <span><b>{app.name}</b><small>{app.slug}</small></span>
                          <div className="editor-actions">
                            <button className="secondary-button" onClick={() => toggleApplication(app.id, !enabled)} disabled={appBusyId === app.id || (!enabled && !canEnable)}>
                              {appBusyId === app.id ? <RefreshCw size={14} className="spin" /> : null}
                              <StatusPill tone={enabled ? 'good' : 'muted'}>{enabled ? 'Enabled' : 'Enable'}</StatusPill>
                            </button>
                            {enabled && (
                              <button className="plain-button" type="button" onClick={() => copyEmbedSnippet(app)}>
                                {copiedAppId === app.id ? <Check size={14} /> : <Copy size={14} />}{copiedAppId === app.id ? 'Copied' : 'Copy embed snippet'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!detail.persona && <p className="panel-note">Assign a persona to this VowHuman before enabling it for an application.</p>}
                {detail.persona && detail.persona.state !== 'published' && <p className="panel-note">Publish this VowHuman&rsquo;s persona (from the Personas page) before enabling it for an application.</p>}
              </div>
            </>
          )}
          {!detailLoading && !detail && <p className="panel-note">Select a digital human, or create a new one.</p>}
        </div>
      </section>
      {!detailLoading && detail && detail.persona && (
        <section className="panel test-console">
          <PanelTitle title={`Test ${detail.human.name}`} eyebrow="Live · grounded in this VowHuman's assigned knowledge" action={<StatusPill tone="good">Live</StatusPill>} />
          <div className="console-grid">
            <div className="console-chat">
              <div className="chat-message agent"><span>VH</span><p>Hi, I&rsquo;m {detail.human.name}. Ask me something to see how I respond.</p></div>
              {testTurns.map((turn, index) => (
                <div className={`chat-message ${turn.role === 'user' ? 'user' : 'agent'}`} key={index}>
                  <span>{turn.role === 'user' ? 'YOU' : 'VH'}</span>
                  <div>
                    <p>{turn.content}</p>
                    {turn.citations && turn.citations.length > 0 && (
                      <div className="citation-list">
                        {turn.citations.map((c, i) => <div className="citation-row" key={i}><b>{c.document_title}</b><span>{c.content}</span></div>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form className="console-controls" onSubmit={runTest}>
              {testError && <div className="review-warning"><CircleAlert size={17} />{testError}</div>}
              <label>Test message<textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
              <button className="primary-button" type="submit" disabled={testing}>{testing ? <RefreshCw size={17} className="spin" /> : <MessageSquareText size={17} />}{testing ? 'Thinking…' : 'Run test'}</button>
              <p><ShieldCheck size={14} /> Live response from your organisation&rsquo;s OpenAI account, using this VowHuman&rsquo;s assigned persona and knowledge.</p>
            </form>
          </div>
        </section>
      )}
      {!detailLoading && detail && !detail.persona && (
        <section className="panel ingestion-card"><span className="empty-icon"><MessageSquareText size={24} /></span><p className="eyebrow">No persona assigned yet</p><h2>Assign a persona to test this VowHuman</h2><p>The test console needs a persona to know how to respond — set one up above before testing.</p></section>
      )}
      {wizardOpen && <DigitalHumanWizard humanId={wizardHumanId} startStep={wizardStartStep} onClose={closeWizard} />}
    </div>
  );
}

function ProfileSlot({ icon: Icon, label, filled, meta, content, onSetup }: { icon: typeof Bot; label: string; filled: boolean; meta?: string; content?: React.ReactNode; onSetup: () => void }) {
  return (
    <article className={`profile-slot${filled ? '' : ' empty'}`}>
      {content}
      <span className="empty-icon"><Icon size={20} /></span>
      <strong>{label}</strong>
      {filled ? (
        <>
          <p>{meta ?? 'Assigned'}</p>
          <button className="plain-button" onClick={onSetup}>Change</button>
        </>
      ) : (
        <>
          <p>Not set up yet</p>
          <button className="secondary-button" onClick={onSetup}>Set up {label.toLowerCase()}</button>
        </>
      )}
    </article>
  );
}

function DigitalHumanLanguageRow({ humanId, languages, onChanged }: { humanId: string; languages: DigitalHumanProfile['languages']; onChanged: () => void }) {
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/v1/voices').then((r) => r.json()).then((res) => { if (res?.success) setVoices(res.data.items); }).catch(() => {});
  }, []);

  async function assignVoice(code: string, voiceId: string) {
    setBusyCode(code);
    await fetch('/api/v1/digital-human-languages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, language_code: code, voice_id: voiceId || null }) }).catch(() => {});
    onChanged();
    setBusyCode(null);
  }

  return (
    <div className="language-status-list">
      {languages.map((lang) => (
        <div className="language-status-row" key={lang.code}>
          <span>{lang.english_name}</span>
          <LanguageStatusBadge status={lang.status} />
          <select value={lang.voice_id ?? ''} onChange={(e) => assignVoice(lang.code, e.target.value)} disabled={busyCode === lang.code}>
            <option value="">Use organisation default</option>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

const WIZARD_STEP_LABELS = ['Identity', 'Face', 'Voice', 'Knowledge', 'Persona', 'Gesture'];

function DigitalHumanWizard({ humanId, startStep, onClose }: { humanId: string | null; startStep: number; onClose: (refreshNeeded: boolean) => void }) {
  const [step, setStep] = useState(startStep);
  const [activeHumanId, setActiveHumanId] = useState<string | null>(humanId);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minStep = humanId ? startStep : 1;

  const [templateIndex, setTemplateIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [disclosure, setDisclosure] = useState('AI-generated digital human. Not a real person.');
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const [templateFaceAssignments, setTemplateFaceAssignments] = useState<FaceAssignment[]>([]);
  const [templateVoiceAssignments, setTemplateVoiceAssignments] = useState<VoiceAssignment[]>([]);

  // Looked up once so picking a template can offer to carry over an already-configured
  // Face/Voice from that demo human — identity is arbitrary and worth redoing per VowHuman,
  // but a good face or voice already in place shouldn't force a redo.
  useEffect(() => {
    fetch('/api/v1/face-assignments').then((r) => r.json()).then((res) => { if (res?.success) setTemplateFaceAssignments(res.data.items); }).catch(() => {});
    fetch('/api/v1/voice-assignments').then((r) => r.json()).then((res) => { if (res?.success) setTemplateVoiceAssignments(res.data.items); }).catch(() => {});
  }, []);

  function pickTemplate(index: number | null) {
    setTemplateIndex(index);
    if (index === null) { setName(''); setRole(''); return; }
    const template = humans[index];
    setName(template.name);
    setRole(template.role);
    setDisclosure(template.disclosure);
  }

  async function submitIdentity(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !role.trim()) { setError('Give this VowHuman a name and a role.'); return; }
    setCreatingIdentity(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/digital-humans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), role: role.trim(), disclosure: disclosure.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this digital human.');
      const newHumanId = body.data.id as string;
      setActiveHumanId(newHumanId);
      setChanged(true);

      const template = templateIndex !== null ? humans[templateIndex] : null;
      const inheritedFace = template ? templateFaceAssignments.find((a) => a.human_slug === template.id) : undefined;
      const inheritedVoice = template ? templateVoiceAssignments.find((a) => a.human_slug === template.id) : undefined;
      if (inheritedFace) await fetch('/api/v1/face-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: newHumanId, face_asset_id: inheritedFace.face_asset_id }) }).catch(() => {});
      if (inheritedVoice) await fetch('/api/v1/voice-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: newHumanId, voice_id: inheritedVoice.voice_id }) }).catch(() => {});
      setStep(!inheritedFace ? 2 : !inheritedVoice ? 3 : 4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this digital human.');
    } finally {
      setCreatingIdentity(false);
    }
  }

  async function finish() {
    if (activeHumanId) await fetch(`/api/v1/digital-humans/${activeHumanId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'active' }) }).catch(() => {});
    onClose(true);
  }

  function advance() { setChanged(true); if (step >= 6) finish(); else setStep(step + 1); }
  function skip() { if (step >= 6) finish(); else setStep(step + 1); }

  return (
    <div className="drawer-scrim">
      <aside className="wizard-panel">
        <button className="icon-button drawer-close" aria-label="Close" onClick={() => onClose(changed)}><X size={19} /></button>
        <p className="eyebrow">Build a VowHuman</p>
        <div className="wizard-steps">
          {WIZARD_STEP_LABELS.map((label, index) => {
            const n = index + 1;
            return <div key={label} className={n < step ? 'done' : n === step ? 'active' : ''}><span>{n < step ? <Check size={12} /> : n}</span><small>{label}</small></div>;
          })}
        </div>
        {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
        <div className="wizard-body">
          {step === 1 && (
            <form onSubmit={submitIdentity}>
              <p className="panel-note">Start from a demo template, or build from scratch.</p>
              <div className="interviewer-picker">
                <button type="button" className={templateIndex === null ? 'selected' : ''} onClick={() => pickTemplate(null)}>
                  <span className="template-blank"><WandSparkles size={22} /></span><strong>Start blank</strong>
                </button>
                {humans.map((human, index) => {
                  const hasFace = templateFaceAssignments.some((a) => a.human_slug === human.id);
                  const hasVoice = templateVoiceAssignments.some((a) => a.human_slug === human.id);
                  return (
                    <button type="button" key={human.id} className={templateIndex === index ? 'selected' : ''} onClick={() => pickTemplate(index)}>
                      <span><Image src={human.image} alt="" fill sizes="140px" /></span>
                      <strong>{human.name}</strong><small>{human.role}</small>
                      {(hasFace || hasVoice) && <small>{[hasFace && 'Face', hasVoice && 'Voice'].filter(Boolean).join(' + ')} ready to reuse</small>}
                    </button>
                  );
                })}
              </div>
              <div className="form-grid two">
                <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Naledi Support" /></label>
                <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Onboarding Guide" /></label>
                <label className="full">Disclosure<textarea value={disclosure} onChange={(e) => setDisclosure(e.target.value)} /></label>
              </div>
              <button className="primary-button" type="submit" disabled={creatingIdentity}>{creatingIdentity ? <RefreshCw size={17} className="spin" /> : <ArrowRight size={17} />}{creatingIdentity ? 'Creating…' : 'Continue'}</button>
            </form>
          )}
          {step === 2 && activeHumanId && <WizardFaceStep humanId={activeHumanId} onDone={advance} />}
          {step === 3 && activeHumanId && <WizardVoiceStep humanId={activeHumanId} onDone={advance} />}
          {step === 4 && activeHumanId && <WizardKnowledgeStep humanId={activeHumanId} onDone={advance} />}
          {step === 5 && activeHumanId && <WizardPersonaStep humanId={activeHumanId} role={role} onDone={advance} />}
          {step === 6 && activeHumanId && <WizardGestureStep humanId={activeHumanId} onDone={advance} />}
        </div>
        {step > 1 && (
          <div className="wizard-footer editor-actions">
            {step > minStep && <button className="secondary-button" type="button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Back</button>}
            <button className="plain-button" type="button" onClick={skip}><SkipForward size={16} />{step >= 6 ? 'Skip & finish' : 'Skip for now'}</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function WizardFaceStep({ humanId, onDone }: { humanId: string; onDone: () => void }) {
  const [faces, setFaces] = useState<FaceAsset[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch('/api/v1/faces').then((r) => r.json()).then((res) => { if (res?.success) setFaces(res.data.items); }).catch(() => {}); }, []);

  async function assignExisting() {
    if (!selectedFaceId) { setError('Choose a face.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/face-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, face_asset_id: selectedFaceId }) });
      if (!res.ok) throw new Error('Could not assign this face.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this face.');
    } finally {
      setBusy(false);
    }
  }

  async function generateAndAssign(event: React.FormEvent) {
    event.preventDefault();
    if (prompt.trim().length < 10) { setError('Describe the face you want generated (at least 10 characters).'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/faces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not generate this face.');
      await fetch('/api/v1/face-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, face_asset_id: body.data.id }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this face.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Face</h3>
      <p className="panel-note">Choose an existing face asset, or generate a new one.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {faces.length > 0 && (
        <div className="form-grid two">
          <label className="full">Existing face assets
            <select value={selectedFaceId} onChange={(e) => setSelectedFaceId(e.target.value)}>
              <option value="">Choose one</option>
              {faces.map((f) => <option key={f.id} value={f.id}>{f.media_type} · {f.detector_provider === 'gpt-image-1' ? 'AI-generated' : 'Uploaded'}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={assignExisting} disabled={busy || !selectedFaceId}>Use this face</button>
        </div>
      )}
      <form className="form-grid two" onSubmit={generateAndAssign}>
        <label className="full">Or generate a new face with AI<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Warm, professional South African woman in her 30s" /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />}{busy ? 'Working…' : 'Generate & use'}</button>
      </form>
    </div>
  );
}

function WizardVoiceStep({ humanId, onDone }: { humanId: string; onDone: () => void }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [providerVoices, setProviderVoices] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [providerVoice, setProviderVoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/v1/voices').then((r) => r.json()).then((res) => {
      if (res?.success) {
        setVoices(res.data.items);
        setProviderVoices(res.data.available_provider_voices ?? []);
        if (res.data.available_provider_voices?.[0]) setProviderVoice(res.data.available_provider_voices[0]);
      }
    }).catch(() => {});
  }, []);

  async function playSample(voice: Voice) {
    setError(null);
    audioRef.current?.pause();
    setPlayingId(voice.id);
    try {
      const res = await fetch(`/api/v1/voices/${voice.id}/sample`);
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem.message || 'Could not play this sample.');
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPlayingId((current) => (current === voice.id ? null : current));
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not play this sample.');
      setPlayingId(null);
    }
  }

  async function assignExisting(voiceId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/voice-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, voice_id: voiceId }) });
      if (!res.ok) throw new Error('Could not assign this voice.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this voice.');
    } finally {
      setBusy(false);
    }
  }

  async function createAndAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give the voice a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/voices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), language: 'en-ZA', provider_voice_id: providerVoice }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this voice.');
      await fetch('/api/v1/voice-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, voice_id: body.data.id }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this voice.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Voice</h3>
      <p className="panel-note">Preview and choose an existing voice, or pick a provider voice to create a new one.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {voices.length > 0 && (
        <div className="voice-pick-list">
          {voices.map((v) => (
            <div className="voice-pick-row" key={v.id}>
              <span className="source-cell"><i><AudioLines size={14} /></i><b>{v.name}<small>{v.is_custom ? 'Uploaded' : 'Provider voice'}</small></b></span>
              <button type="button" className="icon-button" aria-label={`Play sample of ${v.name}`} onClick={() => playSample(v)} disabled={playingId === v.id}>
                {playingId === v.id ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
              </button>
              <button type="button" className="secondary-button" onClick={() => assignExisting(v.id)} disabled={busy}>Use</button>
            </div>
          ))}
        </div>
      )}
      <form className="form-grid two" onSubmit={createAndAssign} style={{ marginTop: 14 }}>
        <label>Or create a new voice<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warm and professional" /></label>
        <label>Provider voice<select value={providerVoice} onChange={(e) => setProviderVoice(e.target.value)}>{providerVoices.map((pv) => <option key={pv}>{pv}</option>)}</select></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <RefreshCw size={17} className="spin" /> : <Check size={17} />}{busy ? 'Working…' : 'Create & use'}</button>
      </form>
    </div>
  );
}

function WizardKnowledgeStep({ humanId, onDone }: { humanId: string; onDone: () => void }) {
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBaseName, setNewBaseName] = useState('');
  const [newBaseDescription, setNewBaseDescription] = useState('');
  const [creatingBase, setCreatingBase] = useState(false);

  const [addTargetBase, setAddTargetBase] = useState('');
  const [addSourceMode, setAddSourceMode] = useState<'upload' | 'website' | 'generate'>('upload');
  const [addTitle, setAddTitle] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [addTopic, setAddTopic] = useState('');
  const [addLanguage, setAddLanguage] = useState('');
  const [adding, setAdding] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  async function refreshBases() {
    const res = await fetch('/api/v1/knowledge-bases').then((r) => r.json()).catch(() => null);
    if (res?.success) {
      setBases(res.data.items);
      setAddTargetBase((prev) => prev || res.data.items[0]?.id || '');
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch when this step mounts; refreshBases() is also reused by user-triggered handlers below
  useEffect(() => { refreshBases(); }, []);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function assignSelected() {
    if (selectedIds.length === 0) { setError('Select at least one library above (click it to toggle it on) before continuing.'); return; }
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.all(selectedIds.map((id) => fetch('/api/v1/knowledge-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, knowledge_base_id: id, assigned: true }) })));
      if (results.some((r) => !r.ok)) throw new Error('Could not assign one or more libraries.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign these knowledge bases.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateBase(event: React.FormEvent) {
    event.preventDefault();
    if (!newBaseName.trim()) { setError('Give the library a name.'); return; }
    setCreatingBase(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: newBaseName.trim(), description: newBaseDescription.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this library.');
      setNewBaseName(''); setNewBaseDescription('');
      setAddTargetBase(body.data.id);
      setSelectedIds((prev) => (prev.includes(body.data.id) ? prev : [...prev, body.data.id]));
      await refreshBases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this library.');
    } finally {
      setCreatingBase(false);
    }
  }

  async function generatePreview() {
    if (addTopic.trim().length < 5) { setError('Describe the topic, skill or expertise to generate (at least 5 characters).'); return; }
    setGeneratingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/knowledge-documents/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: addTopic.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not generate this article.');
      setPreviewContent(body.data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this article.');
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function submitAddSource(event: React.FormEvent) {
    event.preventDefault();
    if (!addTargetBase) { setError('Choose or create a library first.'); return; }
    setAdding(true);
    setError(null);
    try {
      let res: Response;
      if (addSourceMode === 'upload') {
        if (!addFile) { setError('Choose a file to upload.'); setAdding(false); return; }
        const form = new FormData();
        form.set('knowledge_base_id', addTargetBase);
        form.set('title', addTitle);
        form.set('language', addLanguage);
        form.set('file', addFile);
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', body: form });
      } else if (addSourceMode === 'website') {
        if (!addUrl.trim()) { setError('Enter a URL.'); setAdding(false); return; }
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: addTargetBase, source_type: 'website', url: addUrl.trim(), title: addTitle.trim() }) });
      } else {
        if (!previewContent) { setError('Generate a preview first.'); setAdding(false); return; }
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: addTargetBase, source_type: 'generated', topic: addTopic.trim(), title: addTitle.trim(), content: previewContent }) });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not add this source.');
      setAddFile(null); setAddUrl(''); setAddTopic(''); setAddTitle(''); setPreviewContent(null);
      setSelectedIds((prev) => (prev.includes(addTargetBase) ? prev : [...prev, addTargetBase]));
      await refreshBases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this source.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <h3>Knowledge</h3>
      <p className="panel-note">Attach one or more knowledge libraries — a VowHuman can combine several.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {bases.length > 0 && (
        <>
          <div className="chip-toggle-row">
            {bases.map((b) => <button type="button" key={b.id} className={`chip-toggle${selectedIds.includes(b.id) ? ' active' : ''}`} onClick={() => toggle(b.id)}>{selectedIds.includes(b.id) ? <Check size={11} /> : null}{b.name}</button>)}
          </div>
          <button className="primary-button" type="button" onClick={assignSelected} disabled={busy} style={{ marginTop: 10 }}>
            {busy ? <RefreshCw size={17} className="spin" /> : <Check size={17} />}{busy ? 'Working…' : `Use selected librar${selectedIds.length === 1 ? 'y' : 'ies'}`}
          </button>
        </>
      )}

      <div className="wizard-subsection">
        <p className="eyebrow">Create a new library</p>
        <form className="form-grid two" onSubmit={submitCreateBase}>
          <label className="full">Library name<input value={newBaseName} onChange={(e) => setNewBaseName(e.target.value)} placeholder="e.g. Interview Preparation" /></label>
          <label className="full">Description (optional)<input value={newBaseDescription} onChange={(e) => setNewBaseDescription(e.target.value)} placeholder="What this library is for" /></label>
          <button className="secondary-button" type="submit" disabled={creatingBase}>{creatingBase ? <RefreshCw size={17} className="spin" /> : <BookOpenText size={17} />}{creatingBase ? 'Creating…' : 'Create library'}</button>
        </form>
      </div>

      {bases.length > 0 && (
        <div className="wizard-subsection">
          <p className="eyebrow">Add approved knowledge</p>
          <form className="form-grid two" onSubmit={submitAddSource}>
            <label>Library
              <select value={addTargetBase} onChange={(e) => setAddTargetBase(e.target.value)}>
                <option value="" disabled>Choose a library</option>
                {bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
              </select>
            </label>
            <label>Source
              <select value={addSourceMode} onChange={(e) => { setAddSourceMode(e.target.value as 'upload' | 'website' | 'generate'); setPreviewContent(null); }}>
                <option value="upload">Upload a document</option>
                <option value="website">Import a website</option>
                <option value="generate">Generate with AI</option>
              </select>
            </label>
            {addSourceMode !== 'generate' && <label className="full">Title (optional)<input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Defaults to the file name or URL" /></label>}
            {addSourceMode === 'upload' && <label className="full">File — PDF, DOCX, Excel, Markdown or text (max 4MB)<input type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.markdown,.txt" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} /></label>}
            {addSourceMode === 'website' && <label className="full">Approved website URL<input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="https://example.com/guide" /></label>}
            {addSourceMode === 'generate' && (
              <label className="full">Topic, skill, knowledge base or expertise to generate
                <textarea value={addTopic} onChange={(e) => { setAddTopic(e.target.value); setPreviewContent(null); }} placeholder="e.g. South African labour law basics for a first-time job seeker" />
              </label>
            )}
            {addSourceMode === 'generate' && previewContent && (
              <div className="full generated-preview">
                <p className="eyebrow">Generated preview — review before adding</p>
                <div className="preview-scroll">{previewContent}</div>
              </div>
            )}
            {addSourceMode !== 'generate' && <label>Language (optional)<LanguageSelect value={addLanguage} onChange={setAddLanguage} includeNone="Not set" /></label>}
            {addSourceMode === 'generate' && !previewContent && (
              <button className="secondary-button" type="button" onClick={generatePreview} disabled={generatingPreview}>
                {generatingPreview ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />}{generatingPreview ? 'Generating…' : 'Generate preview'}
              </button>
            )}
            {addSourceMode === 'generate' && previewContent && (
              <div className="full editor-actions">
                <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add to library'}</button>
                <button className="secondary-button" type="button" onClick={generatePreview} disabled={generatingPreview}>{generatingPreview ? <RefreshCw size={17} className="spin" /> : <RefreshCw size={17} />}Regenerate</button>
              </div>
            )}
            {addSourceMode !== 'generate' && <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add source'}</button>}
          </form>
        </div>
      )}
    </div>
  );
}

function WizardPersonaStep({ humanId, role, onDone }: { humanId: string; role: string; onDone: () => void }) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [name, setName] = useState('');
  const [genRole, setGenRole] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch('/api/v1/personas').then((r) => r.json()).then((res) => { if (res?.success) setPersonas(res.data.items); }).catch(() => {}); }, []);

  async function assignExisting() {
    if (!selectedVersionId) { setError('Choose a persona.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/persona-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, persona_version_id: selectedVersionId }) });
      if (!res.ok) throw new Error('Could not assign this persona.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this persona.');
    } finally {
      setBusy(false);
    }
  }

  async function generateAndAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give the persona a name.'); return; }
    if (genRole.trim().length < 5) { setError("Describe the VowHuman's role (at least 5 characters)."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/personas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'generate', name: name.trim(), role: genRole.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not generate this persona.');
      await fetch('/api/v1/persona-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, persona_version_id: body.data.version.id }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this persona.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Persona</h3>
      <p className="panel-note">Choose an existing persona, or generate one with AI from the role you gave this VowHuman.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {personas.length > 0 && (
        <div className="form-grid two">
          <label className="full">Existing personas
            <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)}>
              <option value="">Choose one</option>
              {personas.filter((p) => p.version_id).map((p) => <option key={p.id} value={p.version_id ?? ''}>{p.name}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={assignExisting} disabled={busy || !selectedVersionId}>Use this persona</button>
        </div>
      )}
      <form className="form-grid two" onSubmit={generateAndAssign}>
        <label>New persona name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interview Coach" /></label>
        <label>Role<input value={genRole} onChange={(e) => setGenRole(e.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />}{busy ? 'Generating…' : 'Generate & use'}</button>
      </form>
    </div>
  );
}

function WizardGestureStep({ humanId, onDone }: { humanId: string; onDone: () => void }) {
  const [profiles, setProfiles] = useState<GestureProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch('/api/v1/gesture-profiles').then((r) => r.json()).then((res) => { if (res?.success) setProfiles(res.data.items); }).catch(() => {}); }, []);

  async function assignExisting() {
    if (!selectedId) { setError('Choose a gesture profile.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/gesture-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, gesture_profile_id: selectedId }) });
      if (!res.ok) throw new Error('Could not assign this profile.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this profile.');
    } finally {
      setBusy(false);
    }
  }

  async function createAndAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give the gesture profile a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/gesture-profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this profile.');
      await fetch('/api/v1/gesture-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanId, gesture_profile_id: body.data.id }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Gesture profile</h3>
      <p className="panel-note">Choose an existing profile, or create one with the default natural-movement set.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {profiles.length > 0 && (
        <div className="form-grid two">
          <label className="full">Existing profiles
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Choose one</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={assignExisting} disabled={busy || !selectedId}>Use this profile</button>
        </div>
      )}
      <form className="form-grid two" onSubmit={createAndAssign}>
        <label className="full">Or create a new profile<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Calm and attentive" /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <RefreshCw size={17} className="spin" /> : <Sparkles size={17} />}{busy ? 'Working…' : 'Create & use'}</button>
      </form>
    </div>
  );
}

type PersonaSummary = {
  id: string; name: string; description: string; created_at: string;
  version_id: string | null; version: number | null; state: string | null; role: string | null;
  conversation_style: string | null; opening_message: string | null; language: string | null;
  speaking_rate: string | null; max_response_words: number | null;
  knowledge_base_ids: string[] | null; published_at: string | null;
};
type PersonaVersionDetail = {
  id: string; persona_id: string; version: number; state: string; role: string; system_instructions: string;
  conversation_style: string; opening_message: string; language: string; speaking_rate: string;
  max_response_words: number; knowledge_base_ids: string[]; published_at: string | null; created_at: string;
  supported_languages: string[]; code_switching_policy: string; translation_policy: string;
};
type Guardrail = { id: string; code: string; instruction: string; enforcement: string };
type PersonaLanguageMessage = { id: string; persona_version_id: string; language_code: string; opening_message: string; fallback_message: string; source: string };
type PersonaDetail = { persona: { id: string; name: string; description: string; created_at: string }; versions: PersonaVersionDetail[]; guardrails: Guardrail[]; language_messages: PersonaLanguageMessage[] };
type PersonaAssignment = { human_slug: string; persona_version_id: string; persona_id: string; version: number; persona_name: string };
type KnowledgeBaseSummary = { id: string; name: string; description: string; state: string; created_at: string; document_count: number; chunk_count: number; language_count: number };

function Personas() {
  const [items, setItems] = useState<PersonaSummary[]>([]);
  const [assignments, setAssignments] = useState<PersonaAssignment[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [realHumans, setRealHumans] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [editRole, setEditRole] = useState('');
  const [editSystemInstructions, setEditSystemInstructions] = useState('');
  const [editConversationStyle, setEditConversationStyle] = useState('');
  const [editOpeningMessage, setEditOpeningMessage] = useState('');
  const [editLanguage, setEditLanguage] = useState('');
  const [editSpeakingRate, setEditSpeakingRate] = useState('1');
  const [editMaxResponseWords, setEditMaxResponseWords] = useState('150');
  const [editKnowledgeBaseIds, setEditKnowledgeBaseIds] = useState<string[]>([]);
  const [editSupportedLanguages, setEditSupportedLanguages] = useState<string[]>([]);
  const [editCodeSwitchingPolicy, setEditCodeSwitchingPolicy] = useState('discouraged');
  const [editTranslationPolicy, setEditTranslationPolicy] = useState('fallback_only');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const [createMode, setCreateMode] = useState<'blank' | 'generate' | 'duplicate'>('generate');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState('');
  const [createSourceId, setCreateSourceId] = useState('');
  const [creating, setCreating] = useState(false);

  const [newGuardrailCode, setNewGuardrailCode] = useState('');
  const [newGuardrailInstruction, setNewGuardrailInstruction] = useState('');
  const [addingGuardrail, setAddingGuardrail] = useState(false);

  const [testMessage, setTestMessage] = useState("Tell me about a time you solved a difficult problem.");
  const [testTurns, setTestTurns] = useState<{ role: 'user' | 'agent'; content: string; citations?: { document_title: string; content: string }[] }[]>([]);
  const [testing, setTesting] = useState(false);

  async function refreshList() {
    const [personasRes, assignmentsRes, basesRes, humansRes] = await Promise.all([
      fetch('/api/v1/personas').then(r => r.json()).catch(() => null),
      fetch('/api/v1/persona-assignments').then(r => r.json()).catch(() => null),
      fetch('/api/v1/knowledge-bases').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (personasRes?.success) {
      setItems(personasRes.data.items);
      setSelectedId((prev) => prev ?? personasRes.data.items[0]?.id ?? null);
    }
    if (assignmentsRes?.success) setAssignments(assignmentsRes.data.items);
    if (basesRes?.success) setKnowledgeBases(basesRes.data.items);
    if (humansRes?.success) setRealHumans(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refreshList()/loadDetail() are also reused by user-triggered handlers below
  useEffect(() => { refreshList(); }, []);

  async function loadDetail(personaId: string) {
    setDetailLoading(true);
    const res = await fetch(`/api/v1/personas/${personaId}`).then(r => r.json()).catch(() => null);
    if (res?.success) {
      const loadedDetail = res.data as PersonaDetail;
      setDetail(loadedDetail);
      const latest = loadedDetail.versions[0];
      if (latest) {
        setEditRole(latest.role);
        setEditSystemInstructions(latest.system_instructions);
        setEditConversationStyle(latest.conversation_style);
        setEditOpeningMessage(latest.opening_message);
        setEditLanguage(latest.language);
        setEditSpeakingRate(String(latest.speaking_rate));
        setEditMaxResponseWords(String(latest.max_response_words));
        setEditKnowledgeBaseIds(latest.knowledge_base_ids ?? []);
        setEditSupportedLanguages(latest.supported_languages ?? []);
        setEditCodeSwitchingPolicy(latest.code_switching_policy ?? 'discouraged');
        setEditTranslationPolicy(latest.translation_policy ?? 'fallback_only');
      }
    } else {
      setDetail(null);
    }
    setTestTurns([]);
    setDetailLoading(false);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the selected persona's editable detail; re-runs whenever the library selection changes
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  const latestVersion = detail?.versions[0] ?? null;
  const isDraft = latestVersion?.state === 'draft';

  async function saveDraft() {
    if (!detail || !latestVersion) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        role: editRole, system_instructions: editSystemInstructions, conversation_style: editConversationStyle,
        opening_message: editOpeningMessage, language: editLanguage, speaking_rate: Number(editSpeakingRate) || 1,
        max_response_words: Number(editMaxResponseWords) || 150, knowledge_base_ids: editKnowledgeBaseIds,
        supported_languages: editSupportedLanguages, code_switching_policy: editCodeSwitchingPolicy, translation_policy: editTranslationPolicy,
      };
      const res = isDraft
        ? await fetch(`/api/v1/persona-versions/${latestVersion.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/v1/persona-versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona_id: detail.persona.id, ...payload }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not save this persona.');
      await loadDetail(detail.persona.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this persona.');
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!latestVersion || latestVersion.state !== 'draft') return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/persona-versions/${latestVersion.id}/publish`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not publish this version.');
      if (detail) await loadDetail(detail.persona.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this version.');
    } finally {
      setPublishing(false);
    }
  }

  async function duplicateAsDraft() {
    if (!detail) return;
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/persona-versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona_id: detail.persona.id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not duplicate this version.');
      await loadDetail(detail.persona.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate this version.');
    } finally {
      setDuplicating(false);
    }
  }

  async function deletePersona(id: string) {
    setBusy(id);
    await fetch(`/api/v1/personas/${id}`, { method: 'DELETE' }).catch(() => {});
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    await refreshList();
    setBusy(null);
  }

  async function assignPersona(humanSlug: string, personaVersionId: string) {
    setBusy(`assign:${humanSlug}`);
    await fetch('/api/v1/persona-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanSlug, persona_version_id: personaVersionId || null }) }).catch(() => {});
    await refreshList();
    setBusy(null);
  }

  async function toggleGuardrail(guardrailId: string, currentlyOn: boolean) {
    setBusy(`guardrail:${guardrailId}`);
    await fetch(`/api/v1/guardrails/${guardrailId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enforcement: currentlyOn ? 'off' : 'prompt' }) }).catch(() => {});
    if (detail) await loadDetail(detail.persona.id);
    setBusy(null);
  }

  async function submitGuardrail(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !newGuardrailCode.trim() || !newGuardrailInstruction.trim()) return;
    setAddingGuardrail(true);
    try {
      await fetch('/api/v1/guardrails', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona_id: detail.persona.id, code: newGuardrailCode.trim(), instruction: newGuardrailInstruction.trim() }) });
      setNewGuardrailCode(''); setNewGuardrailInstruction('');
      await loadDetail(detail.persona.id);
    } catch {
      setError('Could not add this guardrail.');
    } finally {
      setAddingGuardrail(false);
    }
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!createName.trim()) { setError('Give the persona a name.'); return; }
    if (createMode === 'generate' && createRole.trim().length < 5) { setError("Describe the VowHuman's role (at least 5 characters)."); return; }
    if (createMode === 'duplicate' && !createSourceId) { setError('Choose a persona to duplicate.'); return; }
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { mode: createMode, name: createName.trim() };
      if (createMode === 'generate') payload.role = createRole.trim();
      else if (createMode === 'blank' && createRole.trim()) payload.role = createRole.trim();
      else if (createMode === 'duplicate') payload.source_persona_id = createSourceId;
      const res = await fetch('/api/v1/personas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this persona.');
      setCreateName(''); setCreateRole('');
      await refreshList();
      setSelectedId(body.data.persona.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this persona.');
    } finally {
      setCreating(false);
    }
  }

  async function runTest(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !testMessage.trim() || testing) return;
    setTesting(true);
    setError(null);
    const outgoing = testMessage.trim();
    setTestTurns((prev) => [...prev, { role: 'user', content: outgoing }]);
    setTestMessage('');
    try {
      const res = await fetch(`/api/v1/personas/${detail.persona.id}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: outgoing }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not run this test.');
      setTestTurns((prev) => [...prev, { role: 'agent', content: body.data.reply, citations: body.data.citations }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run this test.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="content-stack">
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && items.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><BrainCircuit size={24} /></span><p className="eyebrow">No personas yet</p><h2>Create your first persona</h2><p>Describe a VowHuman&rsquo;s role and let AI draft its conversational behaviour, or start from a blank template using the form below.</p></section>
      )}
      <section className="split-grid persona-layout">
        <div className="panel persona-list-panel">
          <PanelTitle title="Persona library" eyebrow={`${items.length} configuration${items.length === 1 ? '' : 's'}`} />
          <div className="persona-list">
            {items.map((persona) => (
              <button key={persona.id} className={selectedId === persona.id ? 'selected' : ''} onClick={() => { setSelectedId(persona.id); setError(null); }}>
                <span className="persona-glyph"><BrainCircuit size={19} /></span>
                <span><strong>{persona.name}</strong><small>{persona.role ?? 'No draft yet'}</small></span>
                <StatusPill tone={persona.state === 'draft' ? 'warn' : persona.state === 'published' ? 'good' : 'muted'}>{persona.state ?? 'empty'}</StatusPill>
              </button>
            ))}
          </div>
        </div>
        <div className="panel persona-editor">
          {detailLoading && <p className="panel-note">Loading persona…</p>}
          {!detailLoading && detail && latestVersion && (
            <>
              <div className="editor-top">
                <div><p className="eyebrow">v{latestVersion.version} · {latestVersion.state}</p><h2>{detail.persona.name}</h2><p>{latestVersion.role}</p></div>
                <div className="editor-actions">
                  <button className="secondary-button" onClick={duplicateAsDraft} disabled={duplicating}>{duplicating ? <RefreshCw size={14} className="spin" /> : null}Duplicate as draft</button>
                  <button className="icon-button" aria-label="Delete persona" onClick={() => deletePersona(detail.persona.id)} disabled={busy === detail.persona.id}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="form-grid two">
                <label>Role<input value={editRole} onChange={(e) => setEditRole(e.target.value)} /></label>
                <label>Language
                  <LanguageSelect value={editLanguage} onChange={setEditLanguage} capability="reasoning" showStatusBadge />
                </label>
                <label className="full">System instructions<textarea value={editSystemInstructions} onChange={(e) => setEditSystemInstructions(e.target.value)} /></label>
                <label className="full">Opening message<textarea value={editOpeningMessage} onChange={(e) => setEditOpeningMessage(e.target.value)} /></label>
                <label>Conversation style<input value={editConversationStyle} onChange={(e) => setEditConversationStyle(e.target.value)} /></label>
                <label>Maximum response length (words)<input type="number" min={20} max={400} value={editMaxResponseWords} onChange={(e) => setEditMaxResponseWords(e.target.value)} /></label>
                <label>Speaking rate<input type="number" min={0.7} max={1.3} step={0.01} value={editSpeakingRate} onChange={(e) => setEditSpeakingRate(e.target.value)} /></label>
                <label>Assign to VowHuman
                  <select
                    value={assignments.find((a) => a.persona_version_id === latestVersion.id)?.human_slug ?? ''}
                    onChange={(e) => {
                      const slug = e.target.value;
                      const currentSlug = assignments.find((a) => a.persona_version_id === latestVersion.id)?.human_slug;
                      if (slug) assignPersona(slug, latestVersion.id);
                      else if (currentSlug) assignPersona(currentSlug, '');
                    }}
                  >
                    <option value="">Not assigned</option>
                    {realHumans.map((human) => <option key={human.id} value={human.id}>{human.name}</option>)}
                  </select>
                </label>
                <label className="full">Knowledge bases
                  <div className="chip-toggle-row">
                    {knowledgeBases.length === 0 && <small>No knowledge libraries yet — add one on the Knowledge page.</small>}
                    {knowledgeBases.map((base) => {
                      const active = editKnowledgeBaseIds.includes(base.id);
                      return (
                        <button type="button" key={base.id} className={`chip-toggle${active ? ' active' : ''}`} onClick={() => setEditKnowledgeBaseIds((prev) => active ? prev.filter((id) => id !== base.id) : [...prev, base.id])}>
                          {active ? <Check size={11} /> : null}{base.name}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <label>Code-switching policy
                  <select value={editCodeSwitchingPolicy} onChange={(e) => setEditCodeSwitchingPolicy(e.target.value)}>
                    <option value="discouraged">Discouraged</option>
                    <option value="allowed">Allowed</option>
                    <option value="encouraged">Encouraged</option>
                  </select>
                </label>
                <label>Translation policy
                  <select value={editTranslationPolicy} onChange={(e) => setEditTranslationPolicy(e.target.value)}>
                    <option value="never">Never translate</option>
                    <option value="fallback_only">Fallback only, when direct quality is insufficient</option>
                    <option value="always_offer">Always offer translation</option>
                  </select>
                </label>
                <label className="full">Supported languages
                  <div className="chip-toggle-row">
                    {FALLBACK_LANGUAGES.map((lang) => {
                      const active = editSupportedLanguages.includes(lang.code);
                      return (
                        <button type="button" key={lang.code} className={`chip-toggle${active ? ' active' : ''}`} onClick={() => setEditSupportedLanguages((prev) => active ? prev.filter((c) => c !== lang.code) : [...prev, lang.code])}>
                          {active ? <Check size={11} /> : null}{lang.english_name}
                        </button>
                      );
                    })}
                  </div>
                </label>
                {editSupportedLanguages.length > 0 && (
                  <label className="full">Per-language opening &amp; fallback messages
                    <PersonaLanguageMessages personaVersionId={latestVersion.id} languageCodes={editSupportedLanguages} messages={detail.language_messages} onSaved={() => loadDetail(detail.persona.id)} />
                  </label>
                )}
                <label className="full">Guardrails
                  <div className="chip-toggle-row">
                    {detail.guardrails.map((g) => {
                      const on = g.enforcement !== 'off';
                      return (
                        <button type="button" key={g.id} className={`chip-toggle${on ? ' active' : ''}`} onClick={() => toggleGuardrail(g.id, on)} disabled={busy === `guardrail:${g.id}`} title={g.instruction}>
                          <ShieldCheck size={11} />{g.code.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                </label>
              </div>
              <form className="form-grid two" onSubmit={submitGuardrail}>
                <label>New guardrail code<input value={newGuardrailCode} onChange={(e) => setNewGuardrailCode(e.target.value)} placeholder="e.g. no_medical_advice" /></label>
                <label>Instruction<input value={newGuardrailInstruction} onChange={(e) => setNewGuardrailInstruction(e.target.value)} placeholder="What must never happen" /></label>
                <button className="secondary-button" type="submit" disabled={addingGuardrail}>Add guardrail</button>
              </form>
              {isDraft ? (
                <div className="immutable-note"><LockKeyhole size={18} /><span><strong>This is a draft.</strong> Changes save in place until you publish.</span></div>
              ) : (
                <div className="immutable-note"><LockKeyhole size={18} /><span><strong>Published versions are immutable.</strong> Saving changes creates a new draft version with a complete audit trail.</span></div>
              )}
              <div className="editor-actions" style={{ marginTop: 14 }}>
                <button className="primary-button" onClick={saveDraft} disabled={saving}>{saving ? <RefreshCw size={17} className="spin" /> : <Check size={17} />}{saving ? 'Saving…' : isDraft ? 'Save draft' : 'Save as new draft'}</button>
                {isDraft && <button className="secondary-button" onClick={publishDraft} disabled={publishing}>{publishing ? <RefreshCw size={17} className="spin" /> : <BadgeCheck size={17} />}{publishing ? 'Publishing…' : 'Publish'}</button>}
              </div>
            </>
          )}
          {!detailLoading && !detail && <p className="panel-note">Select a persona from the library, or create one below.</p>}
        </div>
      </section>
      <section className="panel test-console">
        <PanelTitle title="Persona test console" eyebrow={detail ? `Live · ${detail.persona.name}` : 'Select a persona to test'} action={<StatusPill tone="good">Live</StatusPill>} />
        <div className="console-grid">
          <div className="console-chat">
            {latestVersion && <div className="chat-message agent"><span>VH</span><p>{latestVersion.opening_message}</p></div>}
            {testTurns.map((turn, index) => (
              <div className={`chat-message ${turn.role === 'user' ? 'user' : 'agent'}`} key={index}>
                <span>{turn.role === 'user' ? 'YOU' : 'VH'}</span>
                <div>
                  <p>{turn.content}</p>
                  {turn.citations && turn.citations.length > 0 && (
                    <div className="citation-list">
                      {turn.citations.map((c, i) => <div className="citation-row" key={i}><b>{c.document_title}</b><span>{c.content}</span></div>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="console-controls" onSubmit={runTest}>
            <label>Test message<textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
            <button className="primary-button" type="submit" disabled={testing || !detail}>{testing ? <RefreshCw size={17} className="spin" /> : <MessageSquareText size={17} />}{testing ? 'Thinking…' : 'Run Persona test'}</button>
            <p><ShieldCheck size={14} /> Live response from your organisation&rsquo;s OpenAI account, grounded in this persona&rsquo;s assigned knowledge.</p>
          </form>
        </div>
      </section>
      <section className="panel">
        <PanelTitle title="Create a persona" eyebrow="Blank, AI-generated or duplicated" />
        <form className="form-grid two" onSubmit={submitCreate}>
          <label>Name<input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Interview Coach" /></label>
          <label>Mode
            <select value={createMode} onChange={(e) => setCreateMode(e.target.value as 'blank' | 'generate' | 'duplicate')}>
              <option value="generate">Generate with AI</option>
              <option value="blank">Start blank</option>
              <option value="duplicate">Duplicate an existing persona</option>
            </select>
          </label>
          {createMode === 'generate' && <label className="full">Describe the VowHuman&rsquo;s role<textarea value={createRole} onChange={(e) => setCreateRole(e.target.value)} placeholder="e.g. A warm, encouraging interview coach for first-time job seekers in South Africa" /></label>}
          {createMode === 'blank' && <label className="full">Role (optional)<input value={createRole} onChange={(e) => setCreateRole(e.target.value)} placeholder="e.g. Support agent" /></label>}
          {createMode === 'duplicate' && (
            <label className="full">Source persona
              <select value={createSourceId} onChange={(e) => setCreateSourceId(e.target.value)}>
                <option value="" disabled>Choose a persona</option>
                {items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <button className="primary-button" type="submit" disabled={creating}>{creating ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />}{creating ? 'Creating…' : 'Create persona'}</button>
        </form>
      </section>
    </div>
  );
}

function PersonaLanguageMessages({ personaVersionId, languageCodes, messages, onSaved }: { personaVersionId: string; languageCodes: string[]; messages: PersonaLanguageMessage[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { opening: string; fallback: string }>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);

  function draftFor(code: string) {
    if (drafts[code]) return drafts[code];
    const existing = messages.find((m) => m.persona_version_id === personaVersionId && m.language_code === code);
    return { opening: existing?.opening_message ?? '', fallback: existing?.fallback_message ?? '' };
  }

  async function save(code: string, autoTranslate: boolean) {
    setBusyCode(code);
    const draft = draftFor(code);
    await fetch('/api/v1/persona-versions/' + personaVersionId + '/language-messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language_code: code, opening_message: draft.opening, fallback_message: draft.fallback, auto_translate: autoTranslate }),
    }).catch(() => {});
    onSaved();
    setBusyCode(null);
  }

  return (
    <div className="language-message-list">
      {languageCodes.map((code) => {
        const existing = messages.find((m) => m.persona_version_id === personaVersionId && m.language_code === code);
        const draft = draftFor(code);
        const name = FALLBACK_LANGUAGES.find((l) => l.code === code)?.english_name ?? code;
        return (
          <div className="panel language-message-row" key={code}>
            <strong>{name}</strong>
            {existing?.source === 'machine_translated' && <StatusPill tone="warn">Machine translated — review before use</StatusPill>}
            <textarea placeholder="Opening message" value={draft.opening} onChange={(e) => setDrafts((prev) => ({ ...prev, [code]: { opening: e.target.value, fallback: prev[code]?.fallback ?? draft.fallback } }))} />
            <textarea placeholder="Fallback message (used when this language can't be resolved)" value={draft.fallback} onChange={(e) => setDrafts((prev) => ({ ...prev, [code]: { opening: prev[code]?.opening ?? draft.opening, fallback: e.target.value } }))} />
            <div className="editor-actions">
              <button className="secondary-button" type="button" onClick={() => save(code, false)} disabled={busyCode === code}>{busyCode === code ? 'Saving…' : 'Save'}</button>
              {code !== 'en-ZA' && <button className="plain-button" type="button" onClick={() => save(code, true)} disabled={busyCode === code}>Translate opening message with AI</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const KNOWLEDGE_SOURCE_LABEL: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', xlsx: 'Excel', markdown: 'Markdown', website: 'Website', text: 'Text', generated: 'AI-generated', course: 'Course', job_context: 'Job context' };
type KnowledgeAssignment = { human_slug: string; knowledge_base_id: string };
type KnowledgeDocument = { id: string; title: string; source_type: string; approved_url: string | null; state: string; language: string | null; created_at: string; chunk_count: number; access_policy: { ingest_error?: string } | null };

function Knowledge() {
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
  const [assignments, setAssignments] = useState<KnowledgeAssignment[]>([]);
  const [realHumans, setRealHumans] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [addSourceMode, setAddSourceMode] = useState<'upload' | 'website' | 'generate'>('upload');
  const [addTargetBase, setAddTargetBase] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [addTopic, setAddTopic] = useState('');
  const [addLanguage, setAddLanguage] = useState('');
  const [adding, setAdding] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const [newBaseName, setNewBaseName] = useState('');
  const [newBaseDescription, setNewBaseDescription] = useState('');
  const [creatingBase, setCreatingBase] = useState(false);

  async function refresh() {
    const [basesRes, assignmentsRes, humansRes] = await Promise.all([
      fetch('/api/v1/knowledge-bases').then(r => r.json()).catch(() => null),
      fetch('/api/v1/knowledge-assignments').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (basesRes?.success) {
      setBases(basesRes.data.items);
      setAddTargetBase((prev) => prev || basesRes.data.items[0]?.id || '');
    }
    if (assignmentsRes?.success) setAssignments(assignmentsRes.data.items);
    if (humansRes?.success) setRealHumans(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused by user-triggered handlers below
  useEffect(() => { refresh(); }, []);

  async function loadDocuments(baseId: string) {
    setDocsLoading(true);
    const res = await fetch(`/api/v1/knowledge-bases/${baseId}`).then(r => r.json()).catch(() => null);
    if (res?.success) setDocuments(res.data.documents);
    setDocsLoading(false);
  }

  function toggleExpand(baseId: string) {
    if (expandedId === baseId) { setExpandedId(null); setDocuments([]); return; }
    setExpandedId(baseId);
    loadDocuments(baseId);
  }

  // Polls while any visible document is still genuinely in progress, so the UI reflects
  // the after()-deferred ingestion completing without a manual refresh. Stops for a
  // document that has failed (has an ingest_error) rather than polling it forever.
  useEffect(() => {
    if (!expandedId || !documents.some((d) => d.state !== 'active' && !d.access_policy?.ingest_error)) return;
    const timer = window.setInterval(() => loadDocuments(expandedId), 4000);
    return () => window.clearInterval(timer);
  }, [expandedId, documents]);

  async function toggleAssignment(humanSlug: string, baseId: string, assigned: boolean) {
    setBusyId(`${humanSlug}:${baseId}`);
    await fetch('/api/v1/knowledge-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanSlug, knowledge_base_id: baseId, assigned }) }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function deleteBase(id: string) {
    setBusyId(id);
    await fetch(`/api/v1/knowledge-bases/${id}`, { method: 'DELETE' }).catch(() => {});
    if (expandedId === id) { setExpandedId(null); setDocuments([]); }
    await refresh();
    setBusyId(null);
  }

  async function deleteDocument(id: string) {
    setBusyId(id);
    await fetch(`/api/v1/knowledge-documents/${id}`, { method: 'DELETE' }).catch(() => {});
    if (expandedId) await loadDocuments(expandedId);
    await refresh();
    setBusyId(null);
  }

  async function submitCreateBase(event: React.FormEvent) {
    event.preventDefault();
    if (!newBaseName.trim()) { setError('Give the library a name.'); return; }
    setCreatingBase(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/knowledge-bases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: newBaseName.trim(), description: newBaseDescription.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this library.');
      setNewBaseName(''); setNewBaseDescription('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this library.');
    } finally {
      setCreatingBase(false);
    }
  }

  async function generatePreview() {
    if (addTopic.trim().length < 5) { setError('Describe the topic, skill or expertise to generate (at least 5 characters).'); return; }
    setGeneratingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/knowledge-documents/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: addTopic.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not generate this article.');
      setPreviewContent(body.data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this article.');
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function submitAddSource(event: React.FormEvent) {
    event.preventDefault();
    if (!addTargetBase) { setError('Choose which library to add this source to.'); return; }
    setAdding(true);
    setError(null);
    try {
      let res: Response;
      if (addSourceMode === 'upload') {
        if (!addFile) { setError('Choose a file to upload.'); setAdding(false); return; }
        const form = new FormData();
        form.set('knowledge_base_id', addTargetBase);
        form.set('title', addTitle);
        form.set('language', addLanguage);
        form.set('file', addFile);
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', body: form });
      } else if (addSourceMode === 'website') {
        if (!addUrl.trim()) { setError('Enter a URL.'); setAdding(false); return; }
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: addTargetBase, source_type: 'website', url: addUrl.trim(), title: addTitle.trim() }) });
      } else {
        if (!previewContent) { setError('Generate a preview first.'); setAdding(false); return; }
        res = await fetch('/api/v1/knowledge-documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knowledge_base_id: addTargetBase, source_type: 'generated', topic: addTopic.trim(), title: addTitle.trim(), content: previewContent }) });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not add this source.');
      setAddFile(null); setAddUrl(''); setAddTopic(''); setAddTitle(''); setPreviewContent(null);
      setExpandedId(addTargetBase);
      await loadDocuments(addTargetBase);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this source.');
    } finally {
      setAdding(false);
    }
  }

  const totalDocuments = bases.reduce((sum, b) => sum + b.document_count, 0);
  const totalChunks = bases.reduce((sum, b) => sum + b.chunk_count, 0);
  const totalLanguages = bases.reduce((max, b) => Math.max(max, b.language_count), 0);

  return (
    <div className="content-stack">
      <section className="metric-grid compact-metrics">
        {[['Libraries', String(bases.length), BookOpenText], ['Approved sources', String(totalDocuments), UploadCloud], ['Indexed chunks', String(totalChunks), Sparkles], ['Languages', String(totalLanguages), Languages]].map(([label, value, Icon]) => (
          <article className="metric-card" key={String(label)}><span className="metric-icon cyan"><Icon size={20} /></span><p>{String(label)}</p><strong>{String(value)}</strong></article>
        ))}
      </section>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && bases.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><BookOpenText size={24} /></span><p className="eyebrow">No knowledge libraries yet</p><h2>Create your first library</h2><p>A library groups related documents, websites and AI-generated articles into one knowledge base your VowHumans can draw on — create one below.</p></section>
      )}
      <section className="asset-card-grid">
        {bases.map((base) => {
          const assignedHumans = assignments.filter((a) => a.knowledge_base_id === base.id).map((a) => a.human_slug);
          return (
            <article className="panel asset-card" key={base.id}>
              <div className="asset-card-top">
                <StatusPill tone={base.document_count > 0 ? 'good' : 'muted'}>{base.document_count > 0 ? 'Active' : 'Empty'}</StatusPill>
                <button className="icon-button" aria-label={`Delete ${base.name}`} onClick={() => deleteBase(base.id)} disabled={busyId === base.id}><Trash2 size={16} /></button>
              </div>
              <h2>{base.name}</h2>
              {base.description && <p>{base.description}</p>}
              <div className="asset-detail">
                <span>{base.document_count} source{base.document_count === 1 ? '' : 's'} · {base.chunk_count} chunks</span>
                <button className="secondary-button" onClick={() => toggleExpand(base.id)}>{expandedId === base.id ? 'Hide' : 'View sources'}</button>
              </div>
              {expandedId === base.id && (
                <div className="doc-mini-list">
                  {docsLoading && documents.length === 0 && <p className="panel-note">Loading sources…</p>}
                  {!docsLoading && documents.length === 0 && <p className="panel-note">No sources in this library yet.</p>}
                  {documents.map((doc) => {
                    const failed = Boolean(doc.access_policy?.ingest_error);
                    return (
                      <div className="doc-mini-row" key={doc.id}>
                        <span className="source-cell"><i><FileText size={14} /></i><b>{doc.title}<small>{KNOWLEDGE_SOURCE_LABEL[doc.source_type] ?? doc.source_type}</small></b></span>
                        <StatusPill tone={doc.state === 'active' ? 'good' : failed ? 'danger' : 'warn'} title={failed ? doc.access_policy?.ingest_error : undefined}>
                          {doc.state === 'active' ? `${doc.chunk_count} chunks` : failed ? 'Failed — remove and retry' : 'Indexing…'}
                        </StatusPill>
                        <button aria-label={`Delete ${doc.title}`} onClick={() => deleteDocument(doc.id)} disabled={busyId === doc.id}><Trash2 size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="full">Assign to VowHumans
                <div className="chip-toggle-row">
                  {realHumans.map((human) => {
                    const active = assignedHumans.includes(human.id);
                    return (
                      <button type="button" key={human.id} className={`chip-toggle${active ? ' active' : ''}`} onClick={() => toggleAssignment(human.id, base.id, !active)} disabled={busyId === `${human.id}:${base.id}`}>
                        {active ? <Check size={11} /> : null}{human.name}
                      </button>
                    );
                  })}
                  {realHumans.length === 0 && <span className="panel-note">Create a VowHuman before assigning this knowledge library.</span>}
                </div>
              </label>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <PanelTitle title="Create a new library" eyebrow="Group related knowledge together" />
        <form className="form-grid two" onSubmit={submitCreateBase}>
          <label className="full">Library name<input value={newBaseName} onChange={(e) => setNewBaseName(e.target.value)} placeholder="e.g. Interview Preparation" /></label>
          <label className="full">Description<textarea value={newBaseDescription} onChange={(e) => setNewBaseDescription(e.target.value)} placeholder="What this library is for" /></label>
          <button className="primary-button" type="submit" disabled={creatingBase}>{creatingBase ? <RefreshCw size={17} className="spin" /> : <BookOpenText size={17} />}{creatingBase ? 'Creating…' : 'Create library'}</button>
        </form>
      </section>
      <section className="panel">
        <PanelTitle title="Add approved knowledge" eyebrow="Upload, import or generate with AI" />
        <form className="form-grid two" onSubmit={submitAddSource}>
          <label>Library
            <select value={addTargetBase} onChange={(e) => setAddTargetBase(e.target.value)}>
              <option value="" disabled>Choose a library</option>
              {bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
            </select>
          </label>
          <label>Source
            <select value={addSourceMode} onChange={(e) => { setAddSourceMode(e.target.value as 'upload' | 'website' | 'generate'); setPreviewContent(null); }}>
              <option value="upload">Upload a document</option>
              <option value="website">Import a website</option>
              <option value="generate">Generate with AI</option>
            </select>
          </label>
          {addSourceMode !== 'generate' && <label className="full">Title (optional)<input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Defaults to the file name or URL" /></label>}
          {addSourceMode === 'upload' && <label className="full">File — PDF, DOCX, Excel, Markdown or text (max 4MB)<input type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.markdown,.txt" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} /></label>}
          {addSourceMode === 'website' && <label className="full">Approved website URL<input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="https://example.com/guide" /></label>}
          {addSourceMode === 'generate' && (
            <label className="full">Topic, skill, knowledge base or expertise to generate
              <textarea value={addTopic} onChange={(e) => { setAddTopic(e.target.value); setPreviewContent(null); }} placeholder="e.g. South African labour law basics for a first-time job seeker" />
            </label>
          )}
          {addSourceMode === 'generate' && previewContent && (
            <div className="full generated-preview">
              <p className="eyebrow">Generated preview — review before adding</p>
              <div className="preview-scroll">{previewContent}</div>
            </div>
          )}
          {addSourceMode !== 'generate' && <label>Language (optional)<LanguageSelect value={addLanguage} onChange={setAddLanguage} includeNone="Not set" /></label>}
          {addSourceMode === 'generate' && !previewContent && (
            <div className="full">
              <button className="secondary-button" type="button" onClick={generatePreview} disabled={generatingPreview}>
                {generatingPreview ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />}{generatingPreview ? 'Generating…' : 'Generate preview'}
              </button>
              {generatingPreview && <p className="panel-note">A thorough article can take up to a couple of minutes with some models — this is normal.</p>}
            </div>
          )}
          {addSourceMode === 'generate' && previewContent && (
            <div className="full editor-actions">
              <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add to library'}</button>
              <button className="secondary-button" type="button" onClick={generatePreview} disabled={generatingPreview}>{generatingPreview ? <RefreshCw size={17} className="spin" /> : <RefreshCw size={17} />}Regenerate</button>
            </div>
          )}
          {addSourceMode !== 'generate' && <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add source'}</button>}
        </form>
      </section>
      <section className="panel safety-checklist">
        <PanelTitle title="Retrieval safeguards" eyebrow="Always on" />
        {['Organisation ownership required', 'Source access checked before retrieval', 'Uploaded text stays separated from system instructions', 'Every grounded answer carries citations', 'Deletion removes chunks and embeddings'].map((item) => <div key={item}><CircleCheck size={17} /><span>{item}</span></div>)}
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function IdentityConsent() {
  const [reviewed, setReviewed] = useState(false);
  return (
    <div className="content-stack">
      <section className="consent-banner"><span><ShieldCheck size={28}/></span><div><p className="eyebrow">Publication gate active</p><h2>No identity goes live on a handshake.</h2><p>Written permissions, provenance, purpose and expiry are mandatory. Revocation blocks new sessions and renders immediately.</p></div><div className="consent-score"><strong>100%</strong><small>active coverage</small></div></section>
      <section className="panel">
        <PanelTitle title="Identity register" eyebrow={`${identityRecords.length} identities`} action={<InlineAction className="table-action" idleLabel={<>Filter <ChevronRight size={15}/></>} doneLabel="Showing all identities" />} />
        <div className="data-table consent-table"><div className="table-row table-head"><span>Identity</span><span>Owner</span><span>Permitted scope</span><span>Expiry</span><span>Status</span></div>{identityRecords.map(record=><div className="table-row" key={record.identity}><span className="source-cell"><i><Fingerprint size={17}/></i><b>{record.identity}</b></span><span>{record.owner}</span><span>{record.scope}</span><span>{record.expiry}</span><span><StatusPill tone={record.status==='Blocked'?'danger':'good'}>{record.status}</StatusPill></span></div>)}</div>
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

type LiveSessionRow = {
  id: string;
  state: string;
  avatar_mode: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  human_name: string | null;
  source: "embed" | "studio_test";
  application_name: string | null;
};
type LiveSessionMetrics = {
  live_now: number;
  sessions_today: number;
  avg_duration_seconds: number | null;
  p95_first_audio_ms: number | null;
  reconnect_rate: number | null;
  telemetry_insufficient: boolean;
};
type GatewayHealthStatus = { gateway_reachable: boolean; realtime_configured: boolean; realtime_check_available: boolean; avatar_configured: boolean };
type TestReadyHuman = { id: string; name: string; role: string; ready: boolean; faceAssetId: string | null };

function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ACTIVE_SESSION_STATES = new Set(["created", "connecting", "active"]);
const STALE_SESSION_MS = 30 * 60 * 1000;

function sessionStateDisplay(row: LiveSessionRow): { label: string; tone: string } {
  if (ACTIVE_SESSION_STATES.has(row.state)) {
    if (Date.now() - new Date(row.created_at).getTime() > STALE_SESSION_MS) return { label: "Timed out", tone: "muted" };
    if (row.state === "active") return { label: "Live", tone: "good" };
    return { label: row.state === "connecting" ? "Connecting" : "Created", tone: "warn" };
  }
  if (row.state === "completed") return { label: "Completed", tone: "muted" };
  if (row.state === "failed") return { label: "Failed", tone: "danger" };
  return { label: row.state, tone: "muted" };
}

function sessionDurationDisplay(row: LiveSessionRow): string {
  const start = row.started_at ?? row.created_at;
  const end = row.ended_at ?? (ACTIVE_SESSION_STATES.has(row.state) ? new Date().toISOString() : null);
  if (!end) return "—";
  return formatCallDuration(Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

type CallStage = "idle" | "starting" | "live" | "ended";

function LiveSessions() {
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [metrics, setMetrics] = useState<LiveSessionMetrics | null>(null);
  const [health, setHealth] = useState<GatewayHealthStatus | null>(null);
  const [testHumans, setTestHumans] = useState<TestReadyHuman[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testConsoleRef = useRef<HTMLDivElement | null>(null);

  const [callStage, setCallStage] = useState<CallStage>("idle");
  const [activeHuman, setActiveHuman] = useState<TestReadyHuman | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en-ZA");
  const [switchingLanguage, setSwitchingLanguage] = useState(false);
  const [languageSwitchNote, setLanguageSwitchNote] = useState<string | null>(null);
  const liveRoomRef = useRef<Room | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [liveRoom, setLiveRoom] = useState<{ url: string; token: string } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveVoiceRoomStatus | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reconnectedThisCall, setReconnectedThisCall] = useState(false);
  const [callSummary, setCallSummary] = useState<{ duration: string; reconnected: boolean } | null>(null);
  const [agentJoined, setAgentJoined] = useState(false);
  const [noAgentTimeout, setNoAgentTimeout] = useState(false);

  async function refresh() {
    const [sessionsRes, humansRes, assignRes, faceAssignRes] = await Promise.all([
      fetch("/api/v1/live-sessions").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/digital-humans").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/persona-assignments").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/face-assignments").then((r) => r.json()).catch(() => null),
    ]);
    if (sessionsRes?.success) {
      setSessions(sessionsRes.data.items);
      setMetrics(sessionsRes.data.metrics);
      setHealth(sessionsRes.data.health);
    }
    if (humansRes?.success) {
      const readySlugs = new Set<string>((assignRes?.data?.items ?? []).filter((a: { state: string }) => a.state === "published").map((a: { human_slug: string }) => a.human_slug));
      const faceBySlug = new Map<string, string>((faceAssignRes?.data?.items ?? []).map((f: { human_slug: string; face_asset_id: string }) => [f.human_slug, f.face_asset_id]));
      setTestHumans(humansRes.data.items.map((h: DigitalHumanSummary) => ({ id: h.id, name: h.name, role: h.role, ready: readySlugs.has(h.id), faceAssetId: faceBySlug.get(h.id) ?? null })));
    }
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused after starting/ending a call and by the poll below
    refresh();
    const interval = window.setInterval(refresh, 10000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function focusConsole() {
      testConsoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("studio:start-test-session", focusConsole);
    return () => window.removeEventListener("studio:start-test-session", focusConsole);
  }, []);

  useEffect(() => {
    if (callStage !== "live" || !callStartedAt) return;
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [callStage, callStartedAt]);

  // The room can connect (WebRTC-wise) with nobody home — realtime-agent-worker
  // is a separate deployed service that can silently refuse the job (e.g. its
  // ENABLE_OPENAI_REALTIME isn't set) and there's otherwise no client-visible
  // sign of that; the call just sits on "Listening" forever. Surface it instead
  // of leaving that indistinguishable from a real, working, quiet room.
  useEffect(() => {
    if (callStage !== "live" || liveStatus !== "connected" || agentJoined) return;
    const timeout = window.setTimeout(() => setNoAgentTimeout(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [callStage, liveStatus, agentJoined]);

  async function reportEvent(sessionId: string, eventType: string, payload: Record<string, unknown>) {
    await fetch(`/api/v1/live-sessions/${sessionId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_type: eventType, payload }) }).catch(() => {});
  }

  // Resolution + logging is guaranteed (the switch-language endpoint always
  // writes a session_events row); the actual live hot-swap is a best-effort data
  // message to the realtime-agent worker (verified real API — see
  // services/realtime-agent/livekit_agent.py's update_agent/update_options usage).
  // Never claims the switch worked when the registry says the language wasn't
  // directly usable — disclosed via languageSwitchNote either way.
  async function switchLanguage(target: string) {
    if (!activeSessionId) return;
    setSwitchingLanguage(true);
    setLanguageSwitchNote(null);
    const res = await fetch(`/api/v1/live-sessions/${activeSessionId}/switch-language`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_language: target }) }).then((r) => r.json()).catch(() => null);
    setSwitchingLanguage(false);
    if (!res?.success) { setLanguageSwitchNote(res?.message || "Could not switch language."); return; }
    setSelectedLanguage(target);
    if (res.data.status === "unsupported" || !res.data.resolved_language) {
      setLanguageSwitchNote(`${target} isn't usable yet — staying in the current language.`);
      return;
    }
    liveRoomRef.current?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "vhm_language_switch_request", language_code: res.data.resolved_language })), { reliable: true });
    setLanguageSwitchNote(res.data.used_fallback ? `${target} isn't directly usable — using ${res.data.resolved_language} instead.` : `Switched to ${res.data.resolved_language}.`);
  }

  async function startTestCall(human: TestReadyHuman) {
    if (!human.ready || callStage === "starting") return;
    setError(null);
    setActiveHuman(human);
    setCallStage("starting");
    setReconnectedThisCall(false);
    setCallSummary(null);
    setAgentJoined(false);
    setNoAgentTimeout(false);
    try {
      const sessionRes = await fetch("/api/v1/live-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digital_human_id: human.id, requested_language: selectedLanguage }) });
      const sessionBody = await sessionRes.json().catch(() => ({}));
      if (!sessionRes.ok) throw new Error(sessionBody.message || "Could not start this test call.");
      const sessionId = sessionBody.data.session_id as string;
      setActiveSessionId(sessionId);
      const tokenRes = await fetch(`/api/v1/live-sessions/${sessionId}/token`, { method: "POST" });
      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenBody?.data?.url || !tokenBody?.data?.token) throw new Error(tokenBody.message || "Could not connect the live call.");
      setLiveRoom({ url: tokenBody.data.url, token: tokenBody.data.token });
      // eslint-disable-next-line react-hooks/purity -- startTestCall only ever runs from a click handler (onClick={() => startTestCall(human)}), never during render; the linter can't trace that indirection
      const startedAt = Date.now();
      setCallStartedAt(startedAt);
      setElapsedSeconds(0);
      setCallStage("live");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this test call.");
      setCallStage("idle");
      setActiveHuman(null);
      setActiveSessionId(null);
    }
  }

  async function endTestCall() {
    const sessionId = activeSessionId;
    const duration = formatCallDuration(elapsedSeconds);
    setLiveRoom(null);
    setCallStage("ended");
    setCallSummary({ duration, reconnected: reconnectedThisCall });
    if (sessionId) await fetch(`/api/v1/live-sessions/${sessionId}/end`, { method: "POST" }).catch(() => {});
    refresh();
  }

  function returnToPicker() {
    setCallStage("idle");
    setActiveHuman(null);
    setActiveSessionId(null);
    setLiveStatus(null);
    setSpeaking(false);
    setCallSummary(null);
  }

  const stateChip = callStage !== "live" ? null
    : liveStatus === "error" ? { label: "Connection failed", tone: "danger" }
    : liveStatus !== "connected" ? { label: "Connecting…", tone: "warn" }
    : noAgentTimeout ? { label: "No agent joined", tone: "danger" }
    : speaking ? { label: "Speaking", tone: "good" }
    : { label: "Listening", tone: "good" };

  return (
    <div className="content-stack">
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      <section className="session-overview">
        <div><span className="live-orb"><Radio size={25} /></span><p className="eyebrow">Live now</p><strong>{metrics ? metrics.live_now : loaded ? 0 : "—"}</strong><small>{metrics ? `${metrics.sessions_today} today` : "loading…"}</small></div>
        <div><p>Time to first audio</p><strong>{metrics && !metrics.telemetry_insufficient && metrics.p95_first_audio_ms !== null ? `${Math.round(metrics.p95_first_audio_ms)} ms` : "—"}</strong><small>{metrics?.telemetry_insufficient ? "Not enough data yet" : "p95 · client-reported"}</small></div>
        <div><p>Reconnect-free rate</p><strong>{metrics && !metrics.telemetry_insufficient && metrics.reconnect_rate !== null ? `${Math.round((1 - metrics.reconnect_rate) * 100)}%` : "—"}</strong><small>{metrics?.telemetry_insufficient ? "Not enough data yet" : "rolling 30 days"}</small></div>
        <div><p>Avg call duration</p><strong>{metrics?.avg_duration_seconds ? formatCallDuration(metrics.avg_duration_seconds) : "—"}</strong><small>{metrics?.avg_duration_seconds ? "completed calls" : "No completed calls yet"}</small></div>
      </section>

      <section className="panel">
        <PanelTitle title="Session monitor" eyebrow={`${sessions.length} recent session${sessions.length === 1 ? "" : "s"}`} action={<StatusPill tone={health?.gateway_reachable ? "good" : "warn"}>{health?.gateway_reachable ? "Gateway reachable" : "Gateway not reachable"}</StatusPill>} />
        {loaded && sessions.length === 0 && (
          <div className="ingestion-card"><span className="empty-icon"><Radio size={24} /></span><p className="eyebrow">No sessions yet</p><h2>Nothing has run yet</h2><p>Start a test call below, or embed a VowHuman on an external application — every real call, from either source, shows up here.</p></div>
        )}
        {sessions.length > 0 && (
          <div className="data-table sessions-table">
            <div className="table-row table-head"><span>Human</span><span>Source</span><span>State</span><span>Duration</span><span>Mode</span></div>
            {sessions.map((session) => {
              const state = sessionStateDisplay(session);
              return (
                <div className="table-row" key={session.id}>
                  <span><b>{session.human_name ?? "Unknown VowHuman"}</b></span>
                  <span className="source-cell">{session.source === "embed" ? <><AppWindow size={14} />{session.application_name ?? "Embed"}</> : <><LockKeyhole size={14} />Studio test</>}</span>
                  <span><StatusPill tone={state.tone}>{state.label}</StatusPill></span>
                  <span>{sessionDurationDisplay(session)}</span>
                  <span>{session.avatar_mode === "live-avatar" ? "Live avatar" : "Audio-only"}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="split-grid">
        <div className="panel">
          <PanelTitle title="Realtime health" eyebrow="Provider boundaries" />
          <div className="health-grid">
            {[
              ["LiveKit transport", health?.gateway_reachable ? "Reachable" : "Not reachable", health?.gateway_reachable ? "good" : "danger"],
              ["OpenAI Realtime", !health?.realtime_check_available ? "Unknown" : health.realtime_configured ? "Configured" : "Not configured", !health?.realtime_check_available ? "muted" : health.realtime_configured ? "good" : "danger"],
              ["Avatar worker", health?.avatar_configured ? "Configured" : "Audio fallback", health?.avatar_configured ? "good" : "warn"],
              ["Persona + knowledge", "Live per call", "good"],
            ].map(([name, state, tone]) => <div key={name}><span>{name}</span><StatusPill tone={tone}>{state}</StatusPill></div>)}
          </div>
          {health && !health.realtime_configured && (
            <p className="panel-note">
              {health.realtime_check_available
                ? "The deployed voice provider isn't configured — a test call will connect but no agent will speak. See docs/LIVE_VOICE_DEPLOYMENT.md."
                : "Set REALTIME_AGENT_HEALTH_URL to see a real status here instead of Unknown — see docs/LIVE_VOICE_DEPLOYMENT.md."}
            </p>
          )}
        </div>

        <div className="panel test-console" ref={testConsoleRef}>
          {callStage === "live" && liveRoom && activeHuman ? (
            <div className="live-call-stage">
              <span className="embed-disclosure"><Sparkles size={13} />Testing {activeHuman.name} — AI-generated, not a real person</span>
              <LiveVoiceRoom
                url={liveRoom.url}
                token={liveRoom.token}
                muted={muted}
                onStatusChange={setLiveStatus}
                onSpeakingChange={setSpeaking}
                onFirstAudio={() => {
                  setAgentJoined(true);
                  setNoAgentTimeout(false);
                  if (activeSessionId) reportEvent(activeSessionId, "first_audio", { elapsed_ms: callStartedAt ? Date.now() - callStartedAt : 0 });
                }}
                onReconnected={() => {
                  setReconnectedThisCall(true);
                  if (activeSessionId) reportEvent(activeSessionId, "reconnected", {});
                }}
                onRoomReady={(room) => { liveRoomRef.current = room; }}
              />
              {noAgentTimeout && (
                <div className="live-call-diagnostic">
                  <CircleAlert size={15} />
                  <span>Connected, but no voice agent has joined. The realtime voice provider likely isn&rsquo;t configured in this environment — check Realtime health below, or see docs/LIVE_VOICE_DEPLOYMENT.md.</span>
                </div>
              )}
              <div className="live-call-meta">
                {stateChip && <StatusPill tone={stateChip.tone}>{stateChip.label}</StatusPill>}
                <strong className="live-call-timer">{formatCallDuration(elapsedSeconds)}</strong>
              </div>
              <div className="live-call-controls">
                <button aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} className={muted ? "muted" : ""} onClick={() => setMuted((v) => !v)}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
                <LanguageSelect value={selectedLanguage} onChange={switchLanguage} capability="realtime" scope="enabled-only" disabled={switchingLanguage} />
                <button className="end-call" onClick={endTestCall}><PhoneOff size={16} />End call</button>
              </div>
              {languageSwitchNote && <p className="panel-note">{languageSwitchNote}</p>}
            </div>
          ) : callStage === "ended" && callSummary && activeHuman ? (
            <div className="call-summary">
              <span className="empty-icon"><Check size={24} /></span>
              <p className="eyebrow">Test call complete</p>
              <h2>{callSummary.duration} with {activeHuman.name}</h2>
              <p>{callSummary.reconnected ? "The connection recovered from a reconnect during this call." : "No reconnects during this call."} It now appears in the session monitor above.</p>
              <button className="secondary-button" onClick={returnToPicker}><RefreshCw size={15} />Test another VowHuman</button>
            </div>
          ) : (
            <>
              <PanelTitle title="Test console" eyebrow="Real live voice + avatar call" action={<StatusPill tone="good">Live</StatusPill>} />
              <label className="pre-call-language">Language for this call
                <LanguageSelect value={selectedLanguage} onChange={setSelectedLanguage} capability="realtime" scope="enabled-only" showStatusBadge includeNone="Auto-detect language" />
              </label>
              {testHumans.length === 0 && loaded && (
                <div className="ingestion-card compact"><p>No digital humans yet.</p><Link href="/studio/digital-humans" className="secondary-button"><ArrowRight size={15} />Create one</Link></div>
              )}
              {testHumans.length > 0 && (
                <div className="human-pick-grid">
                  {testHumans.map((human) => (
                    <button key={human.id} className="human-pick-card" disabled={!human.ready || callStage === "starting"} onClick={() => startTestCall(human)}>
                      <span className="human-pick-avatar">
                        {human.faceAssetId ? <Image src={`/api/v1/faces/${human.faceAssetId}/image`} alt="" fill sizes="46px" unoptimized /> : human.name.slice(0, 2).toUpperCase()}
                      </span>
                      <b>{human.name}</b>
                      <small>{human.ready ? human.role : "Publish a persona first"}</small>
                      {callStage === "starting" && activeHuman?.id === human.id && <RefreshCw size={14} className="spin" />}
                    </button>
                  ))}
                </div>
              )}
              <p className="panel-note">Starts a real disclosed LiveKit call, scoped to your organisation, using each VowHuman&rsquo;s actual published persona, voice and knowledge.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

type PresenterProjectSummary = {
  id: string; title: string; course: string | null; module: string | null; lesson: string | null;
  digital_human_id: string | null; digital_human_name: string | null;
  voice_id: string | null; voice_name: string | null;
  output_language: string; aspect_ratio: string; state: string; created_at: string;
};
type PresenterScene = {
  id: string; ordinal: number; script: string; duration_ms: number | null; state: string;
  generated_video_id: string | null; output_kind: "scene-clip" | "scene-audio" | null;
  render_duration_ms: number | null; render_state: string | null; failure_reason: string | null;
};
type PresenterProjectDetail = { project: PresenterProjectSummary & { script: string }; scenes: PresenterScene[] };
type PresenterVoiceOption = { id: string; name: string };

const ASPECT_OPTIONS = ["16:9", "9:16", "1:1", "audio"];
const PIPELINE_STEPS = ["Script", "Voice", "Avatar", "Ready"];

function presenterStateLabel(state: string): { label: string; tone: string } {
  if (state === "draft") return { label: "Draft", tone: "muted" };
  if (state === "queued" || state === "processing") return { label: "Generating…", tone: "warn" };
  if (state === "preview_ready") return { label: "Ready to review", tone: "good" };
  if (state === "approved") return { label: "Approved", tone: "good" };
  if (state === "failed") return { label: "Failed", tone: "danger" };
  return { label: state, tone: "muted" };
}

function PresenterStudio() {
  const router = useRouter();
  const [projects, setProjects] = useState<PresenterProjectSummary[]>([]);
  const [humansList, setHumansList] = useState<DigitalHumanSummary[]>([]);
  const [voicesList, setVoicesList] = useState<PresenterVoiceOption[]>([]);
  const [faceByHuman, setFaceByHuman] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PresenterProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createFormRef = useRef<HTMLDivElement | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formScript, setFormScript] = useState("Welcome to GoalVow Academy. In this lesson, we'll explore how clear communication builds stronger customer relationships.");
  const [formHumanId, setFormHumanId] = useState("");
  const [formVoiceId, setFormVoiceId] = useState("");
  const [formLanguage, setFormLanguage] = useState("en-ZA");
  const [formAspect, setFormAspect] = useState("16:9");
  const [creating, setCreating] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const refresh = useCallback(async (): Promise<PresenterProjectSummary[]> => {
    const [projectsRes, humansRes, voicesRes, faceAssignRes] = await Promise.all([
      fetch("/api/v1/presenter-projects").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/digital-humans").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/voices").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/face-assignments").then((r) => r.json()).catch(() => null),
    ]);
    if (projectsRes?.success) setProjects(projectsRes.data.items);
    if (humansRes?.success) setHumansList(humansRes.data.items);
    if (voicesRes?.success) setVoicesList(voicesRes.data.items);
    if (faceAssignRes?.success) {
      setFaceByHuman(new Map(faceAssignRes.data.items.map((f: { human_slug: string; face_asset_id: string }) => [f.human_slug, f.face_asset_id])));
    }
    setLoaded(true);
    return projectsRes?.success ? (projectsRes.data.items as PresenterProjectSummary[]) : [];
  }, []);

  // The one place selection changes — always does the real fetch itself rather than
  // leaning on a useEffect keyed off selectedId. That pattern silently no-ops on a
  // second click of the same already-selected chip (React bails out on an unchanged
  // state value, so the effect never re-fires) — clicking a project whose first load
  // failed for any reason had no way to ever retry. Also surfaces a real error
  // instead of failing silently, unlike the previous version.
  const selectProject = useCallback(async (id: string | null) => {
    setSelectedId(id);
    setPlaying(false);
    setPlayIndex(0);
    setError(null);
    if (!id) {
      setDetail(null);
      return;
    }
    const res = await fetch(`/api/v1/presenter-projects/${id}`).then((r) => r.json()).catch(() => null);
    if (res?.success) {
      setDetail(res.data);
      return;
    }
    // A dead/expired session and a since-deleted project both 404-shape their way
    // to the generic client-side catch below with no res.message (the API only sets
    // message on validation-style errors) — that produced the same misleading "try
    // again" text for three unrelated causes. Branch on the real code instead so the
    // message actually matches what happened.
    if (res?.code === "UNAUTHENTICATED") {
      router.push(`/sign-in?next=${encodeURIComponent("/studio/presenter-studio")}`);
      return;
    }
    if (res?.code === "NOT_FOUND") {
      setError("This project could not be found — it may have been deleted.");
      return;
    }
    setError(res?.message || "Could not load this project. Try again.");
  }, [router]);

  useEffect(() => {
    async function init() {
      const items = await refresh();
      if (items[0]) await selectProject(items[0].id);
    }
    init();
  }, [refresh, selectProject]);

  useEffect(() => {
    function focusCreateForm() {
      selectProject(null);
      createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("studio:new-presenter-project", focusCreateForm);
    return () => window.removeEventListener("studio:new-presenter-project", focusCreateForm);
  }, [selectProject]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!formTitle.trim() || !formScript.trim()) {
      setError("Give the project a title and a script.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/presenter-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          script: formScript.trim(),
          digital_human_id: formHumanId || undefined,
          voice_id: formVoiceId || undefined,
          output_language: formLanguage,
          aspect_ratio: formAspect,
        }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resBody.message || "Could not create this project.");
      setFormTitle("");
      await refresh();
      await selectProject(resBody.data.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this project.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    await fetch(`/api/v1/presenter-projects/${id}`, { method: "DELETE" }).catch(() => {});
    await selectProject(null);
    await refresh();
  }

  async function generate() {
    if (!detail) return;
    setGenerating(true);
    setError(null);
    const total = detail.scenes.length;
    let done = detail.scenes.filter((s) => s.state === "completed").length;
    setGenProgress({ done, total });
    try {
      for (;;) {
        const res = await fetch(`/api/v1/presenter-projects/${detail.project.id}/render-next-scene`, { method: "POST" });
        const resBody = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(resBody.message || "Generation failed.");
        if (resBody.data.done) break;
        done += 1;
        setGenProgress({ done, total });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
      setGenProgress(null);
      await selectProject(detail.project.id);
      await refresh();
    }
  }

  // Once every scene is completed the render loop above has nothing left to do
  // (render-next-scene only picks up scenes that aren't 'completed' yet) — so
  // fixing something after the fact, like assigning a face to the digital human
  // this project uses, had no way back short of deleting and recreating the whole
  // project. Wipes the prior render artifacts server-side, then reuses the same
  // generate() loop against the now-reset scenes.
  async function regenerate() {
    if (!detail) return;
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/v1/presenter-projects/${detail.project.id}/regenerate`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (!res?.success) {
      setError(res?.message || "Could not reset this project for regeneration.");
      setGenerating(false);
      return;
    }
    await selectProject(detail.project.id);
    await generate();
  }

  const playableScenes = detail?.scenes.filter((s) => s.generated_video_id) ?? [];
  const currentScene = playableScenes[playIndex];

  function playFromStart() {
    setPlayIndex(0);
    setPlaying(true);
  }
  function handleEnded() {
    if (playIndex + 1 < playableScenes.length) setPlayIndex((i) => i + 1);
    else {
      setPlaying(false);
      setPlayIndex(0);
    }
  }
  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [playing, playIndex]);

  const completedScenes = detail?.scenes.filter((s) => s.state === "completed").length ?? 0;
  const totalScenes = detail?.scenes.length ?? 0;
  const activeStep = !detail ? 0 : detail.project.state === "draft" ? 0 : completedScenes < totalScenes ? 1 + (completedScenes > 0 ? 1 : 0) : PIPELINE_STEPS.length - 1;
  const faceAssetId = detail?.project.digital_human_id ? faceByHuman.get(detail.project.digital_human_id) : undefined;

  return (
    <div className="content-stack">
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && projects.length > 0 && (
        <section className="panel">
          <div className="chip-toggle-row">
            {projects.map((p) => (
              <button key={p.id} type="button" className={`chip-toggle${selectedId === p.id ? " active" : ""}`} onClick={() => selectProject(p.id)}>
                {p.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {(!selectedId || !detail) && (
        <section className="panel scene-editor" ref={createFormRef}>
          <PanelTitle title={projects.length === 0 ? "Create your first project" : "New project"} eyebrow="Real script-to-video generation" />
          <form onSubmit={createProject}>
            <label className="script-field">
              Title
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Customer Service Essentials" />
            </label>
            <label className="script-field">
              Presenter script
              <textarea value={formScript} onChange={(e) => setFormScript(e.target.value)} />
              <span>{formScript.length} characters · one scene per paragraph, blank-line separated</span>
            </label>
            <div className="form-grid two">
              <label>
                Presenter
                <select value={formHumanId} onChange={(e) => setFormHumanId(e.target.value)}>
                  <option value="">No VowHuman (audio-only)</option>
                  {humansList.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <label>
                Voice
                <select value={formVoiceId} onChange={(e) => setFormVoiceId(e.target.value)}>
                  <option value="">Choose a voice…</option>
                  {voicesList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label>
                Output language
                <LanguageSelect value={formLanguage} onChange={setFormLanguage} capability="tts" showStatusBadge />
              </label>
              <label>
                Aspect ratio
                <select value={formAspect} onChange={(e) => setFormAspect(e.target.value)}>
                  {ASPECT_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <button className="primary-button render-button" type="submit" disabled={creating || !formTitle.trim() || !formScript.trim()}>
              {creating ? <RefreshCw size={17} className="spin" /> : <WandSparkles size={17} />} {creating ? "Creating…" : "Create project"}
            </button>
          </form>
        </section>
      )}

      {detail && (
        <section className="presenter-workspace">
          <div className="panel scene-editor">
            <PanelTitle
              title={detail.project.title}
              eyebrow={[detail.project.course, detail.project.module, detail.project.lesson].filter(Boolean).join(" · ") || "Presenter project"}
              action={<StatusPill tone={presenterStateLabel(detail.project.state).tone}>{presenterStateLabel(detail.project.state).label}</StatusPill>}
            />
            <label className="script-field">
              Presenter script
              <textarea
                value={detail.project.script}
                readOnly={detail.project.state !== "draft"}
                onChange={(e) => setDetail({ ...detail, project: { ...detail.project, script: e.target.value } })}
                onBlur={async (e) => {
                  // Not comparing against detail.project.script here — onChange above
                  // already keeps that in sync with the textarea on every keystroke, so
                  // by blur time they're always equal and a same-value check like that
                  // would never see a change worth saving. Patching unconditionally on
                  // blur (while still draft) is simple and correct; a same-value PATCH
                  // is a harmless no-op server-side.
                  if (detail.project.state !== "draft") return;
                  await fetch(`/api/v1/presenter-projects/${detail.project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ script: e.target.value }) });
                  await selectProject(detail.project.id);
                  await refresh();
                }}
              />
              <span>{detail.scenes.length} scene{detail.scenes.length === 1 ? "" : "s"} · {detail.project.state === "draft" ? "editable — leaves the field to re-split scenes" : "locked once generation has started"}</span>
            </label>
            <div className="pipeline-strip">
              {PIPELINE_STEPS.map((step, index) => <div key={step} className={index <= activeStep ? "active" : ""}><span>{index + 1}</span><small>{step}</small></div>)}
            </div>
            {genProgress && <p className="panel-note">Generating scene {genProgress.done + 1} of {genProgress.total}…</p>}
            <div className="editor-actions">
              <button className="primary-button render-button" onClick={completedScenes === totalScenes && totalScenes > 0 ? regenerate : generate} disabled={generating || !detail.project.voice_id}>
                {generating ? <RefreshCw className="spin" size={17} /> : <WandSparkles size={17} />}
                {generating ? "Generating…" : completedScenes === totalScenes && totalScenes > 0 ? "Regenerate" : "Generate preview"}
              </button>
              <button className="plain-button" type="button" onClick={() => deleteProject(detail.project.id)}><Trash2 size={15} />Delete project</button>
            </div>
            {!detail.project.voice_id && <p className="panel-note">Assign a voice to this project before generating.</p>}
          </div>

          <div className="presenter-preview">
            <div className={`preview-stage preview-${detail.project.aspect_ratio.replace(":", "")}`}>
              {faceAssetId && <Image src={`/api/v1/faces/${faceAssetId}/image`} alt="" fill sizes="480px" unoptimized />}
              {playing && currentScene && (
                <video
                  ref={videoRef}
                  className={currentScene.output_kind === "scene-clip" ? "scene-video visible" : "scene-video hidden"}
                  src={`/api/v1/generated-videos/${currentScene.generated_video_id}/media`}
                  onEnded={handleEnded}
                  playsInline
                />
              )}
              <div className="preview-scrim" />
              <span className="preview-label"><Sparkles size={13} />AI-generated presenter</span>
              {playing && currentScene && <div className="preview-caption">{currentScene.script}</div>}
              {!playing && (
                <button className="present-play" aria-label={playableScenes.length === 0 ? "Nothing rendered yet" : "Play preview"} onClick={playFromStart} disabled={playableScenes.length === 0}>
                  {playableScenes.length === 0 ? <CircleAlert size={25} /> : <Play size={25} fill="currentColor" />}
                </button>
              )}
            </div>
            <div className="preview-meta">
              <div><span>OUTPUT</span><strong>{detail.project.aspect_ratio} · {playableScenes.some((s) => s.output_kind === "scene-clip") ? "lip-synced" : "audio"}</strong></div>
              <div><span>SCENES</span><strong>{completedScenes} / {totalScenes} rendered</strong></div>
              <div><span>PREVIEW</span><strong>{playableScenes.length > 0 ? "Ready to play" : "Not rendered"}</strong></div>
            </div>
            {(() => {
              const audioOnly = playableScenes.filter((s) => s.output_kind === "scene-audio");
              if (audioOnly.length === 0 || !detail.project.digital_human_id) return null;
              const reason = audioOnly.find((s) => s.failure_reason)?.failure_reason;
              return (
                <p className="panel-note">
                  {audioOnly.length}/{playableScenes.length} scene{audioOnly.length === 1 ? "" : "s"} rendered audio-only instead of lip-synced video. {reason || "The digital human may have no face image assigned, or avatar rendering isn't configured in this environment."}
                </p>
              );
            })()}
            <div className="truth-card">
              <CircleAlert size={18} />
              <p>
                <strong>Real narration and per-scene lip-synced rendering</strong>, played back scene-by-scene right here — every clip above is a genuine generated file, not a placeholder. A single downloadable MP4 export (scene concatenation, burned-in captions) isn&rsquo;t built yet; this plays the real scenes back to back instead.
              </p>
            </div>
            {playableScenes.length > 0 && <PresenterTranslations projectId={detail.project.id} scenes={detail.scenes} sourceLanguage={detail.project.output_language} />}
          </div>
        </section>
      )}
    </div>
  );
}

function PresenterTranslations({ projectId, scenes, sourceLanguage }: { projectId: string; scenes: PresenterScene[]; sourceLanguage: string }) {
  const [targetLanguage, setTargetLanguage] = useState('zu-ZA');
  const [translating, setTranslating] = useState(false);
  const [results, setResults] = useState<Record<string, { translated_script: string; translation_status: string; confidence: string }>>({});
  const [error, setError] = useState<string | null>(null);

  async function translateAll() {
    setTranslating(true);
    setError(null);
    for (const scene of scenes) {
      const res = await fetch(`/api/v1/presenter-projects/${projectId}/translate-scene`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene_id: scene.id, target_language: targetLanguage }),
      }).then((r) => r.json()).catch(() => null);
      if (res?.success) {
        setResults((prev) => ({ ...prev, [scene.id]: { translated_script: res.data.translated_script, translation_status: res.data.translation_status, confidence: res.data.confidence } }));
      } else {
        setError(res?.message || 'Could not translate one or more scenes.');
        break;
      }
    }
    setTranslating(false);
  }

  return (
    <div className="panel presenter-translations">
      <PanelTitle title="Translate this project" eyebrow="Stored as a separate version — the source script is never overwritten" />
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      <div className="editor-actions">
        <LanguageSelect value={targetLanguage} onChange={setTargetLanguage} capability="translation" showStatusBadge />
        <button className="secondary-button" type="button" onClick={translateAll} disabled={translating}>{translating ? 'Translating…' : 'Translate all scenes'}</button>
      </div>
      {Object.keys(results).length > 0 && (
        <div className="language-message-list">
          {scenes.map((scene) => {
            const result = results[scene.id];
            if (!result) return null;
            return (
              <div className="panel language-message-row" key={scene.id}>
                <strong>Scene {scene.ordinal + 1}</strong>
                <StatusPill tone={result.translation_status === 'approved' ? 'good' : 'warn'}>{result.translation_status.replace(/_/g, ' ')}</StatusPill>
                {result.confidence === 'low' && <StatusPill tone="danger">Low-confidence translation — review before use</StatusPill>}
                <p>{result.translated_script}</p>
                {scene.generated_video_id && (
                  <div className="editor-actions">
                    <a className="plain-button" href={`/api/v1/generated-videos/${scene.generated_video_id}/subtitles?format=srt&language=${targetLanguage}`}>Download .srt ({targetLanguage})</a>
                    <a className="plain-button" href={`/api/v1/generated-videos/${scene.generated_video_id}/subtitles?format=vtt&language=${targetLanguage}`}>Download .vtt ({targetLanguage})</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="editor-actions">
        {scenes.filter((s) => s.generated_video_id).map((scene) => (
          <a key={scene.id} className="plain-button" href={`/api/v1/generated-videos/${scene.generated_video_id}/subtitles?format=srt`}>Original ({sourceLanguage}) — Scene {scene.ordinal + 1} .srt</a>
        ))}
      </div>
    </div>
  );
}

type RealApplication = { id: string; name: string; slug: string; status: string; created_at: string; settings?: { allowed_embed_origins?: string[] } | null };
type DigitalHumanApplicationLink = { digital_human_id: string; application_id: string; application_name: string; application_slug: string; persona_version_id: string; enabled: boolean };

function Applications() {
  const [apps, setApps] = useState<RealApplication[]>([]);
  const [links, setLinks] = useState<DigitalHumanApplicationLink[]>([]);
  const [humansList, setHumansList] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingOriginsId, setEditingOriginsId] = useState<string | null>(null);
  const [originsDraft, setOriginsDraft] = useState('');
  const [savingOrigins, setSavingOrigins] = useState(false);

  async function refresh() {
    const [appsRes, linksRes, humansRes] = await Promise.all([
      fetch('/api/v1/applications').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-human-applications').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (appsRes?.success) setApps(appsRes.data.items);
    if (linksRes?.success) setLinks(linksRes.data.items);
    if (humansRes?.success) setHumansList(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused by submitCreate below
  useEffect(() => { refresh(); }, []);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) { setError('Give the application a name.'); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not connect this application.');
      setNewName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect this application.');
    } finally {
      setCreating(false);
    }
  }

  function startEditingOrigins(app: RealApplication) {
    setEditingOriginsId(app.id);
    setOriginsDraft((app.settings?.allowed_embed_origins ?? []).join('\n'));
    setError(null);
  }

  async function saveOrigins(appId: string) {
    setSavingOrigins(true);
    setError(null);
    try {
      const allowedOrigins = originsDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const res = await fetch(`/api/v1/applications/${appId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allowed_embed_origins: allowedOrigins }) });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resBody.message || 'Could not save allowed origins.');
      setEditingOriginsId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save allowed origins.');
    } finally {
      setSavingOrigins(false);
    }
  }

  return (
    <div className="content-stack">
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && apps.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><AppWindow size={24} /></span><p className="eyebrow">No applications connected yet</p><h2>Connect your first application</h2><p>Applications are the external sites and products — like PlugConnect or GoalVow Academies — where your VowHumans can be embedded, once you enable a VowHuman for them from its own profile.</p></section>
      )}
      <section className="application-grid">
        {apps.map((app) => {
          const enabledHumans = links.filter((l) => l.application_id === app.id && l.enabled);
          return (
            <article className="application-card" key={app.id}>
              <div className="app-logo coral">{app.name.slice(0, 2).toUpperCase()}</div>
              <div className="application-head">
                <div><h2>{app.name}</h2><p>{app.slug}</p></div>
                <StatusPill tone={app.status === 'active' ? 'good' : 'muted'}>{app.status}</StatusPill>
              </div>
              <div className="app-stats"><span><small>VowHumans enabled</small><strong>{enabledHumans.length}</strong></span></div>
              {enabledHumans.length > 0 && (
                <div className="chip-toggle-row">
                  {enabledHumans.map((l) => {
                    const human = humansList.find((h) => h.id === l.digital_human_id);
                    return <span className="chip-toggle active" key={l.digital_human_id}>{human?.name ?? 'VowHuman'}</span>;
                  })}
                </div>
              )}
              <p className="panel-note">Manage which VowHumans use this application from each digital human&rsquo;s own profile.</p>
              <div className="embed-origins-block">
                {editingOriginsId === app.id ? (
                  <>
                    <label className="embed-origins-label">Allowed embed origins<small>One per line, e.g. https://plugconnect.com — leave blank to allow embedding from anywhere.</small></label>
                    <textarea className="embed-origins-textarea" value={originsDraft} onChange={(e) => setOriginsDraft(e.target.value)} placeholder="https://plugconnect.com" rows={3} />
                    <div className="editor-actions">
                      <button className="primary-button" type="button" disabled={savingOrigins} onClick={() => saveOrigins(app.id)}>{savingOrigins ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}Save</button>
                      <button className="plain-button" type="button" onClick={() => setEditingOriginsId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <button className="plain-button" type="button" onClick={() => startEditingOrigins(app)}>
                    <LockKeyhole size={13} />
                    {(app.settings?.allowed_embed_origins?.length ?? 0) > 0
                      ? `${app.settings!.allowed_embed_origins!.length} allowed origin${app.settings!.allowed_embed_origins!.length === 1 ? '' : 's'}`
                      : 'Open to any origin — click to restrict'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <PanelTitle title="Connect an application" eyebrow="External sites your VowHumans can serve" />
        <form className="form-grid two" onSubmit={submitCreate}>
          <label className="full">Application name<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. PlugConnect" /></label>
          <div className="full chip-toggle-row">
            {applications.map((app) => <button type="button" key={app.name} className="chip-toggle" onClick={() => setNewName(app.name)}>{app.name}</button>)}
          </div>
          <button className="primary-button" type="submit" disabled={creating}>{creating ? <RefreshCw size={17} className="spin" /> : <AppWindow size={17} />}{creating ? 'Connecting…' : 'Connect application'}</button>
        </form>
      </section>
      <section className="panel integration-principle"><span><LockKeyhole size={23}/></span><div><p className="eyebrow">Server-to-server only</p><h2>Keys never visit the browser.</h2><p>Applications receive scoped service credentials and short-lived room tokens. Persona overrides stay versioned per application.</p></div><Link href="/studio/api-keys" className="secondary-button">Manage API keys</Link></section>
    </div>
  );
}

const usageGrains: { label: string; bars: number[]; steps: string[] }[] = [
  { label: "Monthly", bars: [38,51,44,72,64,81,70,92,74,61,88,77], steps: ['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'] },
  { label: "Weekly", bars: [46,58,39,67,72,80,63,75,69,84,58,91], steps: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'] },
  { label: "Daily", bars: [52,60,48,55,71,66,44,59,77,63,70,49], steps: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Mon','Tue','Wed','Thu','Fri'] },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function Usage() {
  const [grainIndex, setGrainIndex] = useState(0);
  const grain = usageGrains[grainIndex];
  return <div className="content-stack"><section className="metric-grid">{[['Session minutes','0','Usage source not connected'],['Realtime audio','0 min','Provider disabled'],['Presenter jobs','0','Queue not connected'],['Estimated cost','R 0','No provider invoice source']].map(([label,value,note])=><article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</section><section className="split-grid wide-left"><div className="panel usage-chart"><PanelTitle title="Sample session-volume shape" eyebrow="Illustrative data only" action={<button className="table-action" onClick={() => setGrainIndex((i) => (i + 1) % usageGrains.length)}>{grain.label} <ChevronRight size={14}/></button>}/><div className="chart-area"><div className="chart-y"><span>3k</span><span>2k</span><span>1k</span><span>0</span></div><div className="bars">{grain.bars.map((bar,index)=><div key={index}><i style={{height:`${bar}%`}}/><small>{grain.steps[index]}</small></div>)}</div></div></div><div className="panel provider-cost"><PanelTitle title="Provider cost categories" eyebrow="No live costs loaded"/>{[['Realtime voice','R 0','Not connected','coral'],['Transcription','R 0','Disabled','cyan'],['Language models','R 0','Disabled','lime'],['Storage + media','R 0','Not connected','violet']].map(([name,cost,share,tone])=><div className="cost-row" key={name}><i className={tone}/><span><b>{name}</b><small>{share}</small></span><strong>{cost}</strong></div>)}<div className="budget-meter"><span><i style={{width:'0%'}}/></span><small>No production budget source connected</small></div></div></section></div>;
}

const GESTURE_FEATURE_DEFAULTS: Record<string, { label: string; hasRange: boolean; defaultEnabled: boolean; defaultRange: string }> = {
  blinking: { label: 'Blinking', hasRange: true, defaultEnabled: true, defaultRange: '4–7s' },
  head_tilt: { label: 'Head tilt', hasRange: true, defaultEnabled: true, defaultRange: '±3°' },
  head_nod: { label: 'Head nod / shake', hasRange: true, defaultEnabled: true, defaultRange: '±4°' },
  micro_expressions: { label: 'Micro-expressions', hasRange: false, defaultEnabled: true, defaultRange: '' },
  gaze_shift: { label: 'Gaze shift', hasRange: false, defaultEnabled: true, defaultRange: '' },
  breathing_sway: { label: 'Breathing / idle sway', hasRange: false, defaultEnabled: true, defaultRange: '' },
  hand_gestures: { label: 'Hand gestures', hasRange: false, defaultEnabled: false, defaultRange: '' },
};

type FaceAsset = { id: string; media_type: string; detector_provider: string | null; preprocessing_state: string; state: string };
type FaceAssignment = { human_slug: string; face_asset_id: string };

function FaceLibrary() {
  const [faces, setFaces] = useState<FaceAsset[]>([]);
  const [assignments, setAssignments] = useState<FaceAssignment[]>([]);
  const [realHumans, setRealHumans] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'generate' | 'upload'>('generate');
  const [prompt, setPrompt] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const [facesRes, assignmentsRes, humansRes] = await Promise.all([
      fetch('/api/v1/faces').then(r => r.json()).catch(() => null),
      fetch('/api/v1/face-assignments').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (facesRes?.success) setFaces(facesRes.data.items);
    if (assignmentsRes?.success) setAssignments(assignmentsRes.data.items);
    if (humansRes?.success) setRealHumans(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused by user-triggered handlers below
  useEffect(() => { refresh(); }, []);

  async function assignFace(humanSlug: string, faceAssetId: string) {
    setBusyId(faceAssetId);
    await fetch('/api/v1/face-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanSlug, face_asset_id: faceAssetId || null }) }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function deleteFace(id: string) {
    setBusyId(id);
    await fetch(`/api/v1/faces/${id}`, { method: 'DELETE' }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    try {
      let res: Response;
      if (addMode === 'upload') {
        if (!addFile) { setError('Choose an image file to upload.'); setAdding(false); return; }
        const form = new FormData();
        form.set('file', addFile);
        res = await fetch('/api/v1/faces', { method: 'POST', body: form });
      } else {
        if (!prompt.trim() || prompt.trim().length < 10) { setError('Describe the face you want generated (at least 10 characters).'); setAdding(false); return; }
        res = await fetch('/api/v1/faces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim() }) });
      }
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.message || 'Could not add this face.');
      setPrompt(''); setAddFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this face.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="content-stack">
      <section className="asset-intro"><span><Fingerprint size={26} /></span><div><p className="eyebrow">Independent identity layer</p><h2>Face asset library</h2><p>Generate an original AI portrait or upload your own. Publication always checks current permissions and revocation status.</p></div></section>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && faces.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><Fingerprint size={24} /></span><p className="eyebrow">No face assets yet</p><h2>Add your first face</h2><p>Describe a fictional person for an AI-generated portrait, or upload your own image, using the form below.</p></section>
      )}
      <section className="asset-card-grid">
        {faces.map((face) => {
          const assigned = assignments.find((a) => a.face_asset_id === face.id);
          return (
            <article className="panel asset-card" key={face.id}>
              <div className="asset-card-top">
                <StatusPill tone={face.detector_provider === 'gpt-image-1' ? 'good' : 'muted'}>{face.detector_provider === 'gpt-image-1' ? 'AI-generated' : 'Uploaded'}</StatusPill>
                <button className="icon-button" aria-label="Delete face asset" onClick={() => deleteFace(face.id)} disabled={busyId === face.id}><Trash2 size={16} /></button>
              </div>
              <div className="face-asset-preview"><Image src={`/api/v1/faces/${face.id}/image`} alt="" fill sizes="200px" unoptimized /></div>
              <div className="asset-detail"><span>{face.media_type}</span></div>
              <label className="full">Assign to digital human
                {/* Real digital humans only — presenter-projects, live sessions and
                    the digital-human profile page all join face assignments on a real
                    digital_humans.id, so a catalogue-slug assignment (e.g. the static
                    "Thandi Mokoena" demo entry, id "thandi-mokoena") can never match a
                    real digital human of the same display name and silently goes
                    nowhere — no feature reads it. Listing both under identical names
                    with no visual distinction was a guaranteed mis-pick. */}
                <select value={assigned?.human_slug ?? ''} onChange={(event) => { const slug = event.target.value; if (slug) assignFace(slug, face.id); }} disabled={busyId === face.id}>
                  <option value="">Not assigned</option>
                  {realHumans.map((human) => <option key={human.id} value={human.id}>{human.name}{assignments.find((a) => a.human_slug === human.id && a.face_asset_id !== face.id) ? ' (has a face)' : ''}</option>)}
                </select>
                {realHumans.length === 0 && <small>Create a digital human first, then assign this face to it.</small>}
              </label>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <PanelTitle title="Add a face asset" eyebrow="Generate or upload" />
        <form className="form-grid two" onSubmit={submitAdd}>
          <label>Source
            <select value={addMode} onChange={(e) => setAddMode(e.target.value as 'generate' | 'upload')}>
              <option value="generate">Generate with AI</option>
              <option value="upload">Upload my own photo</option>
            </select>
          </label>
          {addMode === 'generate' ? (
            <label className="full">Describe the person<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Warm, professional South African woman in her 30s, business attire" /></label>
          ) : (
            <label className="full">Image file (max 8MB)<input type="file" accept="image/*" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} /></label>
          )}
          <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add face asset'}</button>
        </form>
      </section>
    </div>
  );
}

type GestureProfile = { id: string; name: string; state: string; state_config: { features: Record<string, { enabled: boolean; range: string }> } };
type GestureAssignment = { human_slug: string; gesture_profile_id: string };

function GestureLibrary() {
  const [profiles, setProfiles] = useState<GestureProfile[]>([]);
  const [assignments, setAssignments] = useState<GestureAssignment[]>([]);
  const [realHumans, setRealHumans] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, { enabled: boolean; range: string }>>(() =>
    Object.fromEntries(Object.entries(GESTURE_FEATURE_DEFAULTS).map(([key, def]) => [key, { enabled: def.defaultEnabled, range: def.defaultRange }]))
  );
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const [profilesRes, assignmentsRes, humansRes] = await Promise.all([
      fetch('/api/v1/gesture-profiles').then(r => r.json()).catch(() => null),
      fetch('/api/v1/gesture-assignments').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (profilesRes?.success) setProfiles(profilesRes.data.items);
    if (assignmentsRes?.success) setAssignments(assignmentsRes.data.items);
    if (humansRes?.success) setRealHumans(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused by user-triggered handlers below
  useEffect(() => { refresh(); }, []);

  async function assignProfile(humanSlug: string, gestureProfileId: string) {
    setBusyId(gestureProfileId);
    await fetch('/api/v1/gesture-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanSlug, gesture_profile_id: gestureProfileId || null }) }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function deleteProfile(id: string) {
    setBusyId(id);
    await fetch(`/api/v1/gesture-profiles/${id}`, { method: 'DELETE' }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give the gesture profile a name.'); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/gesture-profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), features: selectedFeatures }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create this gesture profile.');
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this gesture profile.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="content-stack">
      <section className="asset-intro"><span><Sparkles size={26} /></span><div><p className="eyebrow">Motion with restraint</p><h2>Gesture profile library</h2><p>Choose which natural movements a digital human uses, and how pronounced each one is.</p></div></section>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && profiles.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><Sparkles size={24} /></span><p className="eyebrow">No gesture profiles yet</p><h2>Create your first profile</h2><p>Pick which movements to include using the form below — every feature is on by default except hand gestures.</p></section>
      )}
      <section className="asset-card-grid">
        {profiles.map((profile) => {
          const assigned = assignments.find((a) => a.gesture_profile_id === profile.id);
          const enabledFeatures = Object.entries(profile.state_config?.features ?? {}).filter(([, v]) => v.enabled);
          return (
            <article className="panel asset-card" key={profile.id}>
              <div className="asset-card-top">
                <span className="empty-icon"><Sparkles size={21} /></span>
                <button className="icon-button" aria-label="Delete gesture profile" onClick={() => deleteProfile(profile.id)} disabled={busyId === profile.id}><Trash2 size={16} /></button>
              </div>
              <h2>{profile.name}</h2>
              <div className="layer-flow">
                {enabledFeatures.map(([key, v]) => <span key={key}>{GESTURE_FEATURE_DEFAULTS[key]?.label ?? key}{v.range ? ` · ${v.range}` : ''}</span>)}
              </div>
              <label className="full">Assign to digital human
                <select value={assigned?.human_slug ?? ''} onChange={(event) => { const slug = event.target.value; if (slug) assignProfile(slug, profile.id); }} disabled={busyId === profile.id}>
                  <option value="">Not assigned</option>
                  {realHumans.map((human) => <option key={human.id} value={human.id}>{human.name}{assignments.find((a) => a.human_slug === human.id && a.gesture_profile_id !== profile.id) ? ' (has a profile)' : ''}</option>)}
                </select>
              </label>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <PanelTitle title="Create a gesture profile" eyebrow="Toggle features and adjust ranges" />
        <form className="form-grid two" onSubmit={submitCreate}>
          <label className="full">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warm and attentive" /></label>
          <div className="full settings-switches">
            {Object.entries(GESTURE_FEATURE_DEFAULTS).map(([key, def]) => (
              <div key={key}>
                <span>
                  <strong>{def.label}</strong>
                  {def.hasRange && selectedFeatures[key]?.enabled && (
                    <input
                      className="gesture-range-input"
                      value={selectedFeatures[key]?.range ?? ''}
                      onChange={(e) => setSelectedFeatures((prev) => ({ ...prev, [key]: { ...prev[key], range: e.target.value } }))}
                      placeholder={def.defaultRange}
                    />
                  )}
                </span>
                <button type="button" className="secondary-button" onClick={() => setSelectedFeatures((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key]?.enabled } }))}>
                  <StatusPill tone={selectedFeatures[key]?.enabled ? 'good' : 'muted'}>{selectedFeatures[key]?.enabled ? 'On' : 'Off'}</StatusPill>
                </button>
              </div>
            ))}
          </div>
          <button className="primary-button" type="submit" disabled={creating}>{creating ? <RefreshCw size={17} className="spin" /> : <Sparkles size={17} />}{creating ? 'Creating…' : 'Create gesture profile'}</button>
        </form>
      </section>
    </div>
  );
}

type Voice = { id: string; name: string; provider: 'openai' | 'custom'; provider_voice_id: string | null; language: string; is_custom: boolean; state: string };
type VoiceAssignment = { human_slug: string; voice_id: string; voice_name: string };

function VoiceLibrary() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [assignments, setAssignments] = useState<VoiceAssignment[]>([]);
  const [providerVoices, setProviderVoices] = useState<string[]>([]);
  const [realHumans, setRealHumans] = useState<DigitalHumanSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'provider' | 'upload'>('provider');
  const [addName, setAddName] = useState('');
  const [addLanguage, setAddLanguage] = useState('en-ZA');
  const [addProviderVoice, setAddProviderVoice] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function refresh() {
    const [voicesRes, assignmentsRes, humansRes] = await Promise.all([
      fetch('/api/v1/voices').then(r => r.json()).catch(() => null),
      fetch('/api/v1/voice-assignments').then(r => r.json()).catch(() => null),
      fetch('/api/v1/digital-humans').then(r => r.json()).catch(() => null),
    ]);
    if (voicesRes?.success) {
      setVoices(voicesRes.data.items);
      setProviderVoices(voicesRes.data.available_provider_voices ?? []);
      if (!addProviderVoice && voicesRes.data.available_provider_voices?.[0]) setAddProviderVoice(voicesRes.data.available_provider_voices[0]);
    }
    if (assignmentsRes?.success) setAssignments(assignmentsRes.data.items);
    if (humansRes?.success) setRealHumans(humansRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused by user-triggered handlers below
  useEffect(() => { refresh(); }, []);

  async function playSample(voice: Voice) {
    setError(null);
    audioRef.current?.pause();
    setPlayingId(voice.id);
    try {
      const res = await fetch(`/api/v1/voices/${voice.id}/sample`);
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem.message || 'Could not play this sample.');
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPlayingId((current) => (current === voice.id ? null : current));
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not play this sample.');
      setPlayingId(null);
    }
  }

  async function assignVoice(humanSlug: string, voiceId: string) {
    setBusyId(voiceId);
    await fetch('/api/v1/voice-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ human_slug: humanSlug, voice_id: voiceId || null }) }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function deleteVoice(id: string) {
    setBusyId(id);
    await fetch(`/api/v1/voices/${id}`, { method: 'DELETE' }).catch(() => {});
    await refresh();
    setBusyId(null);
  }

  async function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!addName.trim()) { setError('Give the voice a name.'); return; }
    setAdding(true);
    setError(null);
    try {
      let res: Response;
      if (addMode === 'upload') {
        if (!addFile) { setError('Choose an audio file to upload.'); setAdding(false); return; }
        const form = new FormData();
        form.set('name', addName.trim());
        form.set('language', addLanguage);
        form.set('file', addFile);
        res = await fetch('/api/v1/voices', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/v1/voices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: addName.trim(), language: addLanguage, provider_voice_id: addProviderVoice }) });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not add this voice.');
      setAddName(''); setAddFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this voice.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="content-stack">
      <section className="asset-intro"><span><AudioLines size={26} /></span><div><p className="eyebrow">Independent identity layer</p><h2>Voice library</h2><p>Provider voice or your own uploaded asset. Publication always checks current permissions and revocation status.</p></div></section>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {loaded && voices.length === 0 && (
        <section className="panel ingestion-card"><span className="empty-icon"><AudioLines size={24} /></span><p className="eyebrow">No voices yet</p><h2>Add your first voice</h2><p>Pick one of your OpenAI account&apos;s voices, or upload your own recording, using the form below.</p></section>
      )}
      <section className="asset-card-grid">
        {voices.map((voice) => {
          const assigned = assignments.find((a) => a.voice_id === voice.id);
          return (
            <article className="panel asset-card" key={voice.id}>
              <div className="asset-card-top">
                <span className="empty-icon"><AudioLines size={21} /></span>
                <StatusPill tone={voice.is_custom ? 'muted' : 'good'}>{voice.is_custom ? 'Uploaded' : 'Provider voice'}</StatusPill>
              </div>
              <h2>{voice.name}</h2>
              <p>{voice.is_custom ? 'Your uploaded recording' : `OpenAI · ${voice.provider_voice_id}`}</p>
              <div className="asset-detail">
                <span>{voice.language}</span>
                <button className="icon-button" aria-label={`Delete ${voice.name}`} onClick={() => deleteVoice(voice.id)} disabled={busyId === voice.id}><Trash2 size={16} /></button>
              </div>
              <button className="secondary-button" onClick={() => playSample(voice)} disabled={playingId === voice.id}>
                {playingId === voice.id ? <RefreshCw size={15} className="spin" /> : <Play size={15} />}{playingId === voice.id ? 'Playing…' : 'Play sample'}
              </button>
              <label className="full">Assign to digital human
                <select value={assigned?.human_slug ?? ''} onChange={(event) => { const slug = event.target.value; if (slug) assignVoice(slug, voice.id); }} disabled={busyId === voice.id}>
                  <option value="">Not assigned</option>
                  {realHumans.map((human) => <option key={human.id} value={human.id}>{human.name}{assignments.find((a) => a.human_slug === human.id && a.voice_id !== voice.id) ? ' (has a voice)' : ''}</option>)}
                </select>
              </label>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <PanelTitle title="Add a voice" eyebrow="Provider voice or your own upload" />
        <form className="form-grid two" onSubmit={submitAdd}>
          <label className="full">Name<input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Warm and professional" /></label>
          <label>Language<LanguageSelect value={addLanguage} onChange={setAddLanguage} capability="tts" showStatusBadge /></label>
          <label>Source
            <select value={addMode} onChange={(e) => setAddMode(e.target.value as 'provider' | 'upload')}>
              <option value="provider">Pick a provider voice</option>
              <option value="upload">Upload my own recording</option>
            </select>
          </label>
          {addMode === 'provider' ? (
            <label className="full">Provider voice<select value={addProviderVoice} onChange={(e) => setAddProviderVoice(e.target.value)}>{providerVoices.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          ) : (
            <label className="full">Audio file (max 8MB)<input type="file" accept="audio/*" onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} /></label>
          )}
          <button className="primary-button" type="submit" disabled={adding}>{adding ? <RefreshCw size={17} className="spin" /> : <UploadCloud size={17} />}{adding ? 'Adding…' : 'Add voice'}</button>
        </form>
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function ApiKeys() {
  const [created,setCreated]=useState(false);
  return <div className="content-stack"><section className="security-callout"><span><KeyRound size={27}/></span><div><p className="eyebrow">Hash-only credentials</p><h2>Scoped access, shown once.</h2><p>Raw service keys are never stored or placed in client-side code. Rotate immediately if a key may be exposed.</p></div></section><section className="panel"><PanelTitle title="Service API keys" eyebrow="3 active"/><div className="data-table keys-table"><div className="table-row table-head"><span>Name</span><span>Prefix</span><span>Scopes</span><span>Last used</span><span>Status</span></div>{[['PlugConnect production','vhm_pc_••••8A2F','sessions:create · usage:read-own','4 min ago'],['GoalVow Academies','vhm_ga_••••51BE','sessions:create · renders:create','18 min ago'],['VowLMS sandbox','vhm_vl_••••AA90','sessions:create','3 days ago']].map(row=><div className="table-row" key={row[0]}><span><b>{row[0]}</b></span><span><code>{row[1]}</code></span><span>{row[2]}</span><span>{row[3]}</span><span><StatusPill>Active</StatusPill></span></div>)}{created&&<div className="table-row new-row"><span><b>Development key draft</b></span><span><code>vhm_dev_••••NEW</code></span><span>health:read</span><span>Never</span><span><StatusPill tone="warn">Draft</StatusPill></span></div>}</div></section><section className="split-grid"><div className="panel"><EmptyAction icon={KeyRound} title="Issue a development key" copy="This local action creates a UI draft only—no raw credential is generated." button={created?'Draft ready':'Prepare key draft'} onAction={()=>setCreated(true)}/></div><div className="panel safety-checklist"><PanelTitle title="Key hygiene" eyebrow="Required"/>{['Minimum 32 random bytes','Explicit scopes and application binding','Expiry or rotation date','Rate-limit profile','Revocation audit event'].map(item=><div key={item}><CircleCheck size={17}/><span>{item}</span></div>)}</div></section></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function WebhooksPage() {
  const [tested,setTested]=useState(false);
  return <div className="content-stack"><section className="panel"><PanelTitle title="Webhook endpoints" eyebrow="HMAC signed · retry safe"/><div className="webhook-list">{[['PlugConnect lifecycle','https://api.plugconnect.example/vowhumans/events','session.completed · session.deleted','Healthy'],['GoalVow Academies','https://academy.example/api/vowhumans/webhook','render.completed · render.failed','Healthy'],['Development inspector','https://example.invalid/hooks/vowhumans','All sandbox events','Paused']].map(row=><div className="webhook-row" key={row[0]}><span className="empty-icon"><Webhook size={19}/></span><div><strong>{row[0]}</strong><code>{row[1]}</code><small>{row[2]}</small></div><StatusPill tone={row[3]==='Paused'?'warn':'good'}>{row[3]}</StatusPill><IconMenuButton className="icon-button" label={row[0]} /></div>)}</div></section><section className="split-grid"><div className="panel webhook-test"><p className="eyebrow">Delivery tester</p><h2>Verify without sending private content</h2><p>Generate a local signed event envelope with synthetic identifiers only.</p><button className="primary-button" onClick={()=>setTested(true)}>{tested?<Check size={17}/>:<RefreshCw size={17}/>} {tested?'Signature verified':'Run local verification'}</button></div><div className="panel code-panel"><div className="code-dots"><i/><i/><i/></div><pre>{tested?`HTTP/1.1 200 OK\nX-VowHumans-Event: evt_test_01\n\n{ "verified": true, "replayed": false }`:`X-VowHumans-Signature: t=...,v1=...\nX-VowHumans-Event: evt_...\n\nNo transcript fields are included.`}</pre></div></section></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function Safety() {
  const controls=[['Visible AI disclosure','100% coverage','Every session, preview and export surface',Sparkles],['Identity consent gate','3 approved · 1 blocked','Revocation stops new work immediately',UserCheck],['Private transcript policy','Candidate/learner owned','No employer practice-answer access',LockKeyhole],['Moderation pipeline','Mock checks active','Provider moderation adapter ready',ShieldCheck],['Knowledge boundaries','141 cited chunks','Uploads never become system instructions',BookOpenText],['Retention controls','30 day default','Deletion queue contract enabled',Clock3]];
  return <div className="content-stack"><section className="safety-hero"><div><span className="safety-shield"><ShieldCheck size={34}/></span><p className="eyebrow">Safety posture</p><h2>Trust is a system property.</h2><p>VowHumans makes consent, disclosure and data boundaries visible—and keeps unsafe capabilities out of the product.</p></div><div className="safety-score"><span>CONTROL COVERAGE</span><strong>96<small>/100</small></strong><StatusPill>Healthy foundation</StatusPill></div></section><section className="safety-control-grid">{controls.map(([name,state,copy,Icon])=><article className="panel" key={String(name)}><span className="empty-icon"><Icon size={20}/></span><StatusPill>Enforced</StatusPill><h2>{String(name)}</h2><strong>{String(state)}</strong><p>{String(copy)}</p></article>)}</section><section className="prohibited-panel"><PanelTitle title="Never supported" eyebrow="Product-level prohibitions"/><div className="prohibited-grid">{['Unauthorised face or voice cloning','Public-figure impersonation','Hidden AI or covert recording','Appearance-based employment scoring','Face-based emotion or honesty detection','Medical diagnosis or clinical claims','Stolen source media','Employer access to practice answers'].map(item=><span key={item}><X size={14}/>{item}</span>)}</div></section></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function AuditLogs() {
  const events=[['Persona published','Naledi M.','Professional Practice Interviewer v3','persona.publish','Today 19:52'],['Session consent recorded','PlugConnect service','ses_01K19A…','consent.transcript.accept','Today 19:41'],['Knowledge source indexed','System worker','Interview Fundamentals','knowledge.index','Today 19:20'],['Identity approval reviewed','Naledi M.','GoalVow Tutor','identity.approve','Yesterday 16:08'],['API key scope updated','Platform admin','VowLMS sandbox','api_key.scope.update','30 Jul 14:22'],['Deletion request completed','System worker','del_01K02F…','deletion.complete','29 Jul 11:04']];
  const actors = ["All actors", ...Array.from(new Set(events.map((e) => e[1])))];
  const [actorIndex, setActorIndex] = useState(0);
  const activeActor = actors[actorIndex];
  const visibleEvents = activeActor === "All actors" ? events : events.filter((e) => e[1] === activeActor);
  return <div className="content-stack"><section className="panel"><div className="audit-toolbar"><div><p className="eyebrow">Append-only event history</p><h2>Organisation audit trail</h2></div><div><button onClick={() => setActorIndex((i) => (i + 1) % actors.length)}>{activeActor} <ChevronRight size={14}/></button><InlineAction idleLabel={<>Last 30 days <ChevronRight size={14}/></>} doneLabel="Showing last 30 days" /></div></div><div className="audit-list">{visibleEvents.map(event=><div className="audit-event" key={event[0]+event[4]}><span className="audit-icon"><Activity size={17}/></span><div><strong>{event[0]}</strong><p>{event[2]}</p><code>{event[3]}</code></div><span><b>{event[1]}</b><time>{event[4]}</time></span></div>)}</div></section></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- superseded by the persisted control-plane implementation imported below
function SettingsPage() {
  const user = useAuth();
  const [saved,setSaved]=useState(false);
  const [retention,setRetention]=useState('30 days');
  const [tab, setTab] = useState<"organisation" | "data" | "flags" | "provider" | "languages" | "notifications">("organisation");
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({ "Session completed": true, "Consent expiring": true, "Webhook failures": true, "Weekly digest": false });
  const tabs: [typeof tab, string][] = [["organisation", "Organisation"], ["data", "Data & retention"], ["flags", "Feature flags"], ["provider", "Provider health"], ["languages", "Languages"], ["notifications", "Notifications"]];
  return <div className="content-stack"><section className="settings-layout"><nav className="settings-nav">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav><div className="panel settings-form">
    {tab === "organisation" && <><PanelTitle title="Organisation defaults" eyebrow={user.organisationName}/><div className="form-grid two"><label>Organisation name<input defaultValue={user.organisationName}/></label><label>Primary region<select defaultValue="South Africa"><option>South Africa</option><option>European Union</option></select></label><label>Default language<select defaultValue="en-ZA">{[['en-ZA','English (South Africa)'],['zu-ZA','isiZulu'],['xh-ZA','isiXhosa'],['af-ZA','Afrikaans'],['nso-ZA','Sepedi'],['tn-ZA','Setswana'],['st-ZA','Sesotho'],['ts-ZA','Xitsonga'],['ss-ZA','siSwati'],['ve-ZA','Tshivenda'],['nr-ZA','isiNdebele']].map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div><p className="panel-note">Per-language enablement, providers and voices are configured on the Languages tab.</p><div className="settings-switches">{[['Visible AI disclosure','Locked on','Cannot be disabled'],['Transcript capture','Consent required','Per-session decision'],['Recording','Off','Requires separate consent'],['GPU avatar modes','Off','Licence and health gate']].map(([label,state,note])=><div key={label}><span><strong>{label}</strong><small>{note}</small></span><StatusPill tone={state==='Off'?'muted':'good'}>{state}</StatusPill></div>)}</div><button className="primary-button" onClick={()=>setSaved(true)}>{saved?<Check size={17}/>:null}{saved?'Settings saved':'Save organisation settings'}</button></>}
    {tab === "data" && <><PanelTitle title="Data & retention" eyebrow="Applies organisation-wide"/><div className="form-grid two"><label>Transcript retention<select value={retention} onChange={(e) => setRetention(e.target.value)}><option>Session only</option><option>7 days</option><option>30 days</option><option>90 days</option></select></label></div><div className="settings-switches"><div><span><strong>Deletion queue</strong><small>Removes chunks, embeddings and transcripts on schedule</small></span><StatusPill>Enabled</StatusPill></div><div><span><strong>Recordings</strong><small>Requires separate per-session consent</small></span><StatusPill tone="muted">Off</StatusPill></div><div><span><strong>Current retention window</strong><small>Applies to new sessions immediately</small></span><StatusPill>{retention}</StatusPill></div></div></>}
    {tab === "flags" && <><PanelTitle title="Feature flags" eyebrow="Exact mode status"/><div className="readiness-list">{readiness.map((item) => <div key={item.name}><span>{item.name}</span><StatusPill tone={item.tone}>{item.state}</StatusPill></div>)}</div><p className="panel-note"><CircleAlert size={16} /> GPU modes remain off until licences, CUDA and approved infrastructure are ready.</p></>}
    {tab === "provider" && <><PanelTitle title="Provider health" eyebrow="Boundaries enforced client-side"/><div className="health-grid">{[['LiveKit transport','Mock ready','good'],['OpenAI Realtime','Credentials needed','warn'],['Avatar worker','Audio fallback','good'],['Transcript store','Consent gated','good']].map(([name,state,tone])=><div key={name}><span>{name}</span><StatusPill tone={tone}>{state}</StatusPill></div>)}</div></>}
    {tab === "languages" && <LanguagesSettingsTab />}
    {tab === "notifications" && <><PanelTitle title="Notifications" eyebrow="Delivered in-app only in preview"/><div className="settings-switches">{Object.entries(notifPrefs).map(([label, on]) => <div key={label}><span><strong>{label}</strong></span><button className="secondary-button" onClick={() => setNotifPrefs((prev) => ({ ...prev, [label]: !prev[label] }))}><StatusPill tone={on ? "good" : "muted"}>{on ? "On" : "Off"}</StatusPill></button></div>)}</div></>}
  </div></section></div>;
}

type LanguageAdminRow = {
  code: string; english_name: string; native_name: string; enabled: boolean;
  default_voice_id: string | null; preferred_stt_provider: string | null; preferred_tts_provider: string | null;
  preferred_realtime_provider: string | null; fallback_language_code: string | null;
  capabilities: { capability: string; provider: string; status: string; notes: string }[];
  avg_latency_ms: number | null; recent_failures: number; validation_reviews: number; validation_passed: number;
};

function bestStatusForRow(row: LanguageAdminRow, capability: string): string {
  const relevant = row.capabilities.filter((c) => c.capability === capability);
  const rank = ["production", "beta", "experimental", "degraded", "temporarily-unavailable", "unsupported"];
  if (relevant.length === 0) return "unsupported";
  return relevant.reduce((best, c) => (rank.indexOf(c.status) < rank.indexOf(best) ? c.status : best), "unsupported");
}

// Standalone Operate-menu page reusing the exact same real, DB-backed content as
// the Settings -> Languages tab (LanguagesSettingsTab, defined below) — both
// routes render identically live data, this just gives it its own sidebar entry
// since it's substantial enough to be worth finding without going through Settings.
function LanguagesPage() {
  return (
    <div className="content-stack">
      <section className="panel">
        <LanguagesSettingsTab />
      </section>
    </div>
  );
}

function LanguagesSettingsTab() {
  const [rows, setRows] = useState<LanguageAdminRow[]>([]);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    const [langRes, voiceRes, personaRes] = await Promise.all([
      fetch("/api/v1/languages").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/voices").then((r) => r.json()).catch(() => null),
      fetch("/api/v1/personas").then((r) => r.json()).catch(() => null),
    ]);
    if (langRes?.success) setRows(langRes.data.items);
    if (voiceRes?.success) setVoices(voiceRes.data.items);
    if (personaRes?.success) setPersonas(personaRes.data.items);
    setLoaded(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; refresh() is also reused after saves
  useEffect(() => { refresh(); }, []);

  async function updateLanguage(code: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/v1/languages/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => r.json()).catch(() => null);
    if (!res?.success) { setError(res?.message || "Could not save this language's settings."); return; }
    await refresh();
  }

  if (loaded && rows.length <= 1) {
    return (
      <>
        <PanelTitle title="Languages" eyebrow="South African official languages" />
        <p className="panel-note">Multilingual support isn&rsquo;t enabled in this environment (ENABLE_MULTILINGUAL). English continues to work exactly as before.</p>
      </>
    );
  }

  return (
    <>
      <PanelTitle title="Languages" eyebrow="Capability registry — honest per-language, per-capability status" />
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Language</th><th>Enabled</th><th>STT</th><th>Reasoning</th><th>TTS</th><th>Realtime</th><th>Default voice</th><th>Avg latency</th><th>Recent failures</th><th>Validation</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td>{row.english_name}</td>
                <td><button className="secondary-button" onClick={() => updateLanguage(row.code, { enabled: !row.enabled, default_voice_id: row.default_voice_id, preferred_stt_provider: row.preferred_stt_provider, preferred_tts_provider: row.preferred_tts_provider, preferred_realtime_provider: row.preferred_realtime_provider, fallback_language_code: row.fallback_language_code })}><StatusPill tone={row.enabled ? "good" : "muted"}>{row.enabled ? "Enabled" : "Disabled"}</StatusPill></button></td>
                <td><LanguageStatusBadge status={bestStatusForRow(row, "stt")} /></td>
                <td><LanguageStatusBadge status={bestStatusForRow(row, "reasoning")} /></td>
                <td><LanguageStatusBadge status={bestStatusForRow(row, "tts")} /></td>
                <td><LanguageStatusBadge status={bestStatusForRow(row, "realtime")} /></td>
                <td>
                  <select aria-label={`Default voice for ${row.english_name}`} value={row.default_voice_id ?? ""} onChange={(e) => updateLanguage(row.code, { enabled: row.enabled, default_voice_id: e.target.value || null, preferred_stt_provider: row.preferred_stt_provider, preferred_tts_provider: row.preferred_tts_provider, preferred_realtime_provider: row.preferred_realtime_provider, fallback_language_code: row.fallback_language_code })}>
                    <option value="">Not set</option>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </td>
                <td>{row.avg_latency_ms ? `${Math.round(row.avg_latency_ms)}ms` : "—"}</td>
                <td>{row.recent_failures > 0 ? <StatusPill tone="danger">{row.recent_failures}</StatusPill> : "0"}</td>
                <td>{row.validation_reviews > 0 ? `${row.validation_passed}/${row.validation_reviews} passed` : "No reviews yet"}</td>
                <td><button className="plain-button" type="button" onClick={() => setExpanded(expanded === row.code ? null : row.code)}>{expanded === row.code ? "Hide tests" : "Test & compare"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expanded && <LanguageTestPanel languageCode={expanded} personas={personas} />}
      <p className="panel-note"><CircleAlert size={16} /> Enabling a language here only controls whether your organisation offers it — it never changes the underlying capability status above, which only moves after real testing (see docs/SOUTH_AFRICAN_LANGUAGE_QA.md).</p>
    </>
  );
}

function LanguageTestPanel({ languageCode, personas }: { languageCode: string; personas: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<Record<string, unknown>[] | null>(null);
  const [benchmarkCapability, setBenchmarkCapability] = useState<string>("");
  const [testPhrase, setTestPhrase] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState("");
  const [testMessage, setTestMessage] = useState("Hello, can you help me?");
  const [personaReply, setPersonaReply] = useState<{ reply: string; language?: { status: string; used_fallback: boolean } } | null>(null);
  const [reviewScore, setReviewScore] = useState(3);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  async function compareProviders(capability: string) {
    setBusy(`benchmark-${capability}`);
    setBenchmarkResults(null);
    setBenchmarkCapability(capability);
    const res = await fetch("/api/v1/languages/benchmark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language_code: languageCode, capability }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.success) { setTestPhrase(res.data.test_phrase); setBenchmarkResults(res.data.results); }
  }

  async function testPersonaResponse() {
    if (!selectedPersona) return;
    setBusy("persona");
    setPersonaReply(null);
    const res = await fetch(`/api/v1/personas/${selectedPersona}/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: testMessage, language: languageCode }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.success) setPersonaReply(res.data);
  }

  async function toggleMicTest() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setBusy("mic");
        const form = new FormData();
        form.set("file", blob, "test.webm");
        form.set("language_code", languageCode);
        const res = await fetch("/api/v1/languages/test-transcription", { method: "POST", body: form }).then((r) => r.json()).catch(() => null);
        setBusy(null);
        setTranscript(res?.success ? res.data.text : res?.message || "Could not transcribe this recording.");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setTranscript("Microphone access was denied or is unavailable.");
    }
  }

  async function saveReview(provider: string, capability: string) {
    await fetch("/api/v1/language-reviews", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ language_code: languageCode, capability, provider, review_type: "admin_benchmark", score: reviewScore, notes: reviewNotes }),
    }).catch(() => {});
    setReviewSaved(true);
    window.setTimeout(() => setReviewSaved(false), 2500);
  }

  return (
    <div className="panel language-test-panel">
      <PanelTitle title={`Test & compare — ${languageCode}`} eyebrow="Real provider calls, nothing is auto-published" />

      <div className="editor-actions">
        <button className="secondary-button" type="button" onClick={toggleMicTest} disabled={busy === "mic"}>{recording ? "Stop recording" : "Test microphone"}</button>
        <button className="secondary-button" type="button" onClick={() => compareProviders("stt")} disabled={busy === "benchmark-stt"}>{busy === "benchmark-stt" ? "Comparing…" : "Compare STT providers"}</button>
        <button className="secondary-button" type="button" onClick={() => compareProviders("tts")} disabled={busy === "benchmark-tts"}>{busy === "benchmark-tts" ? "Comparing…" : "Compare TTS providers"}</button>
        <button className="secondary-button" type="button" onClick={() => compareProviders("translation")} disabled={busy === "benchmark-translation"}>{busy === "benchmark-translation" ? "Comparing…" : "Compare translation"}</button>
      </div>
      {transcript && <p className="panel-note">Transcription result: &ldquo;{transcript}&rdquo;</p>}

      {testPhrase && <p className="panel-note">Test phrase: &ldquo;{testPhrase}&rdquo;</p>}
      {benchmarkResults && (
        <div className="benchmark-grid">
          {benchmarkResults.map((r, i) => {
            const result = r as { provider: string; status: string; message?: string; text?: string; confidence?: string; registry_status?: string; audio_base64?: string; mime_type?: string; latency_ms?: number };
            return (
              <div key={i} className="panel benchmark-card">
                <strong>{result.provider}</strong>
                <StatusPill tone={result.status === "ok" ? "good" : result.status === "not_configured" ? "muted" : "danger"}>{result.status.replace(/_/g, " ")}</StatusPill>
                {result.status === "ok" && result.audio_base64 && <audio controls src={`data:${result.mime_type};base64,${result.audio_base64}`} />}
                {result.status === "ok" && result.text && <p>{result.text} {result.confidence === "low" && <em>(low confidence)</em>}</p>}
                {result.status === "error" && <small>{result.message}</small>}
                {result.status === "registry_only" && <small>Registry status: {result.registry_status}</small>}
                {result.latency_ms && <small>{result.latency_ms}ms</small>}
                {result.status === "ok" && (
                  <div className="review-form">
                    <label>Score<input type="number" min={1} max={5} value={reviewScore} onChange={(e) => setReviewScore(Number(e.target.value))} /></label>
                    <input placeholder="Notes (pronunciation, naturalness…)" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                    <button className="plain-button" type="button" onClick={() => saveReview(result.provider, benchmarkCapability)}>{reviewSaved ? "Saved" : "Record review"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="form-grid two">
        <label>Persona<select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)}><option value="">Choose a persona…</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Test message<input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
      </div>
      <button className="secondary-button" type="button" onClick={testPersonaResponse} disabled={!selectedPersona || busy === "persona"}>{busy === "persona" ? "Testing…" : "Test Digital Human response"}</button>
      {personaReply && (
        <div className="panel-note">
          <p>{personaReply.reply}</p>
          {personaReply.language && <small>Resolved status: {personaReply.language.status}{personaReply.language.used_fallback ? " (fell back — this language wasn't directly usable)" : ""}</small>}
        </div>
      )}
    </div>
  );
}

export function StudioView({ section }: { section: string }) {
  switch(section){
    case 'dashboard': return <ProductionDashboard/>;
    case 'digital-humans': return <DigitalHumans/>;
    case 'personas': return <Personas/>;
    case 'knowledge': return <Knowledge/>;
    case 'voices': return <VoiceLibrary/>;
    case 'faces': return <FaceLibrary/>;
    case 'gesture-profiles': return <GestureLibrary/>;
    case 'live-sessions': return <LiveSessions/>;
    case 'presenter-studio': return <PresenterStudio/>;
    case 'applications': return <Applications/>;
    case 'usage': return <ProductionUsage/>;
    case 'identity-consent': return <ProductionIdentityConsent/>;
    case 'api-keys': return <ProductionApiKeys/>;
    case 'webhooks': return <ProductionWebhooks/>;
    case 'safety': return <ProductionSafety/>;
    case 'audit-logs': return <ProductionAuditLogs/>;
    case 'languages': return <LanguagesPage/>;
    case 'settings': return <ProductionSettings/>;
    default: return null;
  }
}
