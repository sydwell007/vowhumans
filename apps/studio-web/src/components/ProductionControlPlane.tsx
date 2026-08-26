"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Activity, ArrowRight, Bot, Check, CircleAlert, CircleCheck, Copy, Download,
  Fingerprint, KeyRound, LockKeyhole, Play, RefreshCw, ShieldCheck, Sparkles,
  Trash2, UserCheck, Webhook, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { humans } from "@/data/platform";
import { useAuth } from "./AuthContext";
import { StatusPill } from "./StatusPill";
import { StudioHomeChooser } from "./StudioHomeChooser";
import { MySetupProgress } from "./MySetupProgress";
import { NextBestAction } from "./NextBestAction";

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string; code?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.message ?? `Request failed (${response.status}).`);
  }
  return payload.data;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ViewState({ loading, error, empty, action }: { loading: boolean; error?: string | null; empty?: string; action?: React.ReactNode }) {
  if (loading) return <div className="empty-action"><RefreshCw className="spin" size={20} /><div><strong>Loading live workspace data</strong><p>Reading your organisation records.</p></div></div>;
  if (error) return <div className="panel-note"><CircleAlert size={16} /> {error}</div>;
  if (empty) return <div className="empty-action"><CircleCheck size={20} /><div><strong>Nothing here yet</strong><p>{empty}</p>{action}</div></div>;
  return null;
}

function PanelTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

type DashboardData = {
  counts: { digital_humans: number; published_personas: number; sessions_today: number; live_now: number; pending_identities: number; active_consents: number; usage_cost_minor: number; usage_events: number };
  humans: { id: string; name: string; role: string; disclosure: string; state: string; created_at: string; face_asset_id: string | null }[];
  activity: { action: string; resource_type: string; occurred_at: string }[];
  gateway: { gateway_reachable: boolean; realtime_configured: boolean; realtime_check_available: boolean; avatar_configured: boolean };
};

function HumanThumb({ human }: { human: DashboardData["humans"][number] }) {
  const [failed, setFailed] = useState(false);
  return <span className="human-thumb">
    {human.face_asset_id && !failed
      ? <Image src={`/api/v1/faces/${human.face_asset_id}/image`} alt={`${human.name} portrait`} fill sizes="46px" unoptimized onError={() => setFailed(true)} />
      : <Bot size={20} />}
  </span>;
}

