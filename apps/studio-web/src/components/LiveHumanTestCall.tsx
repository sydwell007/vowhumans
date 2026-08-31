"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { Check, CircleAlert, Mic, MicOff, PhoneOff, RefreshCw, Sparkles } from "lucide-react";
import { StatusPill } from "./StatusPill";
import { LanguageSelect } from "./LanguageSelect";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";

// A real disclosed LiveKit call — the same session type, API calls and
// LiveVoiceRoom component the Live Sessions page uses for its own test
// calls — embedded inline wherever a specific Digital Human is already
// selected (its Digital Humans detail page), so testing "how will this
// behave when deployed" doesn't require leaving the page you just
// configured it on. Every call this starts is a real session: it shows up
// in the Live Sessions monitor exactly like an embedded-application call
// would, because it goes through the identical /api/v1/live-sessions flow.
export type LiveTestHuman = { id: string; name: string; faceAssetId: string | null; defaultLanguageCode: string };

type CallStage = "idle" | "starting" | "live" | "ended";

function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LiveHumanTestCall({ human, ready, notReadyReason }: { human: LiveTestHuman; ready: boolean; notReadyReason?: string }) {
  const [callStage, setCallStage] = useState<CallStage>("idle");
  const [selectedLanguage, setSelectedLanguage] = useState(human.defaultLanguageCode || "en-ZA");
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
  const [error, setError] = useState<string | null>(null);
  const [tooManyActive, setTooManyActive] = useState(false);
  const [clearingStuckSessions, setClearingStuckSessions] = useState(false);

  useEffect(() => {
    if (callStage !== "live" || !callStartedAt) return;
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [callStage, callStartedAt]);

  // The room can connect (WebRTC-wise) with nobody home — realtime-agent-worker
  // is a separate deployed service that can silently refuse the job — and
  // there's otherwise no client-visible sign of that; the call just sits on
  // "Listening" forever. Surface it instead of leaving that indistinguishable
  // from a real, working, quiet room.
  useEffect(() => {
    if (callStage !== "live" || liveStatus !== "connected" || agentJoined) return;
    const timeout = window.setTimeout(() => setNoAgentTimeout(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [callStage, liveStatus, agentJoined]);

  async function reportEvent(sessionId: string, eventType: string, payload: Record<string, unknown>) {
    await fetch(`/api/v1/live-sessions/${sessionId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_type: eventType, payload }) }).catch(() => {});
  }

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

  async function clearStuckSessions() {
    setClearingStuckSessions(true);
    try {
      await fetch("/api/v1/live-sessions/end-active", { method: "POST" });
      setTooManyActive(false);
      setError(null);
    } catch {
      // The retry below will surface the same error again if this didn't help.
    } finally {
      setClearingStuckSessions(false);
    }
  }

  async function startTestCall() {
    if (!ready || callStage === "starting") return;
    setError(null);
    setTooManyActive(false);
    setCallStage("starting");
    setReconnectedThisCall(false);
    setCallSummary(null);
    setAgentJoined(false);
    setNoAgentTimeout(false);
    try {
      const sessionRes = await fetch("/api/v1/live-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digital_human_id: human.id, requested_language: selectedLanguage }) });
      const sessionBody = await sessionRes.json().catch(() => ({}));
      if (!sessionRes.ok) {
        if (sessionBody.code === "TOO_MANY_ACTIVE_SESSIONS") setTooManyActive(true);
        throw new Error(sessionBody.message || "Could not start this test call.");
      }
      const sessionId = sessionBody.data.session_id as string;
      setActiveSessionId(sessionId);
      const tokenRes = await fetch(`/api/v1/live-sessions/${sessionId}/token`, { method: "POST" });
      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenBody?.data?.url || !tokenBody?.data?.token) throw new Error(tokenBody.message || "Could not connect the live call.");
      setLiveRoom({ url: tokenBody.data.url, token: tokenBody.data.token });
      const startedAt = Date.now();
      setCallStartedAt(startedAt);
      setElapsedSeconds(0);
      setCallStage("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this test call.");
      setCallStage("idle");
      setActiveSessionId(null);
    }
  }

  async function endTestCall() {
    const sessionId = activeSessionId;
    const duration = formatCallDuration(elapsedSeconds);
    setLiveRoom(null);
    setCallStage("ended");
    setCallSummary({ duration, reconnected: reconnectedThisCall });
    if (sessionId) {
      try {
        const response = await fetch(`/api/v1/live-sessions/${sessionId}/end`, { method: "POST" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "The call ended locally, but its server session could not be closed.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "The call ended locally, but its server session could not be closed.");
      }
    }
  }

  function testAgain() {
    setCallStage("idle");
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
    <section className="panel test-console live-human-test-console">
      {error && (
        <div className="review-warning">
          <CircleAlert size={17} />
          <span>{error}</span>
          {tooManyActive && (
            <button className="plain-button" type="button" disabled={clearingStuckSessions} onClick={clearStuckSessions}>
              {clearingStuckSessions ? <RefreshCw size={13} className="spin" /> : null}
              {clearingStuckSessions ? "Clearing…" : "Clear stuck sessions"}
            </button>
          )}
        </div>
      )}
      {callStage === "live" && liveRoom ? (
        <div className="live-call-stage">
          <span className="embed-disclosure"><Sparkles size={13} />Testing {human.name} — AI-generated, not a real person</span>
          <LiveVoiceRoom
            url={liveRoom.url}
            token={liveRoom.token}
            muted={muted}
            portraitUrl={human.faceAssetId ? `/api/v1/faces/${human.faceAssetId}/image` : undefined}
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
              <span>Connected, but no voice agent has joined. The realtime voice provider likely isn&rsquo;t configured in this environment — check Realtime health on Live Sessions, or see docs/LIVE_VOICE_DEPLOYMENT.md.</span>
            </div>
          )}
          <div className="live-call-meta">
            {stateChip && <StatusPill tone={stateChip.tone}>{stateChip.label}</StatusPill>}
            <strong className="live-call-timer">{formatCallDuration(elapsedSeconds)}</strong>
          </div>
          <div className="live-call-controls">
            <button aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} className={muted ? "muted" : ""} onClick={() => setMuted((v) => !v)}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
            <LanguageSelect value={selectedLanguage} onChange={switchLanguage} capability="realtime" scope="usable-only" disabled={switchingLanguage} />
            <button className="end-call" onClick={endTestCall}><PhoneOff size={16} />End call</button>
          </div>
          {languageSwitchNote && <p className="panel-note">{languageSwitchNote}</p>}
        </div>
      ) : callStage === "ended" && callSummary ? (
        <div className="call-summary">
          <span className="empty-icon"><Check size={24} /></span>
          <p className="eyebrow">Test call complete</p>
          <h2>{callSummary.duration} with {human.name}</h2>
          <p>{callSummary.reconnected ? "The connection recovered from a reconnect during this call." : "No reconnects during this call."} It now appears in the Live Sessions monitor.</p>
          <button className="secondary-button" onClick={testAgain}><RefreshCw size={15} />Test again</button>
        </div>
      ) : (
        <>
          <PanelHeading name={human.name} />
          {ready ? (
            <>
              <label className="pre-call-language">Conversation language
                <LanguageSelect value={selectedLanguage} onChange={setSelectedLanguage} capability="realtime" scope="usable-only" showStatusBadge />
              </label>
              <button className="primary-button" type="button" disabled={callStage === "starting"} onClick={startTestCall}>
                {callStage === "starting" ? <RefreshCw size={17} className="spin" /> : <Mic size={17} />}
                {callStage === "starting" ? "Connecting…" : `Start live test call with ${human.name}`}
              </button>
              <p className="panel-note">Starts in {selectedLanguage} and keeps that language until the user explicitly asks to switch. The call uses {human.name}&rsquo;s published Persona, voice and knowledge.</p>
            </>
          ) : (
            <p className="panel-note">{notReadyReason ?? "Publish this VowHuman's Persona before running a live test call."}</p>
          )}
        </>
      )}
    </section>
  );
}

function PanelHeading({ name }: { name: string }) {
  return (
    <div className="panel-title">
      <div>
        <p className="eyebrow">Real live voice + avatar call</p>
        <h2>Test {name}</h2>
      </div>
      <StatusPill tone="good">Live</StatusPill>
    </div>
  );
}
