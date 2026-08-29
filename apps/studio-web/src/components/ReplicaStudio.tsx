"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusPill } from "./StatusPill";
import { REPLICA_CAPTURE_STEPS, REQUIRED_CAPTURE_SEGMENTS, type ReplicaGesture, type ReplicaSegmentType } from "@/lib/replicas";

type ReplicaSummary = {
  id: string;
  name: string;
  human_slug: string | null;
  renderer_tier: string;
  status: string;
  quality_mode: string;
  identity_name: string;
  segment_count: number;
};

type IdentityOption = { id: string; display_name?: string; owner_name?: string; state: string };
type HumanOption = { id: string; name: string; role: string };
type Segment = {
  id: string;
  segment_type: string;
  gesture_key: string | null;
  state: string;
  starts_neutral: boolean;
  ends_neutral: boolean;
};
type ReplicaDetail = {
  profile: ReplicaSummary & { identity_id: string };
  capture_session: { id: string; status: string } | null;
  segments: Segment[];
  readiness: { ready: boolean; missing: string[] };
  jobs: Array<{ id: string; status: string; progress: number; safe_error_code?: string | null }>;
  quality_checks: Array<{ check_code: string; status: string }>;
};
type Catalogue = {
  items: ReplicaSummary[];
  storage_configured: boolean;
  feature_flags: { video_replica: boolean; streaming_replica: boolean; replica_gestures: boolean; rigged_3d: boolean };
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.message || "The replica request could not be completed.");
  return body.data as T;
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toneForStatus(status: string): "good" | "warn" | "danger" | "muted" {
  if (["approved", "published", "completed", "passed", "uploaded"].includes(status)) return "good";
  if (["failed", "revoked", "rejected", "blocked"].includes(status)) return "danger";
  if (["processing", "capturing", "quality_review", "queued", "running"].includes(status)) return "warn";
  return "muted";
}