export function ProductionDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<DashboardData>("/api/v1/dashboard").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  const counts = data?.counts;
  const metrics: [string, string | number, string, LucideIcon][] = counts ? [
    ["Digital humans", counts.digital_humans, "Persisted in this workspace", Bot],
    ["Sessions today", counts.sessions_today, `${counts.live_now} currently live`, Activity],
    ["Approved consents", counts.active_consents, `${counts.pending_identities} identity reviews pending`, UserCheck],
    ["Metered cost", `R ${(counts.usage_cost_minor / 100).toFixed(2)}`, `${counts.usage_events} recorded usage events`, Activity],
  ] : [];
  return <div className="content-stack">
    <section className="dashboard-hero">
      <div className="hero-copy"><div className="hero-kicker"><span className="pulse-dot" /> Persistent customer workspace</div><h2>Human presence.<br/><em>Honest by design.</em></h2><p>Build reliable AI interviewers, tutors and presenters with consent, provenance and visible disclosure at the centre.</p><div className="hero-actions"><Link className="button-light" href="/demos/interview"><Play size={17} fill="currentColor"/>Try interview demo</Link><Link className="button-ghost" href="/studio/safety">View safety controls <ArrowRight size={16}/></Link></div><div className="hero-footnote"><ShieldCheck size={16}/> No cloning. No hidden AI. No appearance scoring.</div></div>
      <div className="hero-human"><div className="portrait-orbit orbit-one"/><div className="portrait-orbit orbit-two"/><div className="hero-portrait-frame"><Image src={humans[0].image} alt="AI-generated VowHumans product illustration" fill priority sizes="(max-width: 900px) 70vw, 360px"/><span className="image-disclosure"><Sparkles size={13}/> AI-generated product illustration</span></div></div>
    </section>
    <StudioHomeChooser />
    <MySetupProgress />
    <NextBestAction />
    <ViewState loading={!data && !error} error={error}/>
    {data && <>
      <section className="metric-grid">{metrics.map(([label,value,note,Icon]) => <article className="metric-card" key={label}><span className="metric-icon cyan"><Icon size={20}/></span><p>{label}</p><strong>{String(value)}</strong><small>{note}</small></article>)}</section>
      <section className="split-grid wide-left"><div className="panel"><PanelTitle title="Digital humans" eyebrow={`${data.humans.length} most recent`} action={<Link className="text-link" href="/studio/digital-humans">Manage <ArrowRight size={15}/></Link>}/>{data.humans.length ? <div className="human-list">{data.humans.map((human) => <Link className="human-row" href="/studio/digital-humans" key={human.id}><HumanThumb human={human}/><span className="human-row-copy"><strong>{human.name}</strong><small>{human.role} · {human.disclosure}</small></span><StatusPill tone={human.state === "active" ? "good" : "warn"}>{human.state}</StatusPill><ArrowRight size={16}/></Link>)}</div> : <ViewState loading={false} empty="Create your first governed digital human to populate this workspace." action={<Link className="secondary-button" href="/studio/digital-humans">Start guided setup</Link>}/>}</div>
      <div className="panel readiness-panel"><PanelTitle title="Provider truth" eyebrow="Measured now"/><div className="readiness-list"><div><span>API gateway</span><StatusPill tone={data.gateway.gateway_reachable ? "good" : "warn"}>{data.gateway.gateway_reachable ? "Reachable" : "Not reachable"}</StatusPill></div><div><span>Realtime voice</span><StatusPill tone={data.gateway.realtime_configured ? "good" : "muted"}>{data.gateway.realtime_check_available ? (data.gateway.realtime_configured ? "Configured" : "Unavailable") : "Not checked"}</StatusPill></div><div><span>Avatar worker</span><StatusPill tone={data.gateway.avatar_configured ? "good" : "muted"}>{data.gateway.avatar_configured ? "Configured" : "Audio fallback"}</StatusPill></div></div></div></section>
      <section className="panel"><PanelTitle title="Recent workspace activity" eyebrow="Append-only audit events"/>{data.activity.length ? <div className="activity-list">{data.activity.map((event,index) => <div className="activity-row" key={`${event.action}-${event.occurred_at}-${index}`}><i className="cyan"/><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.resource_type}</small></span><time>{formatDate(event.occurred_at)}</time></div>)}</div> : <ViewState loading={false} empty="Saved workspace changes will appear here automatically."/>}</section>
    </>}
  </div>;
}

type IdentityRow = { id: string; owner_name: string; display_name: string; geographic_scope: string[]; state: string; expires_at: string | null; consent_count: number; approved_consent_count: number };

