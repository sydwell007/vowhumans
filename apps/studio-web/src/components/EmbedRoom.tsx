"use client";

import { CircleAlert, Mic, MicOff, RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";
import { Rigged3DRoom } from "./Rigged3DRoom";

type Stage = "consent" | "connecting" | "live" | "error";

export function EmbedRoom({ digitalHumanId, applicationSlug }: { digitalHumanId: string; applicationSlug: string }) {
  const [stage, setStage] = useState<Stage>("consent");
  const [muted, setMuted] = useState(false);
  const [liveRoom, setLiveRoom] = useState<{
    renderer: "live_voice" | "rigged_3d";
    url: string;
    token?: string;
    voiceUrl?: string;
    sessionId?: string;
    portraitUrl?: string;
  } | null>(null);
  const [voiceFallback, setVoiceFallback] = useState<{ sessionId: string; portraitUrl?: string } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveVoiceRoomStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastRiggedState = useRef<string | null>(null);

  function sendRiggedControl(sessionId: string, message: { type: "state"; state: string } | { type: "motion"; intent: string }) {
    if (message.type === "state") {
      if (lastRiggedState.current === message.state) return;
      lastRiggedState.current = message.state;
    }
    void fetch("/api/public/v1/rigged-3d-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, ...message }) }).catch(() => undefined);
  }

  async function connectVoiceFallback(sessionId: string, portraitUrl?: string) {
    setStage("connecting");
    setErrorMessage(null);
    setVoiceFallback(null);
    try {
      const tokenRes = await fetch("/api/public/v1/embed-livekit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const tokenBody = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok || !tokenBody?.data?.url || !tokenBody?.data?.token) {
        setErrorMessage(tokenBody?.message || "The AI presenter could not start. Please try again shortly.");
        setStage("error");
        return;
      }
      setLiveRoom({ renderer: "live_voice", url: tokenBody.data.url, token: tokenBody.data.token, portraitUrl });
      setStage("live");
    } catch {
      setErrorMessage("Could not start the live voice fallback.");
      setStage("error");
    }
  }

  async function start() {
    setStage("connecting");
    setErrorMessage(null);
    lastRiggedState.current = null;
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const lessonContextToken = hashParams.get("lesson_context_token");
      const languageCode = hashParams.get("language_code");
      const sessionRes = await fetch("/api/public/v1/embed-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          digital_human_id: digitalHumanId,
          application_slug: applicationSlug,
          ...(lessonContextToken ? { lesson_context_token: lessonContextToken } : {}),
          ...(languageCode ? { language_code: languageCode } : {}),
        }),
      });
      const sessionBody = await sessionRes.json().catch(() => null);
      if (!sessionRes.ok || !sessionBody?.data?.session_id) {
        setErrorMessage(sessionBody?.message || "This digital human is not available here.");
        setStage("error");
        return;
      }
      const portraitUrl = typeof sessionBody.data.portrait_url === "string" ? sessionBody.data.portrait_url : undefined;
      if (sessionBody.data.renderer_tier === "rigged_3d") {
        const requestOptions = {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: sessionBody.data.session_id }),
        };
        const voiceRes = await fetch("/api/public/v1/embed-livekit", requestOptions);
        const voiceBody = await voiceRes.json().catch(() => null);
        if (!voiceRes.ok || !voiceBody?.data?.url || !voiceBody?.data?.token) {
          setErrorMessage(voiceBody?.message || "The 3D human could not connect to its live voice.");
          setStage("error");
          return;
        }
        const riggedRes = await fetch("/api/public/v1/rigged-3d-session", requestOptions);
        const riggedBody = await riggedRes.json().catch(() => null);
        if (!riggedRes.ok || !riggedBody?.data?.player_url) {
          setVoiceFallback({ sessionId: sessionBody.data.session_id, portraitUrl });
          setErrorMessage(riggedBody?.message || "3D capacity is unavailable. You can use the disclosed live voice fallback.");
          setStage("error");
          return;
        }
        setLiveRoom({ renderer: "rigged_3d", url: riggedBody.data.player_url, voiceUrl: voiceBody.data.url, token: voiceBody.data.token, sessionId: sessionBody.data.session_id });
        setStage("live");
        return;
      }
      await connectVoiceFallback(sessionBody.data.session_id, portraitUrl);
    } catch {
      setErrorMessage("Could not start the live call.");
      setStage("error");
    }
  }

  return (
    <div className="embed-room">
      {stage === "consent" && (
        <div className="embed-consent">
          <Sparkles size={22} />
          <p>You&rsquo;re about to talk with an AI-generated digital human, not a real person.</p>
          <button type="button" onClick={start}><Mic size={16} />Start call</button>
        </div>
      )}
      {stage === "connecting" && <div className="embed-status">Connecting…</div>}
      {stage === "error" && (
        <div className="embed-status embed-error" role="alert">
          <span><CircleAlert size={18} />{errorMessage}</span>
          <button type="button" onClick={start}><RefreshCw size={14} />Try again</button>
          {voiceFallback && <button type="button" onClick={() => connectVoiceFallback(voiceFallback.sessionId, voiceFallback.portraitUrl)}><Mic size={14} />Use voice fallback</button>}
        </div>
      )}
      {stage === "live" && liveRoom && (
        <div className="embed-live">
          <span className="embed-disclosure"><Sparkles size={13} />AI-generated digital human</span>
          {liveRoom.renderer === "live_voice" && liveStatus !== "connected" && (
            <div className="embed-status embed-status-overlay">{liveStatus === "error" ? "Live call failed to connect." : "Connecting…"}</div>
          )}
          {liveRoom.renderer === "rigged_3d" ? <><Rigged3DRoom playerUrl={liveRoom.url} /><div className="rigged-voice-bridge"><LiveVoiceRoom url={liveRoom.voiceUrl!} token={liveRoom.token!} muted={muted} onStatusChange={setLiveStatus} onSpeakingChange={(speaking) => sendRiggedControl(liveRoom.sessionId!, { type: "state", state: speaking ? "speaking" : "listening" })} onFirstAudio={() => sendRiggedControl(liveRoom.sessionId!, { type: "motion", intent: "welcome" })} /></div></> : (
            <>
              <LiveVoiceRoom
                url={liveRoom.url}
                token={liveRoom.token!}
                muted={muted}
                portraitUrl={liveRoom.portraitUrl}
                onStatusChange={setLiveStatus}
              />
            </>
          )}
          <div className="embed-controls">
            <button type="button" aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} className={muted ? "muted" : ""} onClick={() => setMuted((value) => !value)}>
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