export function ReplicaStudio() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReplicaDetail | null>(null);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [humans, setHumans] = useState<HumanOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalogue = useCallback(async () => {
    const data = await api<Catalogue>("/api/v1/replicas");
    setCatalogue(data);
    setSelectedId((current) => current ?? data.items[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<Catalogue>("/api/v1/replicas"),
      api<{ items: IdentityOption[] }>("/api/v1/identities"),
      api<{ items: HumanOption[] }>("/api/v1/digital-humans"),
    ]).then(([replicas, identityData, humanData]) => {
      if (cancelled) return;
      setCatalogue(replicas);
      setIdentities(identityData.items);
      setHumans(humanData.items);
      setSelectedId((current) => current ?? replicas.items[0]?.id ?? null);
    }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load replica setup."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const openCreate = () => setCreating(true);
    window.addEventListener("studio:new-replica", openCreate);
    return () => window.removeEventListener("studio:new-replica", openCreate);
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return; }
    try {
      setDetail(await api<ReplicaDetail>(`/api/v1/replicas/${selectedId}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this replica.");
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void api<ReplicaDetail>(`/api/v1/replicas/${selectedId}`)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load this replica."); });
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="page-stack replica-studio">
      <section className="replica-tier-grid" aria-label="Appearance technology options">
        <article className="panel replica-tier">
          <span className="replica-tier-icon"><Camera size={22} /></span>
          <div><p className="eyebrow">Available now</p><h2>Quick Portrait</h2><p>One approved image with voice-driven mouth animation and restrained synthetic head motion.</p></div>
          <StatusPill tone="good">Legacy fallback</StatusPill>
        </article>
        <article className="panel replica-tier recommended">
          <span className="replica-tier-icon"><Video size={22} /></span>
          <div><p className="eyebrow">Recommended foundation</p><h2>Photoreal Replica</h2><p>Captured human motion is preserved; only the speech and mouth performance is dynamically retargeted.</p></div>
          <StatusPill tone={catalogue?.feature_flags.video_replica ? "good" : "warn"}>{catalogue?.feature_flags.video_replica ? "Runtime enabled" : "Capture setup"}</StatusPill>
        </article>
        <article className="panel replica-tier experimental">
          <span className="replica-tier-icon"><Sparkles size={22} /></span>
          <div><p className="eyebrow">Future renderer</p><h2>Fully Rigged 3D</h2><p>Provider contract and governance path only. No production quality claim or hidden synthetic fallback.</p></div>
          <StatusPill tone="muted">Experimental</StatusPill>
        </article>
      </section>

      <section className="replica-truth panel">
        <ShieldCheck size={23} />
        <div><strong>Capability truth</strong><p>The current RunPod image serves Quick Portrait. Replica capture and review are available only when private storage and migration 021 are configured; runtime stays gated until a real authorised capture passes measured quality and latency tests.</p></div>
        <div className="replica-truth-flags">
          <span><i className={catalogue?.storage_configured ? "on" : ""} />Private storage</span>
          <span><i className={catalogue?.feature_flags.video_replica ? "on" : ""} />Replica worker</span>
          <span><i className={catalogue?.feature_flags.streaming_replica ? "on" : ""} />Live streaming</span>
        </div>
      </section>

      {error && <div className="review-warning"><CircleAlert size={18} />{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></div>}

      {creating ? (
        <CreateReplicaForm identities={identities} humans={humans} onCancel={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await refreshCatalogue(); setSelectedId(id); }} />
      ) : (
        <div className="replica-layout">
          <aside className="panel replica-catalogue">
            <div className="panel-title"><div><p className="eyebrow">Authorised captures</p><h2>Replica library</h2></div><button className="secondary-button" type="button" onClick={() => setCreating(true)}>New replica</button></div>
            {catalogue?.items.length ? catalogue.items.map((item) => (
              <button className={selectedId === item.id ? "selected" : ""} key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
                <span className="replica-list-icon"><Video size={17} /></span>
                <span><strong>{item.name}</strong><small>{item.identity_name} · {item.quality_mode}</small></span>
                <StatusPill tone={toneForStatus(item.status)}>{item.status.replaceAll("_", " ")}</StatusPill>
              </button>
            )) : <div className="replica-empty"><Video size={27} /><strong>No replicas captured</strong><p>Register an authorised performer and start the guided capture protocol.</p><button className="primary-button" type="button" onClick={() => setCreating(true)}>Create Photoreal Replica</button></div>}
          </aside>
          <section className="panel replica-workspace">
            {detail ? <ReplicaCaptureWorkflow detail={detail} storageConfigured={catalogue?.storage_configured ?? false} onRefresh={async () => { await refreshDetail(); await refreshCatalogue(); }} /> : <div className="replica-empty"><LockKeyhole size={28} /><strong>Select a replica</strong><p>Capture footage and biometric evidence are private and organisation-scoped.</p></div>}
          </section>
        </div>
      )}
    </div>
  );
}

function CreateReplicaForm({ identities, humans, onCancel, onCreated }: { identities: IdentityOption[]; humans: HumanOption[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [humanId, setHumanId] = useState("");
  const [qualityMode, setQualityMode] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approvedIdentities = identities.filter((identity) => identity.state === "approved");
  const prerequisitesReady = approvedIdentities.length > 0 && humans.length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await api<{ id: string }>("/api/v1/replicas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, identity_id: identityId, human_slug: humanId, digital_human_id: humanId, quality_mode: qualityMode }) });
      onCreated(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this replica.");
    } finally { setBusy(false); }
  }

  return (
    <section className="panel replica-create">
      <div className="panel-title"><div><p className="eyebrow">Consent before capture</p><h2>Create Photoreal Replica</h2></div><button className="plain-button" type="button" onClick={onCancel}><ArrowLeft size={15} />Library</button></div>
      <p className="panel-note"><LockKeyhole size={16} />Only identities with approved face and commercial-use consent can start capture. VowHumans stores private object references and hashes—not capture video—in PostgreSQL.</p>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {!prerequisitesReady && <div className="review-warning replica-prerequisite"><CircleAlert size={17} /><div><strong>Complete the capture prerequisites first</strong><p>{approvedIdentities.length === 0 ? "Register an authorised performer and approve active likeness and commercial-use consent. " : ""}{humans.length === 0 ? "Create the Digital Human that will own this replica. " : ""}Capture remains locked until both records exist.</p><div className="editor-actions">{approvedIdentities.length === 0 && <Link className="secondary-button" href="/studio/identity-consent">Open Identity &amp; Consent</Link>}{humans.length === 0 && <Link className="secondary-button" href="/studio/digital-humans">Create Digital Human</Link>}</div></div></div>}
      <form className="form-grid two" onSubmit={submit}>
        <label>Replica name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Thandi authorised replica" /></label>
        <label>Digital Human<select required value={humanId} onChange={(event) => setHumanId(event.target.value)}><option value="">Choose Digital Human</option>{humans.map((human) => <option value={human.id} key={human.id}>{human.name} · {human.role}</option>)}</select></label>
        <label>Authorised identity<select required value={identityId} onChange={(event) => setIdentityId(event.target.value)}><option value="">Choose approved identity</option>{approvedIdentities.map((identity) => <option value={identity.id} key={identity.id}>{identity.display_name ?? identity.owner_name ?? identity.id}</option>)}</select></label>
        <label>Quality mode<select value={qualityMode} onChange={(event) => setQualityMode(event.target.value)}><option value="standard">Standard · live target</option><option value="premium">Premium · higher fidelity</option><option value="presenter">Presenter · batch output</option></select></label>
        <div className="editor-actions full"><button className="primary-button" type="submit" disabled={busy || !prerequisitesReady}>{busy ? <RefreshCw className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Verifying consent…" : prerequisitesReady ? "Verify consent & begin" : "Complete prerequisites"}</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
      </form>
    </section>
  );
}

function ReplicaCaptureWorkflow({ detail, storageConfigured, onRefresh }: { detail: ReplicaDetail; storageConfigured: boolean; onRefresh: () => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestJob = detail.jobs[0];

  function hasSegment(type: ReplicaSegmentType, gesture?: ReplicaGesture) {
    return detail.segments.some((segment) => segment.state === "uploaded" && segment.segment_type === type && (!gesture || segment.gesture_key === gesture));
  }

  async function submitProcessing() {
    setBusy(true); setError(null);
    try { await api(`/api/v1/replicas/${detail.profile.id}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); await onRefresh(); setStep(10); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not queue replica processing."); }
    finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setError(null);
    try { await api(`/api/v1/replicas/${detail.profile.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not approve this replica."); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!detail.profile.human_slug) { setError("This profile is not linked to a Digital Human slug."); return; }
    setBusy(true); setError(null);
    try { await api(`/api/v1/replicas/${detail.profile.id}/assign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ human_slug: detail.profile.human_slug, enabled: false }) }); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assign this replica."); }
    finally { setBusy(false); }
  }

  const captureForStep: Partial<Record<number, { type: ReplicaSegmentType; gesture?: ReplicaGesture; label: string; instruction: string }[]>> = {
    4: [REQUIRED_CAPTURE_SEGMENTS[0]],
    5: [REQUIRED_CAPTURE_SEGMENTS[2]],
    6: [REQUIRED_CAPTURE_SEGMENTS[1]],
    8: [REQUIRED_CAPTURE_SEGMENTS[3], REQUIRED_CAPTURE_SEGMENTS[4]],
  };

  return (
    <div>
      <div className="replica-workspace-heading"><div><p className="eyebrow">12-step controlled capture</p><h2>{detail.profile.name}</h2><p>{detail.profile.identity_name} · {detail.profile.quality_mode} quality</p></div><StatusPill tone={toneForStatus(detail.profile.status)}>{detail.profile.status.replaceAll("_", " ")}</StatusPill></div>
      <div className="replica-stepper" aria-label="Replica capture progress">
        {REPLICA_CAPTURE_STEPS.map((label, index) => <button type="button" className={step === index + 1 ? "active" : index + 1 < step ? "done" : ""} key={label} onClick={() => setStep(index + 1)}><span>{index + 1 < step ? <Check size={12} /> : index + 1}</span><small>{label}</small></button>)}
      </div>
      {error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}
      {step === 1 && <WorkflowCard icon={ShieldCheck} title="Identity and consent verified" copy="The selected identity has active likeness and commercial-use consent. Revocation disables runtime assignments immediately." action="Continue to camera" onAction={() => setStep(2)} complete />}
      {step === 2 && <WorkflowCard icon={Camera} title="Camera check" copy="Use a stable 1080p camera at eye level. Disable virtual backgrounds, beauty filters, auto-framing and portrait effects." action="Camera is ready" onAction={() => setStep(3)} />}
      {step === 3 && <WorkflowCard icon={Sparkles} title="Lighting check" copy="Use soft, even front lighting. Avoid flicker, harsh side shadows, changing daylight and reflective eyewear glare." action="Lighting is ready" onAction={() => setStep(4)} />}
      {[4, 5, 6, 8].includes(step) && <div className="replica-capture-grid">{captureForStep[step]?.map((capture) => <CaptureCard key={`${capture.type}-${capture.gesture ?? ""}`} profileId={detail.profile.id} capture={capture} uploaded={hasSegment(capture.type, capture.gesture)} disabled={!storageConfigured} onUploaded={onRefresh} />)}</div>}
      {step === 7 && <WorkflowCard icon={Video} title="Expression coverage" copy="Optional in the first proof: capture restrained warmth, concern and reassurance. Do not exaggerate or generate expressions the performer did not authorise." action="Continue to gestures" onAction={() => setStep(8)} />}
      {step === 9 && <section className="replica-gate"><p className="eyebrow">Capture quality gate</p><h3>{detail.readiness.ready ? "Required performance clips are present" : "Capture is incomplete"}</h3>{detail.readiness.ready ? <p><CircleCheck size={17} />Neutral idle, listening, speaking, acknowledgement and explanation motion are ready for processing.</p> : <ul>{detail.readiness.missing.map((item) => <li key={item}><CircleAlert size={15} />{item}</li>)}</ul>}<button className="primary-button" disabled={!detail.readiness.ready || busy} type="button" onClick={submitProcessing}>{busy ? <RefreshCw className="spin" size={17} /> : <UploadCloud size={17} />}Queue private processing</button></section>}
      {step === 10 && <WorkflowCard icon={latestJob?.status === "completed" ? CircleCheck : Clock3} title={latestJob ? `Processing ${latestJob.status.replaceAll("_", " ")}` : "Not submitted"} copy={latestJob ? `Progress ${latestJob.progress}%. The dedicated processor validates footage, extracts per-frame representations and writes a private manifest.` : "Complete the quality gate first."} action="Refresh processing" onAction={onRefresh} complete={latestJob?.status === "completed"} />}
      {step === 11 && <QualityEvidenceReview profileId={detail.profile.id} checks={detail.quality_checks} processingReady={detail.profile.status === "quality_review" || detail.profile.status === "approved"} onRefresh={onRefresh} />}
      {step === 12 && <section className="replica-gate approval"><p className="eyebrow">Accountable approval</p><h3>{detail.profile.status === "approved" ? "Replica approved" : "Reviewer sign-off required"}</h3><p><BadgeCheck size={18} />Approval never enables production automatically. Runtime assignment and feature flags remain separate controls.</p><div className="editor-actions"><button className="primary-button" type="button" disabled={busy || detail.profile.status === "approved"} onClick={approve}>{busy ? <RefreshCw className="spin" size={17} /> : <BadgeCheck size={17} />}{detail.profile.status === "approved" ? "Approved" : "Approve measured version"}</button>{detail.profile.status === "approved" && <button className="secondary-button" type="button" disabled={busy} onClick={assign}>Assign safely (disabled)<ArrowRight size={16} /></button>}</div></section>}
      <div className="replica-workflow-footer"><button className="secondary-button" type="button" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}><ArrowLeft size={15} />Back</button><span>Step {step} of 12</span><button className="secondary-button" type="button" disabled={step === 12} onClick={() => setStep((current) => Math.min(12, current + 1))}>Next<ArrowRight size={15} /></button></div>
    </div>
  );
}