export function ProductionIdentityConsent() {
  const [items, setItems] = useState<IdentityRow[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const [owner,setOwner]=useState(""); const [display,setDisplay]=useState(""); const [reference,setReference]=useState(""); const [region,setRegion]=useState("South Africa"); const [role,setRole]=useState("presenter"); const [expiry,setExpiry]=useState(""); const [confirmed,setConfirmed]=useState(false);
  async function load(){try{const result=await api<{items:IdentityRow[]}>("/api/v1/identities");setItems(result.items);setError(null);}catch(reason){setError((reason as Error).message);}finally{setLoading(false);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError(null);try{await api("/api/v1/identities",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({owner_name:owner,display_name:display,authority_reference:reference,authority_confirmed:confirmed,commercial_use_confirmed:confirmed,permitted_roles:[role],geographic_scope:[region],expires_at:expiry||null})});setOwner("");setDisplay("");setReference("");setExpiry("");setConfirmed(false);await load();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
  async function revoke(id:string){const reason=window.prompt("Why is this identity authority being revoked?");if(!reason)return;setBusy(true);try{await api(`/api/v1/identities/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({state:"revoked",reason})});await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  const approved=items.filter((item)=>item.state==="approved"&&item.approved_consent_count===4).length;
  return <div className="content-stack"><section className="consent-banner"><span><ShieldCheck size={28}/></span><div><p className="eyebrow">Publication gate active</p><h2>Authority before identity.</h2><p>Every record below is organisation-owned, auditable and revocable. An attestation reference is evidence metadata—not a replacement for your signed source document.</p></div><div className="consent-score"><strong>{items.length ? `${Math.round(approved/items.length*100)}%` : "—"}</strong><small>approved coverage</small></div></section>
    <section className="panel"><PanelTitle title="Identity register" eyebrow={`${items.length} persisted identities`}/><ViewState loading={loading} error={error} empty={!loading&&!error&&!items.length?"Register an authorised identity below.":undefined}/>{items.length>0&&<div className="data-table consent-table"><div className="table-row table-head"><span>Identity</span><span>Owner</span><span>Geography</span><span>Expiry</span><span>Status</span></div>{items.map(item=><div className="table-row" key={item.id}><span className="source-cell"><i><Fingerprint size={17}/></i><b>{item.display_name}</b></span><span>{item.owner_name}</span><span>{item.geographic_scope.join(", ")}</span><span>{formatDate(item.expires_at)}</span><span><StatusPill tone={item.state==="approved"?"good":item.state==="revoked"?"danger":"warn"}>{item.state} · {item.approved_consent_count}/4</StatusPill>{item.state!=="revoked"&&<button className="plain-button" disabled={busy} onClick={()=>revoke(item.id)}>Revoke</button>}</span></div>)}</div>}</section>
    <section className="panel" id="studio-primary-action"><PanelTitle title="Register authority package" eyebrow="Creates four linked consent records"/><form className="form-grid two" onSubmit={submit}><label>Identity owner<input required value={owner} onChange={e=>setOwner(e.target.value)}/></label><label>Display name<input required value={display} onChange={e=>setDisplay(e.target.value)}/></label><label>Authority reference<input required value={reference} onChange={e=>setReference(e.target.value)} placeholder="Signed document ID or contract reference"/></label><label>Permitted role<select value={role} onChange={e=>setRole(e.target.value)}><option value="presenter">Presenter</option><option value="interviewer">Interviewer</option><option value="tutor">Tutor</option><option value="support">Support adviser</option></select></label><label>Geographic scope<input required value={region} onChange={e=>setRegion(e.target.value)}/></label><label>Expiry<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><label className="full"><span><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm documented authority for written, face, voice and commercial use.</span></label><button className="primary-button" disabled={busy||!confirmed}>{busy?<RefreshCw className="spin" size={17}/>:<ShieldCheck size={17}/>}Register approved authority</button></form></section>
  </div>;
}

type ApiKeyRow={id:string;name:string;prefix:string;scopes:string[];status:string;expires_at:string|null;last_used_at:string|null;created_at:string;application_name:string|null};
type AppRow={id:string;name:string};

export function ProductionApiKeys(){
  const [items,setItems]=useState<ApiKeyRow[]>([]);const [apps,setApps]=useState<AppRow[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [secret,setSecret]=useState<string|null>(null);const [name,setName]=useState("");const [appId,setAppId]=useState("");const [scope,setScope]=useState("sessions:create");const [expiry,setExpiry]=useState("");const [busy,setBusy]=useState(false);
  async function load(){try{const [keys,applications]=await Promise.all([api<{items:ApiKeyRow[]}>("/api/v1/api-keys"),api<{items:AppRow[]}>("/api/v1/applications")]);setItems(keys.items);setApps(applications.items);setError(null);}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  async function create(event:React.FormEvent){event.preventDefault();setBusy(true);setSecret(null);try{const row=await api<ApiKeyRow&{secret:string}>("/api/v1/api-keys",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,application_id:appId||null,scopes:[scope],expires_at:expiry||null})});setSecret(row.secret);setName("");await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function revoke(id:string){if(!window.confirm("Revoke this key? Existing integrations using it will stop immediately."))return;setBusy(true);try{await api(`/api/v1/api-keys/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"revoked"})});await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  return <div className="content-stack"><section className="security-callout"><span><KeyRound size={27}/></span><div><p className="eyebrow">Hash-only credentials</p><h2>Scoped access, shown once.</h2><p>Only a SHA-256 digest is retained. Copy a new key before leaving this screen.</p></div></section>{secret&&<section className="panel"><PanelTitle title="Copy this key now" eyebrow="One-time secret reveal"/><div className="code-panel"><pre>{secret}</pre></div><button className="secondary-button" onClick={()=>navigator.clipboard.writeText(secret)}><Copy size={16}/>Copy key</button></section>}
    <section className="panel"><PanelTitle title="Service API keys" eyebrow={`${items.filter(i=>i.status==="active").length} active`}/><ViewState loading={loading} error={error} empty={!loading&&!error&&!items.length?"Issue a scoped key below.":undefined}/>{items.length>0&&<div className="data-table keys-table"><div className="table-row table-head"><span>Name</span><span>Prefix</span><span>Scopes</span><span>Last used</span><span>Status</span></div>{items.map(item=><div className="table-row" key={item.id}><span><b>{item.name}</b><small>{item.application_name??"Organisation"}</small></span><span><code>{item.prefix}••••</code></span><span>{item.scopes.join(" · ")}</span><span>{formatDate(item.last_used_at)}</span><span><StatusPill tone={item.status==="active"?"good":"danger"}>{item.status}</StatusPill>{item.status==="active"&&<button className="plain-button" onClick={()=>revoke(item.id)} disabled={busy}>Revoke</button>}</span></div>)}</div>}</section>
    <section className="panel" id="studio-primary-action"><PanelTitle title="Issue a service key" eyebrow="Production credential"/><form className="form-grid two" onSubmit={create}><label>Name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="CRM production"/></label><label>Application<select value={appId} onChange={e=>setAppId(e.target.value)}><option value="">Organisation-wide</option>{apps.map(app=><option value={app.id} key={app.id}>{app.name}</option>)}</select></label><label>Scope<select value={scope} onChange={e=>setScope(e.target.value)}><option>sessions:create</option><option>sessions:read</option><option>renders:create</option><option>renders:read</option><option>usage:read</option><option>webhooks:manage</option></select></label><label>Expiry<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><button className="primary-button" disabled={busy}>{busy?<RefreshCw className="spin" size={17}/>:<KeyRound size={17}/>}Issue key</button></form></section>
  </div>;
}

type WebhookRow={id:string;name:string;endpoint_url:string;event_types:string[];status:string;last_delivery_at:string|null;last_status_code:number|null;consecutive_failures:number;application_name:string|null};
export function ProductionWebhooks(){
  const [items,setItems]=useState<WebhookRow[]>([]);const [apps,setApps]=useState<AppRow[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [secret,setSecret]=useState<string|null>(null);const [test,setTest]=useState<Record<string,unknown>|null>(null);const [name,setName]=useState("");const [url,setUrl]=useState("");const [eventType,setEventType]=useState("session.completed");const [appId,setAppId]=useState("");const [busy,setBusy]=useState(false);
  async function load(){try{const [hooks,applications]=await Promise.all([api<{items:WebhookRow[]}>("/api/v1/webhooks"),api<{items:AppRow[]}>("/api/v1/applications")]);setItems(hooks.items);setApps(applications.items);setError(null);}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  async function create(event:React.FormEvent){event.preventDefault();setBusy(true);try{const row=await api<WebhookRow&{signing_secret:string}>("/api/v1/webhooks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,endpoint_url:url,event_types:[eventType],application_id:appId||null})});setSecret(row.signing_secret);setName("");setUrl("");await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function update(item:WebhookRow){setBusy(true);try{await api(`/api/v1/webhooks/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:item.status==="active"?"paused":"active"})});await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function remove(id:string){if(!window.confirm("Delete this webhook endpoint?"))return;setBusy(true);try{await api(`/api/v1/webhooks/${id}`,{method:"DELETE"});await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function verify(id:string){setBusy(true);try{setTest(await api<Record<string,unknown>>(`/api/v1/webhooks/${id}/test`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}));}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  return <div className="content-stack">{secret&&<section className="panel"><PanelTitle title="Signing secret" eyebrow="Copy once"/><div className="code-panel"><pre>{secret}</pre></div><button className="secondary-button" onClick={()=>navigator.clipboard.writeText(secret)}><Copy size={16}/>Copy secret</button></section>}
    <section className="panel"><PanelTitle title="Webhook endpoints" eyebrow="Encrypted secret · HMAC signed"/><ViewState loading={loading} error={error} empty={!loading&&!error&&!items.length?"Add your first HTTPS endpoint below.":undefined}/><div className="webhook-list">{items.map(item=><div className="webhook-row" key={item.id}><span className="empty-icon"><Webhook size={19}/></span><div><strong>{item.name}</strong><code>{item.endpoint_url}</code><small>{item.event_types.join(" · ")} · {item.application_name??"Organisation"}</small></div><StatusPill tone={item.status==="active"?"good":"warn"}>{item.status==="active"?"Active":"Paused"}</StatusPill><div className="table-tools"><button onClick={()=>verify(item.id)} disabled={busy}>Test signature</button><button onClick={()=>update(item)} disabled={busy}>{item.status==="active"?"Pause":"Resume"}</button><button aria-label={`Delete ${item.name}`} onClick={()=>remove(item.id)} disabled={busy}><Trash2 size={15}/></button></div></div>)}</div></section>
    <section className="split-grid"><div className="panel" id="studio-primary-action"><PanelTitle title="Add endpoint" eyebrow="No delivery occurs until your event fires"/><form className="form-grid" onSubmit={create}><label>Name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>HTTPS endpoint<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.example.com/vowhumans"/></label><label>Event<select value={eventType} onChange={e=>setEventType(e.target.value)}><option>session.created</option><option>session.completed</option><option>session.failed</option><option>render.completed</option><option>render.failed</option><option>identity.revoked</option></select></label><label>Application<select value={appId} onChange={e=>setAppId(e.target.value)}><option value="">Organisation-wide</option>{apps.map(app=><option value={app.id} key={app.id}>{app.name}</option>)}</select></label><button className="primary-button" disabled={busy}><Webhook size={17}/>Create webhook</button></form></div><div className="panel code-panel"><div className="code-dots"><i/><i/><i/></div><pre>{test?JSON.stringify(test,null,2):"Choose Test signature to generate and verify a synthetic, locally signed envelope. No customer content is transmitted."}</pre></div></section>
  </div>;
}

type UsageData={summary:{usage_events:number;metered_quantity:number;estimated_cost_minor:number;session_minutes:number;presenter_jobs:number;avg_latency_ms:number|null};trend:{day:string;quantity:number;estimated_cost_minor:number}[];providers:{provider:string;unit:string;events:number;quantity:number;estimated_cost_minor:number}[];currency:string};
export function ProductionUsage(){
  const [data,setData]=useState<UsageData|null>(null);const[error,setError]=useState<string|null>(null);
  async function load(){try{setData(await api<UsageData>("/api/v1/usage"));}catch(cause){setError((cause as Error).message);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  const exportData=useCallback(()=>{if(!data)return;downloadCsv("vowhumans-usage.csv",[["day","quantity","estimated_cost_minor","currency"],...data.trend.map(row=>[row.day,row.quantity,row.estimated_cost_minor,data.currency])]);},[data]);
  useEffect(()=>{window.addEventListener("studio:export-usage",exportData);return()=>window.removeEventListener("studio:export-usage",exportData);},[exportData]);
  const max=Math.max(1,...(data?.trend.map(row=>row.quantity)??[1]));
  return <div className="content-stack"><ViewState loading={!data&&!error} error={error}/>{data&&<><section className="metric-grid">{[["Session minutes",data.summary.session_minutes.toFixed(1),"From persisted sessions"],["Metered events",data.summary.usage_events,data.summary.metered_quantity.toFixed(2)+" total units"],["Presenter jobs",data.summary.presenter_jobs,"Persisted generated-video records"],["Estimated cost",`R ${(data.summary.estimated_cost_minor/100).toFixed(2)}`,"Usage ledger estimate"]].map(([label,value,note])=><article className="metric-card" key={String(label)}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</section><section className="split-grid wide-left"><div className="panel usage-chart"><PanelTitle title="30-day metered usage" eyebrow="Live usage ledger" action={<button className="table-action" onClick={exportData}><Download size={14}/>Export CSV</button>}/><div className="chart-area"><div className="chart-y"><span>{max.toFixed(0)}</span><span>0</span></div><div className="bars">{data.trend.map(row=><div key={row.day}><i title={`${row.day}: ${row.quantity}`} style={{height:`${Math.max(2,row.quantity/max*100)}%`}}/><small>{row.day.slice(8)}</small></div>)}</div></div></div><div className="panel provider-cost"><PanelTitle title="Provider cost ledger" eyebrow={`${data.providers.length} sources`}/>{data.providers.length?data.providers.map((row,index)=><div className="cost-row" key={`${row.provider}-${row.unit}`}><i className={["coral","cyan","lime","violet"][index%4]}/><span><b>{row.provider}</b><small>{row.quantity} {row.unit} · {row.events} events</small></span><strong>R {(row.estimated_cost_minor/100).toFixed(2)}</strong></div>):<ViewState loading={false} empty="Provider calls will appear after real metered operations."/>}</div></section></>}</div>;
}

type SafetyData={counts:{identities:number;approved_identities:number;pending_identities:number;approved_consents:number;total_consents:number;moderation_events:number;knowledge_chunks:number;open_concerns:number};features:Record<string,boolean>};
export function ProductionSafety(){
  const[data,setData]=useState<SafetyData|null>(null);const[error,setError]=useState<string|null>(null);const[description,setDescription]=useState("");const[priority,setPriority]=useState("normal");const[busy,setBusy]=useState(false);const[sent,setSent]=useState(false);
  async function load(){try{setData(await api<SafetyData>("/api/v1/safety"));}catch(cause){setError((cause as Error).message);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  async function report(event:React.FormEvent){event.preventDefault();setBusy(true);try{await api("/api/v1/safety",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({description,priority})});setDescription("");setSent(true);await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  const c=data?.counts;
  const controls: [string, string | number, string, LucideIcon][] = c ? [["Identity authority",`${c.approved_identities}/${c.identities} approved`,"Revocation stops linked consent",UserCheck],["Consent records",`${c.approved_consents}/${c.total_consents} approved`,"Written, face, voice and commercial scopes",LockKeyhole],["Moderation events",c.moderation_events,"Last 30 days",ShieldCheck],["Grounded knowledge",`${c.knowledge_chunks} chunks`,"Organisation-scoped retrieval records",CircleCheck]] : [];
  return <div className="content-stack"><section className="safety-hero"><div><span className="safety-shield"><ShieldCheck size={34}/></span><p className="eyebrow">Measured safety posture</p><h2>Trust is a system property.</h2><p>Counts below come from your organisation records. Unsupported capabilities remain visibly gated.</p></div><div className="safety-score"><span>OPEN CONCERNS</span><strong>{c?.open_concerns??"—"}</strong><StatusPill tone={c?.open_concerns?"warn":"good"}>{c?.open_concerns?"Review required":"No open reports"}</StatusPill></div></section><ViewState loading={!data&&!error} error={error}/>{data&&<section className="safety-control-grid">{controls.map(([name,state,copy,Icon])=><article className="panel" key={name}><span className="empty-icon"><Icon size={20}/></span><h2>{name}</h2><strong>{String(state)}</strong><p>{copy}</p></article>)}</section>}
    <section className="split-grid"><div className="prohibited-panel"><PanelTitle title="Never supported" eyebrow="Product prohibitions"/><div className="prohibited-grid">{["Unauthorised face or voice cloning","Public-figure impersonation","Hidden AI or covert recording","Appearance-based employment scoring","Face-based emotion or honesty detection","Employer access to practice answers"].map(item=><span key={item}><X size={14}/>{item}</span>)}</div></div><div className="panel" id="studio-primary-action"><PanelTitle title="Report a safety concern" eyebrow="Creates a tracked support record"/><form className="form-grid" onSubmit={report}><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>normal</option><option>high</option><option>urgent</option></select></label><label>Concern<textarea required minLength={10} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the affected workflow and impact."/></label><button className="primary-button" disabled={busy}>{busy?<RefreshCw className="spin" size={17}/>:<ShieldCheck size={17}/>}Submit concern</button>{sent&&<p className="panel-note"><Check size={15}/>Concern recorded in this workspace.</p>}</form></div></section>
  </div>;
}

type AuditRow={id:string;action:string;resource_type:string;resource_id:string|null;before_state:Record<string,unknown>|null;after_state:Record<string,unknown>|null;occurred_at:string;actor:string};
export function ProductionAuditLogs(){
  const[items,setItems]=useState<AuditRow[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);const[actor,setActor]=useState("All actors");
  useEffect(()=>{api<{items:AuditRow[]}>("/api/v1/audit-logs").then(result=>setItems(result.items)).catch((cause:Error)=>setError(cause.message)).finally(()=>setLoading(false));},[]);
  const actors=useMemo(()=>["All actors",...Array.from(new Set(items.map(item=>item.actor)))],[items]);const visible=actor==="All actors"?items:items.filter(item=>item.actor===actor);
  const exportData=useCallback(()=>{downloadCsv("vowhumans-audit-log.csv",[["occurred_at","actor","action","resource_type","resource_id"],...visible.map(item=>[item.occurred_at,item.actor,item.action,item.resource_type,item.resource_id])]);},[visible]);
  useEffect(()=>{window.addEventListener("studio:export-audit",exportData);return()=>window.removeEventListener("studio:export-audit",exportData);},[exportData]);
  return <div className="content-stack"><section className="panel"><div className="audit-toolbar"><div><p className="eyebrow">Append-only database history</p><h2>Organisation audit trail</h2></div><div><select aria-label="Filter by actor" value={actor} onChange={e=>setActor(e.target.value)}>{actors.map(value=><option key={value}>{value}</option>)}</select><button onClick={exportData}><Download size={14}/>Export CSV</button></div></div><ViewState loading={loading} error={error} empty={!loading&&!error&&!visible.length?"Control-plane changes will be recorded here.":undefined}/><div className="audit-list">{visible.map(item=><div className="audit-event" key={item.id}><span className="audit-icon"><Activity size={17}/></span><div><strong>{item.action.replaceAll("_"," ")}</strong><p>{item.resource_type}</p><code>{item.resource_id??"organisation"}</code></div><span><b>{item.actor}</b><time>{formatDate(item.occurred_at)}</time></span></div>)}</div></section></div>;
}

type OrganisationData={organisation:{id:string;name:string;slug:string;status:string;settings:Record<string,unknown>};features:Record<string,boolean>;gateway:{gateway_reachable:boolean;realtime_configured:boolean;realtime_check_available:boolean;avatar_configured:boolean}};
export function ProductionSettings(){
  const user=useAuth();const[data,setData]=useState<OrganisationData|null>(null);const[error,setError]=useState<string|null>(null);const[busy,setBusy]=useState(false);const[saved,setSaved]=useState(false);const[tab,setTab]=useState<"organisation"|"data"|"flags"|"provider"|"notifications">("organisation");const[name,setName]=useState(user.organisationName);const[region,setRegion]=useState("South Africa");const[language,setLanguage]=useState("en-ZA");const[retention,setRetention]=useState(30);const[notifications,setNotifications]=useState<Record<string,boolean>>({session_completed:true,consent_expiring:true,webhook_failures:true,weekly_digest:false});
  async function load(){try{const result=await api<OrganisationData>("/api/v1/organisations/current");setData(result);const settings=result.organisation.settings??{};setName(result.organisation.name);setRegion(String(settings.primary_region??"South Africa"));setLanguage(String(settings.default_language??"en-ZA"));setRetention(Number(settings.retention_days??30));if(settings.notifications&&typeof settings.notifications==="object")setNotifications(prev=>({...prev,...settings.notifications as Record<string,boolean>}));}catch(cause){setError((cause as Error).message);}}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server snapshot
  useEffect(()=>{void load();},[]);
  const save=useCallback(async()=>{setBusy(true);setSaved(false);try{const result=await api<OrganisationData["organisation"]>("/api/v1/organisations/current",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name,settings:{primary_region:region,default_language:language,retention_days:retention,notifications}})});setData(current=>current?{...current,organisation:result}:current);setSaved(true);}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}},[language,name,notifications,region,retention]);
  useEffect(()=>{const handler=()=>{void save();};window.addEventListener("studio:save-settings",handler);return()=>window.removeEventListener("studio:save-settings",handler);},[save]);
  const tabs:[typeof tab,string][]=[["organisation","Organisation"],["data","Data & retention"],["flags","Feature flags"],["provider","Provider health"],["notifications","Notifications"]];
  return <div className="content-stack"><ViewState loading={!data&&!error} error={error}/>{data&&<section className="settings-layout"><nav className="settings-nav">{tabs.map(([key,label])=><button key={key} className={tab===key?"selected":""} onClick={()=>setTab(key)}>{label}</button>)}</nav><div className="panel settings-form" id="studio-primary-action">
    {tab==="organisation"&&<><PanelTitle title="Organisation defaults" eyebrow={data.organisation.slug}/><div className="form-grid two"><label>Organisation name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Primary region<select value={region} onChange={e=>setRegion(e.target.value)}><option>South Africa</option><option>European Union</option><option>United Kingdom</option><option>United States</option></select></label><label>Default language<input value={language} onChange={e=>setLanguage(e.target.value)}/></label></div></>}
    {tab==="data"&&<><PanelTitle title="Data & retention" eyebrow="Organisation-wide"/><div className="form-grid"><label>Transcript retention<select value={retention} onChange={e=>setRetention(Number(e.target.value))}><option value={0}>Session only</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label></div><p className="panel-note"><LockKeyhole size={16}/>Recording remains separately consent-gated; changing this value does not enable recording.</p></>}
    {tab==="flags"&&<><PanelTitle title="Feature flags" eyebrow="Server truth"/><div className="readiness-list">{Object.entries(data.features).map(([key,enabled])=><div key={key}><span>{key.replaceAll("_"," ")}</span><StatusPill tone={enabled?"good":"muted"}>{enabled?"Enabled":"Disabled"}</StatusPill></div>)}</div></>}
    {tab==="provider"&&<><PanelTitle title="Provider health" eyebrow="Server-side checks"/><div className="health-grid"><div><span>API gateway</span><StatusPill tone={data.gateway.gateway_reachable?"good":"warn"}>{data.gateway.gateway_reachable?"Reachable":"Not reachable"}</StatusPill></div><div><span>Realtime agent</span><StatusPill tone={data.gateway.realtime_configured?"good":"muted"}>{data.gateway.realtime_check_available?(data.gateway.realtime_configured?"Healthy":"Unavailable"):"Health URL not configured"}</StatusPill></div><div><span>Avatar worker</span><StatusPill tone={data.gateway.avatar_configured?"good":"muted"}>{data.gateway.avatar_configured?"Configured":"Audio fallback"}</StatusPill></div></div></>}
    {tab==="notifications"&&<><PanelTitle title="Notifications" eyebrow="Persisted preferences"/><div className="settings-switches">{Object.entries(notifications).map(([key,on])=><div key={key}><span><strong>{key.replaceAll("_"," ")}</strong></span><button className="secondary-button" onClick={()=>setNotifications(current=>({...current,[key]:!on}))}><StatusPill tone={on?"good":"muted"}>{on?"On":"Off"}</StatusPill></button></div>)}</div></>}
    {(tab==="organisation"||tab==="data"||tab==="notifications")&&<button className="primary-button" onClick={save} disabled={busy}>{busy?<RefreshCw className="spin" size={17}/>:saved?<Check size={17}/>:null}{busy?"Saving…":saved?"Settings saved":"Save settings"}</button>}
  </div></section>}</div>;
}
