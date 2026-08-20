# South African language quality assurance process

This document describes the *process* by which a language/capability/provider combination may be promoted in `language_capabilities.status`. It is not a results report — see the table at the bottom, which honestly shows zero completed formal reviews at the time this was written.

## Why this exists

Machine metrics alone (an API call succeeding, a transcription returning non-empty text) are not evidence of usable quality. A language must pass human review before it is presented to a customer as anything better than `experimental`.

## What counts as a passed gate

A `language_capabilities` row may only move to `production` after:

1. At least **3 independent `formal_qa` reviews** exist in `language_quality_reviews` for that exact `(language_code, capability, provider)` combination, each with `verdict = 'pass'`.
2. Each review's `reviewer_name` and `reviewer_contact` are recorded (no anonymous formal reviews) and the reviewer self-identifies as a native or fluent speaker of the language being tested — recorded in `notes`.
3. The review covers the test corpus categories relevant to that capability (see below), not just a single greeting.
4. No open `fail` or `needs_review` verdict exists for the same combination from the last 90 days.

`beta` requires at least 1 `formal_qa` review with `verdict = 'pass'` or `'needs_review'` plus a documented remediation note. `experimental` requires no human review at all — it only means the provider's own documentation claims support and at least one `admin_benchmark` machine call returned a plausible (non-error) result.

**The promotion itself is a manual `UPDATE language_capabilities SET status = ...` run by a platform administrator after reviewing the evidence above — never automatic, and never a side effect of running a benchmark or submitting a review.** `POST /api/v1/language-reviews` only ever writes a `language_quality_reviews` row; it never touches `language_capabilities`.

## Who can submit a review

- **`formal_qa`**: a declared native/fluent speaker, name and contact recorded, testing against the corpus below. No login is required to submit — reviews are recorded by name/contact, not by an authenticated organisation user, since the goal is broad reviewer access, not gatekeeping by who has a Studio account.
- **`admin_benchmark`**: any organisation admin using Settings → Languages → Compare providers, recorded automatically with `review_type = 'admin_benchmark'`. These never count toward a `production` promotion on their own — they're a working aid for admins, not a substitute for `formal_qa`.

## What a review must cover, per capability

| Capability | Required test coverage |
|---|---|
| Speech-to-text | Native-speaker comprehension check, names, numbers, dates, money, SA place names, domain terminology, code-switching, interruptions, noisy-microphone conditions |
| Reasoning | Grammar, vocabulary, context retention across turns, code-switching handling per the persona's policy |
| Text-to-speech | Pronunciation, naturalness, correct stress/intonation, numbers/dates/money read aloud correctly |
| Realtime | All of the above, plus latency and interruption handling in a live call |
| Translation | Meaning preservation, terminology-glossary adherence, no fabricated content |

## Test corpus

`language_test_corpus` holds non-sensitive sample phrases per language across: greetings, introductions, questions, customer support, education, recruitment, directions, numbers, dates, prices, email addresses, phone numbers, South African names, town/city names, formal speech, informal speech, code-switching, interruptions, noisy conditions. Each row is marked `machine_validated` and/or `human_validated` independently — a machine-only pass is never presented as human-reviewed.

## Current status (honest, at time of writing)

Zero rows exist in `language_quality_reviews`. No language/capability/provider combination has ever passed a `formal_qa` review. The seed statuses in `language_capabilities` (English at `production`/`beta`, Afrikaans at `experimental`, the other 9 official languages at `unsupported`) reflect OpenAI's own documented language coverage, not any review conducted here.

| Language | STT | Reasoning | TTS | Realtime | Translation |
|---|---|---|---|---|---|
| English (en-ZA) | 0 reviews | 0 reviews | 0 reviews | 0 reviews | 0 reviews |
| Afrikaans (af-ZA) | 0 reviews | 0 reviews | 0 reviews | 0 reviews | 0 reviews |
| isiZulu, isiXhosa, Sepedi, Setswana, Sesotho, Xitsonga, siSwati, Tshivenda, isiNdebele | 0 reviews each | 0 reviews each | 0 reviews each | 0 reviews each | 0 reviews each |

Recruiting reviewers and running this process is Phase 2 work, not completed as part of building this architecture.