function QualityEvidenceReview({ profileId, checks, processingReady, onRefresh }: { profileId: string; checks: ReplicaDetail["quality_checks"]; processingReady: boolean; onRefresh: () => Promise<void> }) {
  const [visualNotes, setVisualNotes] = useState("");
  const [latencyNotes, setLatencyNotes] = useState("");
  const [latency, setLatency] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = (code: string) => checks.find((check) => check.check_code === code)?.status ?? "not tested";

  async function record(code: "lip_sync_visual_review" | "livekit_latency", status: "passed" | "failed", notes: string, measured?: number) {
    setBusy(code); setError(null);
    try {
      await api(`/api/v1/replicas/${profileId}/quality-checks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, status, notes, measured_value: measured }) });
      await onRefresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not record review evidence."); }
    finally { setBusy(null); }
  }

  return <section className="replica-quality-review"><div><p className="eyebrow">Human + runtime evidence</p><h3>Review source preservation and LiveKit delivery</h3><p>Use the staged GPU render and real room test. Do not pass either gate from the capture preview alone.</p></div>{error && <div className="review-warning"><CircleAlert size={17} />{error}</div>}<div className="replica-evidence-grid"><article><StatusPill tone={toneForStatus(latest("lip_sync_visual_review"))}>{latest("lip_sync_visual_review").replaceAll("_", " ")}</StatusPill><h3>Visual preservation</h3><p>Compare mouth sync while confirming the real blink, gaze, breath, shoulders and hand gesture remain unchanged.</p><textarea value={visualNotes} onChange={(event) => setVisualNotes(event.target.value)} placeholder="Reviewer, source/output clips, observed sync and motion integrity…" /><div className="editor-actions"><button className="primary-button" disabled={!processingReady || visualNotes.trim().length < 10 || busy !== null} type="button" onClick={() => record("lip_sync_visual_review", "passed", visualNotes)}>Pass with evidence</button><button className="secondary-button" disabled={!processingReady || visualNotes.trim().length < 10 || busy !== null} type="button" onClick={() => record("lip_sync_visual_review", "failed", visualNotes)}>Fail</button></div></article><article><StatusPill tone={toneForStatus(latest("livekit_latency"))}>{latest("livekit_latency").replaceAll("_", " ")}</StatusPill><h3>LiveKit latency</h3><p>Measure speech-to-first-responsive-frame on the deployed GPU path and record the test environment.</p><input inputMode="numeric" value={latency} onChange={(event) => setLatency(event.target.value)} placeholder="Measured milliseconds" /><textarea value={latencyNotes} onChange={(event) => setLatencyNotes(event.target.value)} placeholder="Room, GPU image tag, network profile and test run…" /><div className="editor-actions"><button className="primary-button" disabled={!processingReady || latencyNotes.trim().length < 10 || !Number(latency) || busy !== null} type="button" onClick={() => record("livekit_latency", Number(latency) <= 1500 ? "passed" : "failed", latencyNotes, Number(latency))}>Record measurement</button></div></article></div></section>;
}

function WorkflowCard({ icon: Icon, title, copy, action, onAction, complete = false }: { icon: typeof Camera; title: string; copy: string; action: string; onAction: () => void | Promise<void>; complete?: boolean }) {
  return <section className="replica-workflow-card"><span><Icon size={25} /></span><div><StatusPill tone={complete ? "good" : "muted"}>{complete ? "Complete" : "Confirm"}</StatusPill><h3>{title}</h3><p>{copy}</p><button className="primary-button" type="button" onClick={onAction}>{action}<ArrowRight size={16} /></button></div></section>;
}

function CaptureCard({ profileId, capture, uploaded, disabled, onUploaded }: { profileId: string; capture: { type: ReplicaSegmentType; gesture?: ReplicaGesture; label: string; instruction: string }; uploaded: boolean; disabled: boolean; onUploaded: () => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleRecording() {
    if (recorderRef.current && recording) { recorderRef.current.stop(); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 25, max: 30 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      chunksRef.current = [];
      const preferredType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferredType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { setRecording(false); stream.getTracks().forEach((track) => track.stop()); void upload(new Blob(chunksRef.current, { type: recorder.mimeType })); };
      recorder.start(500);
      setRecording(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Camera or microphone access was unavailable."); }
  }

  async function upload(blob: Blob) {
    setBusy(true); setError(null);
    try {
      const contentType = blob.type.split(";")[0] || "video/webm";
      const sha256 = await sha256Hex(blob);
      const intent = await api<{ segment_id: string; upload_url: string; required_headers: Record<string, string> }>(`/api/v1/replicas/${profileId}/upload-intents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ segment_type: capture.type, gesture_key: capture.gesture, content_type: contentType, file_name: `capture.${contentType === "video/mp4" ? "mp4" : "webm"}`, byte_size: blob.size, sha256 }) });
      const uploadResponse = await fetch(intent.upload_url, { method: "PUT", headers: intent.required_headers, body: blob });
      if (!uploadResponse.ok) throw new Error("The private capture upload failed.");
      const settings = streamRef.current?.getVideoTracks()[0]?.getSettings();
      await api(`/api/v1/replicas/${profileId}/segments/${intent.segment_id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ width: settings?.width, height: settings?.height, fps: settings?.frameRate, starts_neutral: true, ends_neutral: true }) });
      await onUploaded();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this capture."); }
    finally { setBusy(false); }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  return <article className={`replica-capture-card${uploaded ? " complete" : ""}`}><div className="capture-preview"><video ref={videoRef} muted playsInline /><span>{recording ? "Recording" : uploaded ? "Captured" : "Camera preview"}</span></div><div><StatusPill tone={uploaded ? "good" : disabled ? "warn" : "muted"}>{uploaded ? "Uploaded" : disabled ? "Storage required" : "Required"}</StatusPill><h3>{capture.label}</h3><p>{capture.instruction}</p>{error && <small className="capture-error">{error}</small>}<button className={recording ? "secondary-button" : "primary-button"} type="button" disabled={disabled || busy || uploaded} onClick={toggleRecording}>{busy ? <RefreshCw className="spin" size={16} /> : recording ? <CircleCheck size={16} /> : <Camera size={16} />}{busy ? "Encrypting & uploading…" : recording ? "Stop capture" : uploaded ? "Capture complete" : "Start capture"}</button></div></article>;
}
