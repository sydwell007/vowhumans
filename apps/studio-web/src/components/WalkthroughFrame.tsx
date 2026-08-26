import { BadgeCheck, Check, Sparkles } from "lucide-react";
import type { WalkthroughFrame as Frame } from "@/lib/walkthrough";

export function WalkthroughFrame({ frame }: { frame: Frame }) {
  return (
    <div className={`walkthrough-frame track-${frame.track}`}>
      <p className="eyebrow">{frame.trackLabel}</p>
      <h3>{frame.title}</h3>
      <p className="walkthrough-caption">{frame.caption}</p>
      {frame.kind === "intro" && (
        <div className="walkthrough-intro-mark">
          <Sparkles size={26} />
        </div>
      )}
      {frame.kind === "form" && (
        <div className="walkthrough-mock-form">
          {frame.fields.map((field) => (
            <div key={field.label}>
              <small>{field.label}</small>
              <span>{field.value}</span>
            </div>
          ))}
        </div>
      )}
      {frame.kind === "checklist" && (
        <div className="walkthrough-mock-checklist">
          {frame.checks.map((check) => (
            <div key={check.label} className={check.done ? "done" : ""}>
              <Check size={13} />
              {check.label}
            </div>
          ))}
        </div>
      )}
      {frame.kind === "result" && (
        <div className="walkthrough-mock-result">
          <span><BadgeCheck size={24} /></span>
          <strong>{frame.resultTitle}</strong>
          <p>{frame.resultBody}</p>
          {frame.rows && (
            <div className="walkthrough-mock-result-rows">
              {frame.rows.map((row) => (
                <div key={row.label}><small>{row.label}</small><span>{row.value}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
