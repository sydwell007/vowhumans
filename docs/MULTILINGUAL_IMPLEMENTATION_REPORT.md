# Multilingual implementation report

Date: 20 August 2026

## Outcome

VowHumans now has a real, extensible South African multilingual architecture: a capability registry, a provider abstraction, a language router, organisation- and digital-human-level language configuration, per-language Persona settings and terminology dictionaries, Presenter Studio translation-as-a-version with subtitle export, mid-call language switching (verified against the real installed LiveKit SDK), a full Studio admin surface with working test/benchmark tools, and an honestly-worded homepage section. This is a working foundation, not a working 11-language product yet — see the status table below before making any customer-facing claim.

## Languages implemented (architecture) vs. actually usable today

All 11 official South African languages are represented in the registry, selectable everywhere the specification required, and structurally routable. **Only English has any capability at `production`.**

| Language | STT | Reasoning | TTS | Realtime | Translation |
|---|---|---|---|---|---|
| English (en-ZA) | beta | production | production | production | beta |
| Afrikaans (af-ZA) | experimental | experimental | experimental | experimental | experimental |
| isiZulu, isiXhosa | unsupported | experimental | unsupported | experimental | unsupported |
| Sepedi, Setswana, Sesotho, Xitsonga, siSwati, Tshivenda, isiNdebele | unsupported | unsupported | unsupported | unsupported | unsupported |

- **Observed preview capability**: isiZulu and isiXhosa reasoning/realtime speech were reported working in a live Digital Human conversation on 31 August 2026. They are therefore selectable as `experimental`, not production; formal repeatable native-speaker QA remains outstanding.
- **Requiring native-speaker testing before any status can move**: all 11 languages, all 5 capabilities — see `docs/SOUTH_AFRICAN_LANGUAGE_QA.md`, currently 0 completed reviews.
- **Production-ready**: English only (reasoning, TTS, realtime). English STT and translation are real code paths but seeded `beta` since they're new this pass and untested against real audio/text in this environment.
- **Beta**: none besides the English exceptions above.
- **Experimental**: Afrikaans, all capabilities.

## Providers, by language

| Capability | Provider used | Fallback |
|---|---|---|
| STT | OpenAI Whisper (`lib/speech.ts`, new) | English (`en-ZA`) via the registry's `fallback_language_code`, or an honest "not usable" response — never a silent switch |
| Reasoning | OpenAI chat models (existing `chatComplete()`) | As above |
| TTS | OpenAI TTS (existing `synthesizeSpeech()`, now honours `OPENAI_TTS_MODEL`) | As above |
| Realtime | OpenAI Realtime (existing `livekit_agent.py`, now language-aware + mid-call switchable) | As above |
| Translation | OpenAI chat models via new `translateText()` | N/A — translation has no further fallback |
| Azure Speech / Google Speech / Azure Translator | Stub providers only, `status: 'unsupported'`, honest `not configured` in every response | N/A |

No self-hosted or open-source SA-language model is used — see `docs/MULTILINGUAL_MODEL_LICENCE_REVIEW.md`.

## Remaining API accounts required (Phase 2)

