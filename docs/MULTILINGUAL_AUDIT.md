# South African multilingual audit

Audit of this repository's language handling as it stood immediately before the multilingual architecture work (migrations 010–015). Every claim below was verified against the actual code, not assumed.

## Existing language fields — all free text, none registry-backed

| Location | Nature | Enforced? |
|---|---|---|
| `persona_versions.language` | `text NOT NULL DEFAULT 'en-ZA'` | No — only ever interpolated into an LLM prompt as `Respond in {language}.` |
| `voices.language` | `text NOT NULL`, no default | No — display only |
| `transcripts.language` | `text NOT NULL DEFAULT 'en-ZA'` | N/A — no code path writes a `transcripts` row at all |
| `presenter_projects.output_language` | `text NOT NULL DEFAULT 'en-ZA'` | No — stored and displayed, never used to pick a TTS voice or caption language |
| `knowledge_documents.language` | `text`, nullable, no default | No — purely a `COUNT(DISTINCT)` stat tile input |
| `content_entries.locale` | `text NOT NULL DEFAULT 'en-ZA'` | Unrelated CMS table, out of scope |

No CHECK constraint, enum type or shared language list existed anywhere in the repository. UI writes were inconsistent free text (`"English (South Africa)"`, `"isiZulu"`, etc.) across three different hardcoded `<select>` lists (Personas editor: 4 options; Voices form: 3 options; Settings → Organisation: 2 options, uncontrolled) plus two free-text `<input>`s (Knowledge document upload; Presenter Studio create form).

## Existing STT/TTS/realtime/translation capability

| Capability | Provider before this work | Real? |
|---|---|---|
| Speech-to-text | None — zero calls to `/v1/audio/transcriptions` anywhere in the repo | Did not exist |
| Text-to-speech | OpenAI `/v1/audio/speech`, hardcoded `"gpt-4o-mini-tts"`, no language parameter | Real, English-proven (Voice Library sample playback, Presenter Studio narration) |
| Realtime speech-to-speech | 100% hardcoded to `livekit.plugins.openai.realtime.RealtimeModel` in `services/realtime-agent/livekit_agent.py`; a separate, parallel, mostly-unused provider-abstraction file (`services/realtime-agent/main.py`) existed but wasn't used by the actual LiveKit worker | Real for English only; no fallback provider wired at the real code path |
| Translation | None | Did not exist |
| Automatic language detection | None | Did not exist |

`packages/persona-schema/src/index.ts` already defined `SpeechToTextProvider`/`TextToSpeechProvider`/`RealtimeConversationProvider`/`HealthCheckedProvider` interfaces — including an optional `language` parameter on `transcribe()` — but nothing implemented or imported them. This was the correct foundation to extend rather than replace.

## Existing UI language controls

Three inconsistent hardcoded `<select>` option lists and two free-text `<input>`s (see table above) — no shared component, no capability-status display anywhere, no Studio admin surface for languages.

## Environment / credentials

`OPENAI_API_KEY`, `OPENAI_STT_MODEL` (declared, never read), `OPENAI_TTS_MODEL` (declared, never read) existed. No `AZURE_*`, `GOOGLE_*` or `TRANSLATE_*` variables existed anywhere, and no credentials for those providers exist in this environment.

## Known past-session bug directly relevant to this work

A Faces-assignment dropdown once listed the static demo-catalogue `humans` array (`data/platform.ts`) alongside real per-organisation `digital_humans` under identical display names — an assignment made against the catalogue entry silently went nowhere, since every real feature joins on the real `digital_humans.id`. Fixed in that session by removing the catalogue option from every assignment dropdown. The multilingual work's language-selector components deliberately never mix the static catalogue with real digital humans in an assignment context, to avoid reintroducing the same class of bug.

## Conclusion

Zero real multilingual infrastructure existed. The gap was not "which language is missing" — it was that no capability registry, provider abstraction, or honest status reporting existed at all. See `docs/MULTILINGUAL_IMPLEMENTATION_REPORT.md` for what has now been built and what remains honestly unsupported.
