# Multilingual model licence review

Complements `THIRD_PARTY_LICENCE_REVIEW.md`. Reviewed before any speech/translation model or provider is enabled for the multilingual architecture.

| Provider / model | Current use | Commercial status |
|---|---|---|
| OpenAI Whisper (`whisper-1` / configured `OPENAI_STT_MODEL`) | Real — `lib/speech.ts` `transcribeSpeech()` | Commercial terms already accepted via this organisation's existing OpenAI account and usage (chat, embeddings, TTS were already live). No new agreement needed. |
| OpenAI TTS (`gpt-4o-mini-tts` / configured `OPENAI_TTS_MODEL`) | Real — `lib/openai.ts` `synthesizeSpeech()` | As above — already commercially licensed via existing use. |
| OpenAI Realtime (`gpt-realtime`) | Real — `services/realtime-agent/livekit_agent.py` | As above — already commercially licensed via existing use. |
| OpenAI chat models (via `translateText()`) | Real — `lib/openai.ts` `translateText()`, a thin wrapper on the existing `chatComplete()` | As above — no new model, no new agreement. |
| Azure AI Speech (STT/TTS) | Stub only — `language_capabilities` rows seeded `status: 'unsupported'`, `provider: 'azure-speech'`, honest `notes` explaining no credentials exist | **Not reviewed.** No account, no terms accepted, no credentials configured. Do not enable (`ENABLE_AZURE_SPEECH`) until this row is updated with real review findings. |
| Google Cloud Speech / Translation | Stub only — same pattern, `provider: 'google-speech'` / `'azure-translator'` naming as seeded | **Not reviewed.** No account, no terms accepted, no credentials configured. Do not enable (`ENABLE_GOOGLE_SPEECH`) until reviewed. |
| Non-commercial open-source SA-language STT/TTS/translation models | None evaluated | **No non-commercial open-source South African-language model is approved, evaluated, or embedded in this codebase as of this review.** If one is proposed in future, it must independently pass: model licence review, model-weight licence review, training-data restriction review (where documented), explicit confirmation commercial use is permitted, and documented attribution/redistribution requirements — before any production code references it. This gate exists specifically because several well-known SA-language models (research releases, academic datasets) carry non-commercial or share-alike restrictions that would conflict with VowHumans' commercial use. |
| Future Lexikon integration (terminology/translation validation) | Not built | No terms exist yet — this is a future internal-product integration, not a third-party licence question, but any data-sharing agreement between VowHumans and Lexikon should be documented here once it exists. |

## Rule enforced by this review

`ENABLE_AZURE_SPEECH` and `ENABLE_GOOGLE_SPEECH` default to `false` in `.env.example`. Turning either on in a real deployment is a commercial and legal decision, not a code change — it should only happen after this document's corresponding row is updated with real account/terms information, matching the same discipline `COMMERCIAL-LICENCE-REVIEW.md` already applies to LiveKit, MuseTalk and licensed voices elsewhere in this repository.
