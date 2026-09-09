"use client";

import { CircleAlert, Mic, MicOff, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";
import { Rigged3DRoom } from "./Rigged3DRoom";
import { publishLiveLanguageSwitch } from "@/lib/liveLanguage";

type Stage = "consent" | "connecting" | "live" | "error";

// Messages this embed posts to a hosting partner (e.g. PlugConnect's Interview
// Practice room). No secrets — status only — so posting to "*" is fine; the
// partner filters on event.origin. The partner may post back
// { type: "vhm_language_switch", language_code } to change the active language.
type ParentMessage =
  | { source: "vowhumans-embed"; type: "status"; value: Stage }
  | { source: "vowhumans-embed"; type: "speaking"; value: boolean }
  | { source: "vowhumans-embed"; type: "panelist"; name: string }
  | { source: "vowhumans-embed"; type: "ended" }
  | { source: "vowhumans-embed"; type: "error"; message: string };

function postToParent(message: ParentMessage) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, "*");
    }
  } catch {
    // Cross-origin frame with a locked-down parent — nothing to do.
  }
}

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
  const [panel, setPanel] = useState<{
    names: [string, string];
    partnerPortraitUrl?: string;
    active: string | null;
  } | null>(null);
  const lastRiggedState = useRef<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    postToParent({ source: "vowhumans-embed", type: "status", value: stage });
    if (stage === "error" && errorMessage) {
      postToParent({ source: "vowhumans-embed", type: "error", message: errorMessage });
    }
  }, [stage, errorMessage]);

  function handleLiveStatus(status: LiveVoiceRoomStatus) {
    setLiveStatus(status);
    if (status === "disconnected") {
      postToParent({ source: "vowhumans-embed", type: "ended" });
    }
  }

  // Partner -> embed language switch, forwarded to the running realtime agent.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; language_code?: string } | null;
      if (!data || data.type !== "vhm_language_switch" || typeof data.language_code !== "string") return;
      const room = roomRef.current;
      if (room) void publishLiveLanguageSwitch(room, data.language_code).catch(() => undefined);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function readHash() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return {
      lessonContextToken: params.get("lesson_context_token"),
      interviewContextToken: params.get("interview_context_token"),
      languageCode: params.get("language_code"),
      panelPartnerId: params.get("panel_partner_id"),
      panelists: params.get("panelists"),
      isPanel: params.get("panel") === "1",
      autostart: params.get("autostart") === "1",
    };
  }

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
      const hash = readHash();
      const sessionRes = await fetch("/api/public/v1/embed-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          digital_human_id: digitalHumanId,
          application_slug: applicationSlug,
          ...(hash.lessonContextToken ? { lesson_context_token: hash.lessonContextToken } : {}),
          ...(hash.interviewContextToken ? { interview_context_token: hash.interviewContextToken } : {}),
          ...(hash.languageCode ? { language_code: hash.languageCode } : {}),
          ...(hash.isPanel && hash.panelPartnerId ? { panel_partner_id: hash.panelPartnerId } : {}),
        }),
      });
      const sessionBody = await sessionRes.json().catch(() => null);
      if (!sessionRes.ok || !sessionBody?.data?.session_id) {
        setErrorMessage(sessionBody?.message || "This digital human is not available here.");
        setStage("error");
        return;
      }
      const portraitUrl = typeof sessionBody.data.portrait_url === "string" ? sessionBody.data.portrait_url : undefined;

      if (hash.isPanel) {
        const rawNames = (hash.panelists || "Thandi,Sipho").split(",").map((n) => n.trim()).filter(Boolean);
        const names: [string, string] = [rawNames[0] || "Thandi", rawNames[1] || "Sipho"];
        setPanel({
          names,
          partnerPortraitUrl:
            typeof sessionBody.data.panel_partner_portrait_url === "string"
              ? sessionBody.data.panel_partner_portrait_url
              : undefined,
          active: names[0],
        });
      }

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

  // Optional auto-start: the partner already collected the disclosure + mic
  // consent on its own page, so skip the extra click. The disclosure line still
  // shows inside the live view. Deferred with a timeout so the initial setState
  // does not run synchronously inside the mount effect.
  const autostartFiredRef = useRef(false);
  useEffect(() => {
    if (autostartFiredRef.current || typeof window === "undefined") return;
    if (!readHash().autostart) return;
    autostartFiredRef.current = true;
    const timer = setTimeout(() => { void start(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {panel && (
            <div className="embed-panel-strip" aria-label="Interview panel">
              {panel.names.map((name, index) => {
                const tileUrl = index === 0 ? liveRoom.portraitUrl : panel.partnerPortraitUrl;
                return (
                  <div key={name} className={`embed-panel-tile${panel.active === name ? " active" : ""}`}>
                    {tileUrl && (
                      // Approved face for this short-lived embed session.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tileUrl} alt="" />
                    )}
                    <span>{name}<small>{panel.active === name ? "Speaking" : "Listening"}</small></span>
                  </div>
                );
              })}
            </div>
          )}
          {liveRoom.renderer === "live_voice" && liveStatus !== "connected" && (
            <div className="embed-status embed-status-overlay">{liveStatus === "error" ? "Live call failed to connect." : "Connecting…"}</div>
          )}
          {liveRoom.renderer === "rigged_3d" ? <><Rigged3DRoom playerUrl={liveRoom.url} /><div className="rigged-voice-bridge"><LiveVoiceRoom url={liveRoom.voiceUrl!} token={liveRoom.token!} muted={muted} onStatusChange={handleLiveStatus} onRoomReady={(room) => { roomRef.current = room; }} onSpeakingChange={(speaking) => sendRiggedControl(liveRoom.sessionId!, { type: "state", state: speaking ? "speaking" : "listening" })} onFirstAudio={() => sendRiggedControl(liveRoom.sessionId!, { type: "motion", intent: "welcome" })} /></div></> : (
            <>
              <LiveVoiceRoom
                url={liveRoom.url}
                token={liveRoom.token!}
                muted={muted}
                portraitUrl={liveRoom.portraitUrl}
                onStatusChange={handleLiveStatus}
                onRoomReady={(room) => { roomRef.current = room; }}
                onSpeakingChange={(speaking) => postToParent({ source: "vowhumans-embed", type: "speaking", value: speaking })}
                onPanelist={(name) => {
                  setPanel((current) => {
                    if (!current) return current;
                    const matched = current.names.find((n) => n.toLowerCase().startsWith(name.toLowerCase())) ?? current.active;
                    return { ...current, active: matched };
                  });
                  postToParent({ source: "vowhumans-embed", type: "panelist", name });
                }}
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