- Azure AI Speech account + `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, if Azure is chosen as a secondary STT/TTS provider for languages OpenAI doesn't cover well.
- Google Cloud Speech/Translation account + `GOOGLE_SPEECH_CREDENTIALS_JSON`, same rationale.
- Recruited native-speaker reviewers (a people/process need, not a technical account) to actually run `docs/SOUTH_AFRICAN_LANGUAGE_QA.md`.

## Estimated provider costs

Not separately estimated in this pass — no new provider account exists to price. OpenAI usage for STT/translation follows the same per-token/per-minute pricing already in effect for this organisation's existing chat/TTS/realtime usage; `usage_records.language_code` (migration 015) now lets this be measured precisely once real traffic exists, feeding a real "estimated cost per multilingual session" figure instead of a guess.

## Known quality limitations

- Whisper's transcription quality for the 9 unsupported languages is untested here and, per its own documented training coverage, likely poor — this is exactly why they're seeded `unsupported` rather than `experimental`.
- OpenAI's TTS/Realtime voices' pronunciation quality for any non-English language has not been human-verified in this pass.
- A Digital Human now persists `default_language_code`. Studio tests and embedded applications start in that language, and the realtime prompt keeps it active until an explicit UI or verbal language-change request. A verbal change persists in the model's live conversation context; a Studio UI change is additionally written to session context so reconnection preserves it.
- Cross-lingual knowledge retrieval (an isiZulu query against English source documents) is architecturally supported by the existing embedding pipeline but its real-world relevance quality has not been tested — flagged as Phase 2 work, not asserted here.
- The mid-call language hot-swap (`AgentSession.update_agent()` + `RealtimeModel.update_options(voice=...)`) was verified against the actually-installed `livekit-agents~=1.6`/`livekit-plugins-openai~=1.6` package source in a throwaway venv, and the browser-side data-channel signal (`vhm_language_switch_request`) plus server-side resolution and `session_events` logging are real — but it has not been exercised against a real live OpenAI Realtime call in this environment (no test call was placed).
- No turn-by-turn transcript persistence pipeline exists anywhere in this repository yet (confirmed in the original audit) — the new `transcripts.detected_language`/`requested_language`/`translated_language`/`translated_encrypted_text` columns are additive schema only, ready for whenever that pipeline is built.

## What must not be claimed publicly

Per the specification's own repeated instruction: do not say "Supports all 11 South African languages" anywhere customer-facing. The homepage now says "Available" (English), "Beta" (Afrikaans), "Planned" (the other 9) — update that wording only when the corresponding `language_capabilities` row and QA record actually justify it.

## Verification performed

- All 15 migrations (001–015, the last 6 new) applied cleanly in order against an isolated `pgvector/pgvector:pg17` container matching this repo's real production image.
- `packages/persona-schema`: `tsc --noEmit` clean, 7/7 tests passing (`resolveLanguageCapability` direct/fallback/override/none-record cases).
- `apps/studio-web`: `tsc --noEmit` and `eslint` clean after every incremental change across all touched files (`route.ts`, `lib/openai.ts`, `lib/speech.ts`, `lib/languageRouter.ts`, `StudioView.tsx`, `LanguageSelect.tsx`, `StatusPill.tsx`, `LiveVoiceRoom.tsx`, `DemoExperience.tsx`, `MarketingHome.tsx`, internal persona route).
- `services/realtime-agent/livekit_agent.py`: real `py_compile` and a real `import` against the actually-installed pinned package versions (not just syntax-checked) in a throwaway venv, confirming `update_agent`/`update_options`/`room.on("data_received", ...)` are genuinely callable as written.
- Full Python suite: `python -m unittest discover services -p test_*.py` (8/8 passing, unchanged) and `python -m compileall services packages/sdk-python` (clean) — `services/api-gateway/main.py`'s new `requested_language` field was not covered by a new automated test, since `fastapi`/`livekit-api` are not installed in this environment and no existing test imports that module; verified by direct code review instead.

## Remaining operator actions

1. Apply migrations 010–015 to the real production database (this environment cannot reach it directly — same Vercel Sensitive-env-var constraint as every prior database change this session).
2. Set `ENABLE_MULTILINGUAL=true` (and the other `ENABLE_*` multilingual flags as desired) in Vercel once ready to expose this to real users — everything stays inert with today's exact English-only behaviour until then.
3. Recruit native-speaker reviewers and begin running `docs/SOUTH_AFRICAN_LANGUAGE_QA.md`'s process for the 9 currently-unsupported languages, and re-test Afrikaans, before promoting any status.
4. Decide whether to pursue Azure Speech / Google Speech accounts for languages OpenAI doesn't cover well, informed by real `admin_benchmark` results once traffic exists.
5. Revisit `docs/MULTILINGUAL_MODEL_LICENCE_REVIEW.md` if a genuinely licensable open-source SA-language model appears.
