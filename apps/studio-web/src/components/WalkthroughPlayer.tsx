"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { walkthroughFrames } from "@/lib/walkthrough";
import { WalkthroughFrame } from "./WalkthroughFrame";

const FRAME_DURATION_MS = 5500;

export function WalkthroughPlayer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(() => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setTimeout(() => {
      setFrameIndex((current) => {
        if (current + 1 >= walkthroughFrames.length) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, FRAME_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [frameIndex, playing]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === " ") { event.preventDefault(); setPlaying((current) => !current); return; }
      if (event.key === "ArrowRight") setFrameIndex((current) => Math.min(current + 1, walkthroughFrames.length - 1));
      if (event.key === "ArrowLeft") setFrameIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const frame = walkthroughFrames[frameIndex];
  const isLast = frameIndex === walkthroughFrames.length - 1;

  function tryItYourself() {
    onClose();
    router.push("/studio/digital-humans");
  }

  return (
    <div className="walkthrough-overlay" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="walkthrough-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Automated Studio walkthrough"
      >
        <header className="walkthrough-head">
          <div className="walkthrough-segments" aria-hidden="true">
            {walkthroughFrames.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index <= frameIndex ? "filled" : ""}
                onClick={() => setFrameIndex(index)}
                aria-label={`Go to step ${index + 1}: ${item.title}`}
              />
            ))}
          </div>
          <button className="icon-button" type="button" aria-label="Close walkthrough" onClick={onClose}><X size={18} /></button>
        </header>

        <p className="walkthrough-demo-notice">Automated preview · illustrative example, not your real data</p>

        <WalkthroughFrame frame={frame} />

        <footer className="walkthrough-controls">
          <div className="walkthrough-transport">
            <button className="icon-button" type="button" aria-label="Previous" disabled={frameIndex === 0} onClick={() => setFrameIndex((c) => Math.max(0, c - 1))}><ChevronLeft size={17} /></button>
            <button className="icon-button" type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((c) => !c)}>
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button className="icon-button" type="button" aria-label="Next" disabled={isLast} onClick={() => setFrameIndex((c) => Math.min(walkthroughFrames.length - 1, c + 1))}><ChevronRight size={17} /></button>
            <span>Step {frameIndex + 1} of {walkthroughFrames.length}</span>
          </div>
          <button className="primary-button" type="button" onClick={tryItYourself}>
            Try it yourself<ArrowRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  );
}
