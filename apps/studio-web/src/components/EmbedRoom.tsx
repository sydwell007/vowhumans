"use client";

import { CircleAlert, Mic, MicOff, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";

type Stage = "consent" | "connecting" | "live" | "error";

export function EmbedRoom({ digitalHumanId, applicationSlug }: { digitalHumanId: string; applicationSlug: string }) {
  const [stage, setStage] = useState<Stage>("consent");
  const [muted, setMuted] = useState(false);
  const [liveRoom, setLiveRoom] = useState<{
    url: string;
    token: string;
    portraitUrl?: string;
  } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveVoiceRoomStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function start() {
    setStage("connecting");
    setErrorMessage(null);
    try {
      const lessonContextToken = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      ).get("lesson_context_token");
      const sessionRes = await fetch("/api/public/v1/embed-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          digital_human_id: digitalHumanId,
          application_slug: applicationSlug,
          ...(lessonContextToken ? { lesson_context_token: lessonContextToken } : {}),
        }),
      });
      const sessionBody = await sessionRes.json().catch(() => null);
      if (!sessionRes.ok || !sessionBody?.data?.session_id) {
        setErrorMessage(sessionBody?.message || "This digital human is not available here.");
        setStage("error");
        return;
      }
      const tokenRes = await fetch("/api/public/v1/embed-livekit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionBody.data.session_id }),
      });
      const tokenBody = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok || !tokenBody?.data?.url || !tokenBody?.data?.token) {
        setErrorMessage(tokenBody?.message || "The AI presenter could not start. Please try again shortly.");
        setStage("error");
        return;
      }
      setLiveRoom({
        url: tokenBody.data.url,
        token: tokenBody.data.token,
        portraitUrl:
          typeof sessionBody.data.portrait_url === "string"
            ? sessionBody.data.portrait_url
            : undefined,
      });
      setStage("live");
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
        </div>
      )}
      {stage === "live" && liveRoom && (
        <div className="embed-live">
          <span className="embed-disclosure"><Sparkles size={13} />AI-generated digital human</span>
          {liveStatus !== "connected" && (
            <div className="embed-status embed-status-overlay">{liveStatus === "error" ? "Live call failed to connect." : "Connecting…"}</div>
          )}
          <LiveVoiceRoom
            url={liveRoom.url}
            token={liveRoom.token}
            muted={muted}
            portraitUrl={liveRoom.portraitUrl}
            onStatusChange={setLiveStatus}
          />
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
