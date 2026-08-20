"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "./StatusPill";

// Must match packages/database/migrations/010_multilingual_registry.sql's seed
// order — used only if the GET /api/v1/languages fetch fails, so a language
// picker never goes empty. Real status badges always come from the live fetch.
export const FALLBACK_LANGUAGES = [
  { code: "en-ZA", english_name: "English (South Africa)" },
  { code: "zu-ZA", english_name: "isiZulu" },
  { code: "xh-ZA", english_name: "isiXhosa" },
  { code: "af-ZA", english_name: "Afrikaans" },
  { code: "nso-ZA", english_name: "Sepedi" },
  { code: "tn-ZA", english_name: "Setswana" },
  { code: "st-ZA", english_name: "Sesotho" },
  { code: "ts-ZA", english_name: "Xitsonga" },
  { code: "ss-ZA", english_name: "siSwati" },
  { code: "ve-ZA", english_name: "Tshivenda" },
  { code: "nr-ZA", english_name: "isiNdebele" },
];

export type LanguageCapabilitySummary = { capability: string; provider: string; status: string; notes: string };
export type LanguageOption = {
  code: string;
  english_name: string;
  native_name?: string;
  enabled?: boolean;
  capabilities?: LanguageCapabilitySummary[];
};

const STATUS_TONE: Record<string, string> = {
  production: "good",
  beta: "warn",
  experimental: "muted",
  degraded: "warn",
  "temporarily-unavailable": "danger",
  unsupported: "danger",
};

export function bestStatusFor(capabilities: LanguageCapabilitySummary[] | undefined, capability: string): string {
  const rank = ["production", "beta", "experimental", "degraded", "temporarily-unavailable", "unsupported"];
  const relevant = (capabilities ?? []).filter((c) => c.capability === capability);
  if (relevant.length === 0) return "unsupported";
  return relevant.reduce((best, c) => (rank.indexOf(c.status) < rank.indexOf(best) ? c.status : best), "unsupported");
}

export function LanguageStatusBadge({ status }: { status: string }) {
  return <StatusPill tone={STATUS_TONE[status] ?? "muted"}>{status.replace(/-/g, " ")}</StatusPill>;
}

let cachedLanguages: LanguageOption[] | null = null;

async function loadLanguages(): Promise<LanguageOption[]> {
  if (cachedLanguages) return cachedLanguages;
  const res = await fetch("/api/v1/languages").then((r) => r.json()).catch(() => null);
  cachedLanguages = res?.success ? (res.data.items as LanguageOption[]) : FALLBACK_LANGUAGES;
  return cachedLanguages;
}

// Replaces every previously-inconsistent language <select>/free-text <input>
// across the app (Personas editor, Voices add-form, Settings -> Organisation,
// Knowledge doc upload, Presenter Studio create-form) with one shared,
// registry-backed control. Falls back to a fixed 11-entry list if the API call
// fails, so a picker is never empty even offline/mid-outage.
export function LanguageSelect({
  value,
  onChange,
  scope = "any",
  capability,
  showStatusBadge = false,
  includeNone,
  className,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  scope?: "any" | "enabled-only";
  capability?: string;
  showStatusBadge?: boolean;
  includeNone?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [languages, setLanguages] = useState<LanguageOption[]>(FALLBACK_LANGUAGES);
  useEffect(() => {
    let cancelled = false;
    loadLanguages().then((items) => {
      if (!cancelled) setLanguages(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = scope === "enabled-only" ? languages.filter((l) => l.enabled) : languages;

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {includeNone !== undefined && <option value="">{includeNone}</option>}
      {options.map((lang) => {
        const status = capability ? bestStatusFor(lang.capabilities, capability) : null;
        return (
          <option key={lang.code} value={lang.code}>
            {lang.english_name}
            {showStatusBadge && status ? ` — ${status.replace(/-/g, " ")}` : ""}
          </option>
        );
      })}
    </select>
  );
}
