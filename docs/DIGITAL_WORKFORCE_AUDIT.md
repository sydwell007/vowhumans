# VowHumans Digital Workforce audit

Date: 2026-08-22  
Scope: public VowHumans experience, authenticated Studio, canonical PostgreSQL, Afrihost PHP/MySQL adapter, provider boundaries, governance and verification.

## Executive finding

Before this upgrade, VowHumans presented a strong Digital Human control plane and public eight-step journey, but “digital workforce” was primarily a positioning layer. Digital Human identity, Persona behaviour and application/session configuration existed; an operational business-worker object, role configuration lifecycle, governed work queue and evidence-backed deployment flow did not.

The platform now implements Digital Workforce as a first-class operating model:

- **Digital Human** is the disclosed visible/conversational identity: face, voice, gesture and presence.
- **Persona** is the versioned behaviour: instructions, style, language, knowledge boundaries and opening message.
- **Digital Colleague** composes a Digital Human and a published Persona with role, functions, skills, knowledge, tools, workflows, objectives, KPIs, guardrails, collaboration, testing, approval, deployment and performance evidence.
- **Digital Workforce** is the organisation’s governed collection of Digital Colleagues and their work.

This separation is enforced in the database and readiness policy, not only explained in marketing copy. A colleague cannot pass readiness without a separately linked Digital Human and immutable published Persona.

## Baseline and gap assessment

| Area | Before | Implemented state |
| --- | --- | --- |
| Public journey | Eight-step “idea to governed experience” journey | Retained exactly; linked to deeper Studio controls |
| Identity | Digital Humans and consent/provenance foundations | Remains reusable and separate from work roles |
| Behaviour | Draft/published Persona versions | Published Persona is an explicit readiness requirement |
| Workforce role | Marketing descriptions and template-like examples | Persistent Digital Colleague aggregate with lifecycle state |
| Configuration | Separate Studio resource pages | Dedicated 12-step workforce builder |
| Work execution | Sessions/presenter workflows | Tenant-scoped work queue, event history, reviewable work products and escalations |
| Governance | Safety, consent and audit foundations | Risk/autonomy policy, deterministic tests, immutable approval snapshot and deployment gate |
| Analytics | General platform usage | Recorded colleague, work, review and cost evidence without fabricated totals |
| Provider truth | Existing feature-gated realtime/media providers | Workforce role generation, model execution, tools and schedules independently gated |
| Shared hosting | General metadata adapter | Additive workforce schema, seed catalogue and scoped PHP control-plane API |

## Twelve-step Studio control model

1. Role — business role, purpose, department, team, risk, autonomy, human owner, escalation owner, Digital Human and Persona.
2. Functions — bounded in-scope/out-of-scope work and review requirements.
3. Skills — proficiency and validation evidence.
4. Knowledge — active, approved knowledge assignments.
5. Tools — least-privilege permissions, denied actions, review and budget policy; never credentials.
6. Workflows — trigger, steps, expected output, exception policy and human checkpoints.
7. Objectives — accountable outcomes and evidence-based KPIs.
8. Guardrails — disclosure, privacy, role bounds and violation actions.
9. Collaboration — human ownership, escalation and controlled colleague hand-offs.
10. Testing — deterministic identity, Persona, scope, knowledge, tool, escalation and autonomy checks.
11. Approval — append-only human decision and immutable configuration snapshot.
12. Deployment — approved environment and channels with separate execution capability gates.

## Governance conclusions

- Autonomy is an operating-policy level from 0–4; level 5 is reserved and cannot be enabled by default.
- High-risk and regulated roles receive lower autonomy ceilings.
- Templates create drafts only. They never approve, deploy, add credentials or enable side effects.
- High-impact decisions, appearance/emotion scoring, undisclosed AI, destructive access and uncontrolled colleague loops are prohibited or escalated.
- Approval, work events and work-product reviews are append-only at the canonical database layer.
- Every API query includes organisation scope; PostgreSQL RLS provides an additional boundary for non-owner roles.
- Retrieved knowledge is treated as untrusted source material, not hidden instructions.
- External model, tool and schedule execution remains disabled until an approved provider policy and server-side flag are configured.

## Remaining deployment responsibilities

The implementation is production-capable as a governed control plane and deterministic work queue. Production operators still own external service configuration:

- Apply PostgreSQL migrations 017–018 to the canonical database after backup and staging validation.
- Upload/import Afrihost migrations 004–005 after 001–003 and upload the new PHP workforce endpoint.
- Issue separate least-privilege Afrihost keys for create/configure, approval, deployment and review duties.
- Configure valid Vercel/production URLs and secrets. The local Vercel-pulled `.env.production.local` contains redacted placeholder values and was deliberately not edited.
- Keep model/tool/schedule flags disabled until providers, credentials, budgets, data policy and accountable owners are approved.

## Audit verdict

The principal operating-model gap is closed. Digital Human, Persona and Digital Colleague are now distinct persisted concepts; the public journey stays understandable; Studio provides enterprise-grade depth; and deployments cannot imply infrastructure or authority that has not been configured.
