"use client";

import { useEffect, useRef, useState } from "react";
import { RemoteTrackPublication, Room, RoomEvent, Track } from "livekit-client";
import { LIVE_LANGUAGE_SWITCH_APPLIED_TOPIC, type LiveLanguageApplied } from "@/lib/liveLanguage";

export type LiveVoiceRoomStatus = "connecting" | "connected" | "error" | "disconnected";

// Tracks published by the avatar-participant service (services/avatar-participant)
// under these fixed names — see services/api-gateway/main.py's RoomAgentDispatch and
// PROVIDERS.md's "avatar participant" design note. Identified by track name, not
// participant identity, since the voice agent's own dispatched identity isn't
// something this app controls or can rely on.
const AVATAR_TRACK_PREFIX = "vhm-avatar-";

export function LiveVoiceRoom({ url, token, muted, portraitUrl, onStatusChange, onSpeakingChange, onFirstAudio, onReconnected, onRoomReady, onLanguageApplied, onVoiceError }: { url: string; token: string; muted: boolean; portraitUrl?: string; onStatusChange?: (status: LiveVoiceRoomStatus) => void; onSpeakingChange?: (speaking: boolean) => void; onFirstAudio?: () => void; onReconnected?: () => void; onRoomReady?: (room: Room) => void; onLanguageApplied?: (event: LiveLanguageApplied) => void; onVoiceError?: (message: string, code?: string) => void }) {
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [hasAvatarVideo, setHasAvatarVideo] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const onFirstAudioRef = useRef(onFirstAudio);
  const onReconnectedRef = useRef(onReconnected);
  const onRoomReadyRef = useRef(onRoomReady);
  const onLanguageAppliedRef = useRef(onLanguageApplied);
  const onVoiceErrorRef = useRef(onVoiceError);
  const firstAudioFiredRef = useRef(false);
  // The voice and avatar agents publish the same speech on separate tracks. Keep
  // every raw publication so avatar mode can be exclusive even across reconnects
  // or when the readiness data packet arrived before the browser joined.
  const avatarModeRef = useRef(false);
  const rawAudioElsRef = useRef(new Set<HTMLMediaElement>());
  const rawAudioPublicationsRef = useRef(new Set<RemoteTrackPublication>());

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onSpeakingChange]);

  useEffect(() => {
    onFirstAudioRef.current = onFirstAudio;
  }, [onFirstAudio]);

  useEffect(() => {
    onReconnectedRef.current = onReconnected;
  }, [onReconnected]);

  useEffect(() => {
    onRoomReadyRef.current = onRoomReady;
  }, [onRoomReady]);

  useEffect(() => {
    onLanguageAppliedRef.current = onLanguageApplied;
  }, [onLanguageApplied]);

  useEffect(() => {
    onVoiceErrorRef.current = onVoiceError;
  }, [onVoiceError]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    const rawAudioEls = rawAudioElsRef.current;
    const rawAudioPublications = rawAudioPublicationsRef.current;
    roomRef.current = room;
    avatarModeRef.current = false;
    rawAudioEls.clear();
    rawAudioPublications.clear();
    firstAudioFiredRef.current = false;
    const notify = (status: LiveVoiceRoomStatus) => {
      if (!cancelled) onStatusChangeRef.current?.(status);
    };

    const setAvatarMode = (enabled: boolean) => {
      avatarModeRef.current = enabled;
      rawAudioEls.forEach((element) => {
        element.muted = enabled;
      });
      rawAudioPublications.forEach((publication) => {
        publication.setSubscribed(!enabled);
      });
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication) => {
      const isAvatarTrack = publication.trackName?.startsWith(AVATAR_TRACK_PREFIX) ?? false;

      if (track.kind === Track.Kind.Audio) {
        if (isAvatarTrack) {
          // The track itself is a durable readiness signal. Switch before
          // attaching it so raw and synchronized audio cannot overlap even if
          // the readiness data packet was sent before this page connected.
          setAvatarMode(true);
        } else {
          rawAudioPublications.add(publication);
          if (avatarModeRef.current) {
            publication.setSubscribed(false);
            return;
          }
        }
        const element = track.attach() as HTMLMediaElement;
        element.autoplay = true;
        if (!isAvatarTrack) {
          element.muted = false;
          rawAudioEls.add(element);
        }
        audioContainerRef.current?.appendChild(element);
      } else if (track.kind === Track.Kind.Video && isAvatarTrack) {
        const element = track.attach() as HTMLVideoElement;
        element.autoplay = true;
        element.playsInline = true;
        videoContainerRef.current?.appendChild(element);
        setHasAvatarVideo(true);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
      track.detach().forEach((element) => {
        rawAudioEls.delete(element as HTMLMediaElement);
        element.remove();
      });
      const isAvatarTrack = publication.trackName?.startsWith(AVATAR_TRACK_PREFIX) ?? false;
      if (isAvatarTrack && track.kind === Track.Kind.Audio) {
        // Avatar-participant dropped mid-call (crash, GPU pod down, etc.) — fall
        // back to the raw agent track so the conversation stays audible.
        setAvatarMode(false);
      }
      if (isAvatarTrack && track.kind === Track.Kind.Video) {
        setHasAvatarVideo(false);
      }
    });

    room.on(RoomEvent.TrackUnpublished, (publication) => {
      rawAudioPublications.delete(publication);
    });

    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; language_code?: string; phase?: string; code?: string; message?: string };
        if (message?.type === "vhm_avatar_ready") {
          setAvatarMode(true);
        } else if (
          message?.type === LIVE_LANGUAGE_SWITCH_APPLIED_TOPIC
          && typeof message.language_code === "string"
          && (message.phase === "initial" || message.phase === "switch")
        ) {
          onLanguageAppliedRef.current?.({ languageCode: message.language_code, phase: message.phase });
        } else if (message?.type === "vhm_voice_error" && typeof message.message === "string") {
          onVoiceErrorRef.current?.(message.message, message.code);
        }
      } catch {
        // Not a message this component cares about.
      }
    });

    room.on(RoomEvent.Disconnected, () => notify("disconnected"));
    room.on(RoomEvent.Reconnected, () => {
      if (!cancelled) onReconnectedRef.current?.();
    });

    // "Speaking" means the agent (any remote participant — voice agent or avatar
    // participant), never the local user's own mic — this only ever runs 1:1
    // calls, so any active remote speaker is unambiguously the agent.
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (cancelled) return;
      const agentSpeaking = speakers.some((speaker) => speaker.sid !== room.localParticipant.sid);
      onSpeakingChangeRef.current?.(agentSpeaking);
      // A subscribed track can remain completely silent when the provider
      // fails. Count first audio only after LiveKit detects remote speech.
      if (agentSpeaking && !firstAudioFiredRef.current) {
        firstAudioFiredRef.current = true;
        onFirstAudioRef.current?.();
      }
    });

    notify("connecting");
    room
      .connect(url, token)
      .then(() => {
        notify("connected");
        if (!cancelled) onRoomReadyRef.current?.(room);
        // Microphone access is optional for a presenter session. A blocked or
        // unavailable input must not turn an otherwise connected, listen-only
        // lesson into a failed call.
        return room.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
      })
      .catch(() => notify("error"));

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      rawAudioEls.clear();
      rawAudioPublications.clear();
    };
    // Reconnect only when the room identity (url/token) changes; mute is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  useEffect(() => {
    roomRef.current?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }, [muted]);

  return (
    <>
      <div ref={audioContainerRef} className="live-voice-audio" aria-hidden="true" />
      <div ref={videoContainerRef} className="live-voice-video" aria-hidden="true">
        {portraitUrl && !hasAvatarVideo && (
          // The portrait is the approved face for this short-lived embed session.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portraitUrl} alt="" />
        )}
      </div>
    </>
  );
}
