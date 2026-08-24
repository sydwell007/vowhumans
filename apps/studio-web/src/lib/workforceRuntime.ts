import sql from "./db";
import { configuredChatModel } from "./openai";

export type RuntimeUser = { id: string; organisationId: string; role: string };
type JsonRecord = Record<string, unknown>;

export class WorkforceRuntimeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public detail?: unknown,
  ) {
    super(message);
  }
}

function enabled(name: string, fallback = false) {
  const value = process.env[name];
  return value === undefined ? fallback : value.toLowerCase() === "true";
}

export function runtimeFeatureFlags() {
  return {
    test_centre: enabled("ENABLE_TEST_CENTRE", true),
    sandbox_task_runner: enabled("ENABLE_SANDBOX_TASK_RUNNER", true),
    runtime_health: enabled("ENABLE_RUNTIME_HEALTH", true),
    work_queue: enabled("ENABLE_WORK_QUEUE", true),
    work_products: enabled("ENABLE_WORK_PRODUCTS", true),
    human_reviews: enabled("ENABLE_HUMAN_REVIEWS", true),
    provider_health: enabled("ENABLE_PROVIDER_HEALTH", true),
    deployment_promotion: enabled("ENABLE_DEPLOYMENT_PROMOTION", true),
    production_runtime: enabled("ENABLE_PRODUCTION_RUNTIME"),
    model_execution: enabled("ENABLE_WORKFORCE_MODEL_EXECUTION"),
    tool_execution: enabled("ENABLE_WORKFORCE_TOOL_EXECUTION"),
  };
}

type ProviderState = {
  provider: string;
  capability: string;
  status: "healthy" | "degraded" | "disabled" | "not_configured" | "provider_error" | "budget_blocked";
  configured: boolean;
  latency_ms: number | null;
  error_code: string | null;
  detail: string;
};

function configuredProviderStates(): ProviderState[] {
  const flags = runtimeFeatureFlags();
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const livekit = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  const avatar = Boolean(process.env.AVATAR_WORKER_URL || process.env.GPU_WORKER_URL);
  const afrihost = Boolean(process.env.AFRIHOST_API_BASE_URL);
  return [
    { provider: "neon", capability: "database", status: "healthy", configured: true, latency_ms: null, error_code: null, detail: "Canonical PostgreSQL connection is serving this request." },
    { provider: "vowhumans", capability: "work_queue", status: flags.work_queue ? "healthy" : "disabled", configured: flags.work_queue, latency_ms: null, error_code: null, detail: flags.work_queue ? "Tenant-scoped work queue is enabled." : "ENABLE_WORK_QUEUE is off." },
    { provider: "vowhumans", capability: "task_executor", status: flags.sandbox_task_runner ? "healthy" : "disabled", configured: flags.sandbox_task_runner, latency_ms: null, error_code: null, detail: flags.sandbox_task_runner ? "Synchronous governed sandbox runner is enabled." : "ENABLE_SANDBOX_TASK_RUNNER is off." },
    { provider: "openai", capability: "model", status: !openai ? "not_configured" : flags.model_execution ? "degraded" : "disabled", configured: openai, latency_ms: null, error_code: null, detail: !openai ? "OPENAI_API_KEY is not configured." : flags.model_execution ? "Credentials are present; run Test connection for live verification." : "Credentials are present but ENABLE_WORKFORCE_MODEL_EXECUTION is off." },
    { provider: "openai", capability: "speech", status: !openai ? "not_configured" : enabled("ENABLE_OPENAI_TTS") || enabled("ENABLE_OPENAI_STT") ? "degraded" : "disabled", configured: openai, latency_ms: null, error_code: null, detail: openai ? "Speech capabilities require their individual STT/TTS gates and a browser media test." : "OpenAI is not configured." },
    { provider: "openai", capability: "realtime", status: !openai ? "not_configured" : enabled("ENABLE_OPENAI_REALTIME") ? "degraded" : "disabled", configured: openai && enabled("ENABLE_OPENAI_REALTIME"), latency_ms: null, error_code: null, detail: enabled("ENABLE_OPENAI_REALTIME") ? "Configured; microphone, transport and interruption still require a live session test." : "ENABLE_OPENAI_REALTIME is off." },
    { provider: "livekit", capability: "transport", status: !livekit ? "not_configured" : enabled("ENABLE_LIVEKIT") ? "degraded" : "disabled", configured: livekit, latency_ms: null, error_code: null, detail: livekit ? "Credentials are present; browser media transport must be tested separately." : "LiveKit credentials are incomplete." },
    { provider: "avatar", capability: "video", status: !avatar ? "not_configured" : "degraded", configured: avatar, latency_ms: null, error_code: null, detail: avatar ? "Worker URL is configured; run Test connection to verify GPU health." : "No avatar/GPU worker is configured. Text and voice remain available." },
    { provider: "afrihost", capability: "integration_bridge", status: !afrihost ? "not_configured" : "degraded", configured: afrihost, latency_ms: null, error_code: null, detail: afrihost ? "Bridge URL is configured; run Test connection for live verification." : "No Afrihost bridge URL is configured in this runtime." },
  ];
}

async function storeProviderState(user: RuntimeUser, state: ProviderState) {
  await sql`
    INSERT INTO provider_health (organisation_id,provider,capability,status,configured,latency_ms,error_code,safe_detail,checked_by)
    VALUES (${user.organisationId},${state.provider},${state.capability},${state.status},${state.configured},${state.latency_ms},${state.error_code},${JSON.stringify({ detail: state.detail })}::jsonb,${user.id})
  `;
}

async function httpProbe(url: string, init?: RequestInit): Promise<{ ok: boolean; latency: number; status: number; body: string }> {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000), cache: "no-store" });
    return { ok: response.ok, latency: Date.now() - started, status: response.status, body: (await response.text().catch(() => "")).slice(0, 240) };
  } catch (error) {
    return { ok: false, latency: Date.now() - started, status: 0, body: error instanceof Error ? error.message.slice(0, 240) : "Connection failed" };
  }
}

export async function testProviders(user: RuntimeUser) {
  if (!runtimeFeatureFlags().provider_health) throw new WorkforceRuntimeError("PROVIDER_DISABLED", "Provider health testing is disabled.", 503);
  const states = configuredProviderStates();
  const results: ProviderState[] = [];
  for (const base of states) {
    let state = base;
    if (base.provider === "neon") {
      const started = Date.now();
      try {
        await sql`SELECT 1 AS ready`;
        state = { ...base, status: "healthy", latency_ms: Date.now() - started, detail: "Neon/PostgreSQL query completed." };
      } catch {
        state = { ...base, status: "provider_error", latency_ms: Date.now() - started, error_code: "DATABASE_UNREACHABLE", detail: "The canonical database probe failed." };
      }
    } else if (base.provider === "openai" && base.capability === "model" && base.configured) {
      const probe = await httpProbe(`https://api.openai.com/v1/models/${encodeURIComponent(configuredChatModel())}`, { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
      const budget = /insufficient_quota|credit_balance_exhausted|billing_hard_limit/i.test(probe.body);
      state = { ...base, status: probe.ok ? "healthy" : budget ? "budget_blocked" : "provider_error", latency_ms: probe.latency, error_code: probe.ok ? null : budget ? "BUDGET_BLOCKED" : `HTTP_${probe.status || "FAILED"}`, detail: probe.ok ? `Configured model ${configuredChatModel()} is available.` : budget ? "Provider credentials are valid but execution is blocked by budget or credit." : "OpenAI model verification failed; configuration remains intact." };
    } else if (base.provider === "avatar" && base.configured) {
      const root = String(process.env.AVATAR_WORKER_URL || process.env.GPU_WORKER_URL).replace(/\/$/, "");
      const probe = await httpProbe(`${root}/health`, process.env.GPU_WORKER_TOKEN ? { headers: { authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}` } } : undefined);
      state = { ...base, status: probe.ok ? "healthy" : "provider_error", latency_ms: probe.latency, error_code: probe.ok ? null : `HTTP_${probe.status || "FAILED"}`, detail: probe.ok ? "Avatar worker health endpoint responded." : "Avatar worker is unavailable; continue with voice or text." };
    } else if (base.provider === "afrihost" && base.configured) {
      const root = String(process.env.AFRIHOST_API_BASE_URL).replace(/\/$/, "");
      const probe = await httpProbe(`${root}/api/v1/health`);
      state = { ...base, status: probe.ok ? "healthy" : "provider_error", latency_ms: probe.latency, error_code: probe.ok ? null : `HTTP_${probe.status || "FAILED"}`, detail: probe.ok ? "Afrihost integration bridge responded." : "Afrihost bridge did not pass its public health check." };
    }
    await storeProviderState(user, state);
    results.push(state);
  }
  return { providers: results, checked_at: new Date().toISOString() };
}

export async function providerHealth(organisationId: string) {
  const latest = await sql`
    SELECT DISTINCT ON (provider,capability) provider,capability,status,configured,latency_ms,error_code,safe_detail,checked_at
    FROM provider_health WHERE organisation_id=${organisationId}
    ORDER BY provider,capability,checked_at DESC
  `;
  const keyed = new Map(latest.map((row) => [`${row.provider}:${row.capability}`, row]));
  return configuredProviderStates().map((base) => keyed.get(`${base.provider}:${base.capability}`) ?? { ...base, safe_detail: { detail: base.detail }, checked_at: null });
}

function percent(values: boolean[]) {
  return values.length ? Math.round((values.filter(Boolean).length / values.length) * 100) : 0;
}

export async function colleagueRuntimeReadiness(organisationId: string, colleagueId: string) {
  const [row] = await sql`
    SELECT dc.id,dc.public_id,dc.name,dc.role_title,dc.purpose,dc.status,dc.deployment_status,dc.configuration,
      dc.human_owner_user_id,dc.escalation_owner_user_id,dc.digital_human_id,dc.persona_version_id,
      pv.state AS persona_state,dh.disclosure,
      (SELECT count(*)::int FROM colleague_functions x WHERE x.digital_colleague_id=dc.id AND x.status='active') AS functions,
      (SELECT count(*)::int FROM colleague_skills x WHERE x.digital_colleague_id=dc.id AND x.status='active') AS skills,
      (SELECT count(*)::int FROM colleague_knowledge_sources x JOIN knowledge_bases kb ON kb.id=x.knowledge_base_id WHERE x.digital_colleague_id=dc.id AND x.status='active' AND kb.state='active') AS knowledge,
      (SELECT count(*)::int FROM colleague_tool_permissions x JOIN workforce_tools wt ON wt.id=x.workforce_tool_id WHERE x.digital_colleague_id=dc.id AND x.status='approved' AND wt.status='approved') AS tools,
      (SELECT count(*)::int FROM colleague_workflows x WHERE x.digital_colleague_id=dc.id AND x.status IN ('active','draft')) AS workflows,
      (SELECT count(*)::int FROM colleague_objectives x WHERE x.digital_colleague_id=dc.id AND x.status='active') AS objectives,
      (SELECT count(*)::int FROM colleague_guardrails x WHERE x.digital_colleague_id=dc.id AND x.status='active') AS guardrails,
      (SELECT count(*)::int FROM colleague_collaboration_routes x WHERE x.digital_colleague_id=dc.id AND x.status='active' AND x.route_type='human_escalation' AND x.target_user_id IS NOT NULL) AS escalation_routes,
      (SELECT count(*)::int FROM colleague_tests x WHERE x.digital_colleague_id=dc.id AND x.status='passed' AND (x.result->>'configuration_revision')::int=COALESCE((dc.configuration->>'revision')::int,1)) AS passing_tests,
      (SELECT count(*)::int FROM colleague_approvals x WHERE x.digital_colleague_id=dc.id AND x.decision='approved' AND (x.snapshot->>'configuration_revision')::int=COALESCE((dc.configuration->>'revision')::int,1)) AS approvals,
      (SELECT hfa.face_asset_id IS NOT NULL FROM human_face_assignments hfa WHERE hfa.organisation_id=dc.organisation_id AND hfa.human_slug=dc.digital_human_id::text LIMIT 1) AS face_ready,
      (SELECT hva.voice_id IS NOT NULL FROM human_voice_assignments hva WHERE hva.organisation_id=dc.organisation_id AND hva.human_slug=dc.digital_human_id::text LIMIT 1) AS voice_ready,
      dep.id AS deployment_id,dep.environment,dep.channels,dep.version AS deployment_version,dep.status AS latest_deployment_status
    FROM digital_colleagues dc
    LEFT JOIN digital_humans dh ON dh.id=dc.digital_human_id
    LEFT JOIN persona_versions pv ON pv.id=dc.persona_version_id
    LEFT JOIN LATERAL (SELECT * FROM colleague_deployments x WHERE x.organisation_id=dc.organisation_id AND x.digital_colleague_id=dc.id ORDER BY x.created_at DESC LIMIT 1) dep ON true
    WHERE dc.organisation_id=${organisationId} AND (dc.id::text=${colleagueId} OR dc.public_id=${colleagueId})
  `;
  if (!row) throw new WorkforceRuntimeError("NOT_FOUND", "Digital Colleague not found.", 404);
  const providers = await providerHealth(organisationId);
  const provider = (name: string, capability: string) => providers.find((item) => item.provider === name && item.capability === capability);
  const isHealthy = (name: string, capability: string) => provider(name, capability)?.status === "healthy";
  const flags = runtimeFeatureFlags();
  const configurationChecks = [Boolean(row.role_title), Boolean(row.digital_human_id), row.persona_state === "published", Number(row.functions) > 0, Number(row.skills) > 0, Number(row.knowledge) > 0, Number(row.workflows) > 0, Number(row.objectives) > 0, Number(row.guardrails) >= 3];
  const governanceChecks = [Boolean(row.human_owner_user_id), Boolean(row.escalation_owner_user_id), Number(row.escalation_routes) > 0, Number(row.passing_tests) >= 8, Number(row.approvals) > 0, Boolean(row.disclosure)];
  const runtimeChecks = [flags.work_queue, flags.sandbox_task_runner, Boolean(process.env.OPENAI_API_KEY), flags.model_execution, isHealthy("neon", "database") || providers.every((item) => item.provider !== "neon" || item.checked_at === null)];
  const conversationChecks = [Boolean(process.env.OPENAI_API_KEY), Boolean(row.voice_ready), enabled("ENABLE_OPENAI_REALTIME"), Boolean(row.face_ready), isHealthy("avatar", "video")];
  const channels = Array.isArray(row.channels) ? row.channels.map(String) : [];
  const channelChecks = [Boolean(row.deployment_id), channels.includes("work_queue"), channels.length > 0];
  const scores = {
    configuration: percent(configurationChecks),
    governance: percent(governanceChecks),
    runtime: percent(runtimeChecks),
    conversation: percent(conversationChecks),
    channels: percent(channelChecks),
  };
  const operational = Math.round(scores.configuration * 0.25 + scores.governance * 0.25 + scores.runtime * 0.3 + scores.conversation * 0.1 + scores.channels * 0.1);
  const blockers: string[] = [];
  if (!row.deployment_id) blockers.push("Deploy this Digital Colleague to Sandbox.");
  if (!flags.sandbox_task_runner) blockers.push("Enable the sandbox task runner.");
  if (!process.env.OPENAI_API_KEY) blockers.push("Configure OpenAI to execute model-backed work.");
  else if (!flags.model_execution) blockers.push("Enable workforce model execution after provider approval.");
  if (Number(row.approvals) === 0) blockers.push("Record an approval for the current configuration revision.");
  const configurationRevision = Number((row.configuration as JsonRecord | null)?.revision ?? 1);
  const deploymentVersion = row.deployment_version ? Number(row.deployment_version) : null;
  const [lastTest] = await sql`SELECT configuration_revision,deployment_version,status,completed_at FROM runtime_test_runs WHERE organisation_id=${organisationId} AND digital_colleague_id=${row.id} ORDER BY created_at DESC LIMIT 1`;
  const retestRequired = !lastTest || Number(lastTest.configuration_revision ?? 0) !== configurationRevision || Number(lastTest.deployment_version ?? 0) !== Number(deploymentVersion ?? 0);
  if (row.deployment_id && deploymentVersion !== null) {
    await sql`
      INSERT INTO deployment_readiness (organisation_id,deployment_id,configuration_revision,deployment_version,configuration_score,governance_score,runtime_score,conversation_score,channel_score,operational_score,categories,blockers)
      VALUES (${organisationId},${row.deployment_id},${configurationRevision},${deploymentVersion},${scores.configuration},${scores.governance},${scores.runtime},${scores.conversation},${scores.channels},${operational},${JSON.stringify(scores)}::jsonb,${JSON.stringify(blockers)}::jsonb)
      ON CONFLICT (deployment_id,configuration_revision,deployment_version) DO UPDATE SET configuration_score=EXCLUDED.configuration_score,governance_score=EXCLUDED.governance_score,runtime_score=EXCLUDED.runtime_score,conversation_score=EXCLUDED.conversation_score,channel_score=EXCLUDED.channel_score,operational_score=EXCLUDED.operational_score,categories=EXCLUDED.categories,blockers=EXCLUDED.blockers,assessed_at=now()
    `;
  }
  return {
    colleague: { id: row.id, public_id: row.public_id, name: row.name, role_title: row.role_title, purpose: row.purpose, status: row.status, deployment_status: row.deployment_status },
    deployment: row.deployment_id ? { id: row.deployment_id, environment: row.environment, channels, version: row.deployment_version, status: row.latest_deployment_status } : null,
    scores: { ...scores, operational },
    readiness: {
      configuration: { score: scores.configuration, label: "Configuration readiness" },
      governance: { score: scores.governance, label: "Governance readiness" },
      runtime: { score: scores.runtime, label: "Runtime readiness" },
      conversation: { score: scores.conversation, label: "Conversation readiness" },
      channels: { score: scores.channels, label: "Channel readiness" },
    },
    health: providers,
    blockers,
    capabilities: flags,
    tested_version: lastTest ? { configuration_revision: lastTest.configuration_revision, deployment_version: lastTest.deployment_version, status: lastTest.status, completed_at: lastTest.completed_at } : null,
    retest_required: retestRequired,
  };
}

export async function testCentre(organisationId: string) {
  const [humans, colleagues, runs] = await Promise.all([
    sql`SELECT id,name,role,state FROM digital_humans WHERE organisation_id=${organisationId} AND state <> 'archived' ORDER BY name`,
    sql`SELECT id,public_id,name,role_title,status,deployment_status FROM digital_colleagues WHERE organisation_id=${organisationId} AND status <> 'archived' ORDER BY name`,
    sql`SELECT tr.*,dc.name AS colleague_name,dh.name AS human_name,COALESCE((SELECT json_agg(r ORDER BY r.created_at) FROM runtime_test_results r WHERE r.test_run_id=tr.id),'[]') AS results FROM runtime_test_runs tr LEFT JOIN digital_colleagues dc ON dc.id=tr.digital_colleague_id LEFT JOIN digital_humans dh ON dh.id=tr.digital_human_id WHERE tr.organisation_id=${organisationId} ORDER BY tr.created_at DESC LIMIT 50`,
  ]);
  return { humans, colleagues, runs, capabilities: runtimeFeatureFlags() };
}

type TestResult = { code: string; label: string; passed: boolean; blocked?: boolean; warning?: boolean; detail: string; evidence?: JsonRecord };

export async function runRuntimeTest(user: RuntimeUser, input: JsonRecord) {
  if (!runtimeFeatureFlags().test_centre) throw new WorkforceRuntimeError("PROVIDER_DISABLED", "The Test Centre is disabled.", 503);
  const entityType = input.entity_type === "digital_human" ? "digital_human" : "digital_colleague";
  const entityId = typeof input.entity_id === "string" ? input.entity_id.slice(0, 80) : "";
  const requestedSuite = typeof input.test_suite === "string" ? input.test_suite.slice(0, 40) : entityType === "digital_human" ? "presence" : "role";
  const validSuites = new Set(["presence","role","work","knowledge","voice","realtime","avatar","guardrail","escalation","tool","workflow","provider"]);
  const suite = validSuites.has(requestedSuite) ? requestedSuite : entityType === "digital_human" ? "presence" : "role";
  if (!entityId) throw new WorkforceRuntimeError("VALIDATION_ERROR", "Choose a Digital Human or Digital Colleague to test.", 422);
  let humanId: string | null = null;
  let colleagueId: string | null = null;
  let revision: number | null = null;
  let deploymentId: string | null = null;
  let deploymentVersion: number | null = null;
  let results: TestResult[] = [];
  if (entityType === "digital_human") {
    const [human] = await sql`
      SELECT dh.id,dh.name,dh.role,dh.disclosure,dh.state,
        EXISTS(SELECT 1 FROM human_face_assignments x WHERE x.organisation_id=dh.organisation_id AND x.human_slug=dh.id::text) AS face,
        EXISTS(SELECT 1 FROM human_voice_assignments x WHERE x.organisation_id=dh.organisation_id AND x.human_slug=dh.id::text) AS voice,
        EXISTS(SELECT 1 FROM human_gesture_assignments x WHERE x.organisation_id=dh.organisation_id AND x.human_slug=dh.id::text) AS gesture,
        EXISTS(SELECT 1 FROM human_persona_assignments x JOIN persona_versions pv ON pv.id=x.persona_version_id WHERE x.organisation_id=dh.organisation_id AND x.human_slug=dh.id::text AND pv.state='published') AS persona,
        (SELECT count(*)::int FROM human_knowledge_assignments x WHERE x.organisation_id=dh.organisation_id AND x.human_slug=dh.id::text) AS knowledge,
        (SELECT count(*)::int FROM digital_human_applications x WHERE x.organisation_id=dh.organisation_id AND x.digital_human_id=dh.id AND x.enabled=true) AS applications
      FROM digital_humans dh WHERE dh.organisation_id=${user.organisationId} AND dh.id::text=${entityId}
    `;
    if (!human) throw new WorkforceRuntimeError("NOT_FOUND", "Digital Human not found.", 404);
    humanId = String(human.id);
    results = [
      { code: "identity", label: "Identity and disclosure", passed: Boolean(human.name && human.role && human.disclosure), detail: "Named role and visible AI disclosure are present." },
      { code: "persona", label: "Published Persona", passed: Boolean(human.persona), detail: "A published behaviour version is assigned." },
      { code: "knowledge", label: "Approved knowledge", passed: Number(human.knowledge) > 0, detail: Number(human.knowledge) > 0 ? `${human.knowledge} knowledge source(s) assigned.` : "Assign approved knowledge before grounded testing." },
      { code: "voice", label: "Voice assignment", passed: Boolean(human.voice), warning: !enabled("ENABLE_OPENAI_TTS"), detail: human.voice ? "Voice is assigned; provider audio remains capability-gated." : "No voice is assigned." },
      { code: "avatar", label: "Face and avatar fallback", passed: Boolean(human.face), warning: !Boolean(process.env.AVATAR_WORKER_URL || process.env.GPU_WORKER_URL), detail: human.face ? "Static presence is ready; GPU video may fall back to voice/text." : "No face is assigned." },
      { code: "gesture", label: "Gesture profile", passed: Boolean(human.gesture), detail: "Gesture configuration is checked independently from GPU runtime." },
      { code: "channel", label: "Application channel", passed: Number(human.applications) > 0, detail: `${human.applications} enabled application channel(s).` },
    ];
  } else {
    const runtime = await colleagueRuntimeReadiness(user.organisationId, entityId);
    colleagueId = String(runtime.colleague.id);
    revision = Number((await sql`SELECT COALESCE((configuration->>'revision')::int,1) AS revision FROM digital_colleagues WHERE id=${colleagueId}`)[0]?.revision ?? 1);
    deploymentId = runtime.deployment?.id ? String(runtime.deployment.id) : null;
    deploymentVersion = runtime.deployment?.version ? Number(runtime.deployment.version) : null;
    if (suite === "work") {
      results = [
        { code: "deployment", label: "Sandbox deployment", passed: Boolean(runtime.deployment), detail: runtime.deployment ? `${runtime.deployment.environment} version ${runtime.deployment.version} is ${runtime.deployment.status}.` : "Deploy to Sandbox first." },
        { code: "queue", label: "Work queue", passed: runtime.capabilities.work_queue, detail: "Tenant-scoped queue accepts traceable work items." },
        { code: "executor", label: "Task executor", passed: runtime.capabilities.sandbox_task_runner, detail: "The governed sandbox runner is independently gated." },
        { code: "model", label: "Model runtime", passed: runtime.capabilities.model_execution && Boolean(process.env.OPENAI_API_KEY), blocked: !runtime.capabilities.model_execution || !process.env.OPENAI_API_KEY, detail: runtime.capabilities.model_execution && process.env.OPENAI_API_KEY ? `Configured policy can route to ${configuredChatModel()}.` : "Model work is blocked; deterministic review briefs remain available." },
        { code: "review", label: "Human review", passed: runtime.capabilities.human_reviews, detail: "Work products remain reviewable before release." },
      ];
    } else {
      results = Object.entries(runtime.readiness).map(([code, item]) => ({ code, label: item.label, passed: item.score === 100, warning: item.score > 0 && item.score < 100, detail: `${item.score}%` }));
    }
    if (suite === "escalation") {
      const [task] = await sql`INSERT INTO work_items (organisation_id,digital_colleague_id,deployment_id,environment,task_type,title,request,priority,risk_level,status,assigned_by,progress) VALUES (${user.organisationId},${colleagueId},${deploymentId},'sandbox','escalation_test','Sandbox escalation test','Verify that a controlled exception reaches the configured human supervisor.','low','medium','escalated',${user.id},100) RETURNING id,public_id`;
      const [owner] = await sql`SELECT COALESCE(escalation_owner_user_id,human_owner_user_id) AS id FROM digital_colleagues WHERE organisation_id=${user.organisationId} AND id=${colleagueId}`;
      const [escalation] = await sql`INSERT INTO colleague_escalations (organisation_id,digital_colleague_id,work_item_id,reason_code,summary,assigned_to_user_id) VALUES (${user.organisationId},${colleagueId},${task.id},'sandbox_test','Synthetic sandbox escalation; no customer data or external action was used.',${owner?.id ?? null}) RETURNING id`;
      await sql`INSERT INTO work_item_events (organisation_id,work_item_id,event_type,actor_type,actor_id,safe_detail) VALUES (${user.organisationId},${task.id},'escalation.test_created','system',${user.id},${JSON.stringify({ escalation_id: escalation.id, synthetic: true })}::jsonb)`;
      if (owner?.id) await sql`INSERT INTO notifications (organisation_id,user_id,channel,template_code,status,payload) VALUES (${user.organisationId},${owner.id},'in_app','workforce_escalation_test','queued',${JSON.stringify({ work_item_id: task.id, escalation_id: escalation.id, synthetic: true })}::jsonb)`;
      results = [{ code: "trigger", label: "Trigger recognised", passed: true, detail: "Synthetic sandbox exception created." },{ code: "supervisor", label: "Supervisor identified", passed: Boolean(owner?.id), detail: owner?.id ? "Named escalation owner found." : "No supervisor is configured." },{ code: "record", label: "Escalation linked", passed: true, detail: `Escalation linked to ${task.public_id}.` },{ code: "notification", label: "Notification queued", passed: Boolean(owner?.id), detail: owner?.id ? "In-app notification record queued." : "Notification blocked because no supervisor is assigned." }];
    }
  }
  const [run] = await sql`INSERT INTO runtime_test_runs (organisation_id,digital_human_id,digital_colleague_id,deployment_id,test_suite,environment,status,configuration_revision,deployment_version,requested_by,summary,metadata) VALUES (${user.organisationId},${humanId},${colleagueId},${deploymentId},${suite},'sandbox','running',${revision},${deploymentVersion},${user.id},'Test started',${JSON.stringify({ source: "studio-test-centre" })}::jsonb) RETURNING *`;
  for (const result of results) {
    const status = result.blocked ? "blocked" : result.warning ? "warning" : result.passed ? "passed" : "failed";
    await sql`INSERT INTO runtime_test_results (organisation_id,test_run_id,code,label,status,detail,evidence) VALUES (${user.organisationId},${run.id},${result.code},${result.label},${status},${result.detail},${JSON.stringify(result.evidence ?? {})}::jsonb)`;
  }
  const finalStatus = results.some((item) => !item.passed && !item.blocked && !item.warning) ? "failed" : results.some((item) => item.blocked) ? "blocked" : results.some((item) => item.warning) ? "warning" : "passed";
  const summary = finalStatus === "passed" ? "All selected checks passed." : finalStatus === "warning" ? "Passed with capability warnings." : finalStatus === "blocked" ? "Configuration is intact, but a runtime dependency is blocked." : "One or more requirements failed.";
  await sql`UPDATE runtime_test_runs SET status=${finalStatus},summary=${summary},completed_at=now() WHERE id=${run.id}`;
  await sql`INSERT INTO runtime_events (organisation_id,digital_colleague_id,deployment_id,test_run_id,event_type,actor_type,actor_id,status,safe_detail) VALUES (${user.organisationId},${colleagueId},${deploymentId},${run.id},'test.completed','user',${user.id},${finalStatus === "failed" ? "failed" : finalStatus === "blocked" ? "blocked" : "completed"},${JSON.stringify({ suite, result_count: results.length })}::jsonb)`;
  const [complete] = await sql`SELECT tr.*,COALESCE((SELECT json_agg(r ORDER BY r.created_at) FROM runtime_test_results r WHERE r.test_run_id=tr.id),'[]') AS results FROM runtime_test_runs tr WHERE tr.id=${run.id}`;
  return complete;
}

export async function changeColleagueRuntimeState(user: RuntimeUser, colleagueId: string, action: "pause" | "resume") {
  const [colleague] = await sql`SELECT id,status,deployment_status FROM digital_colleagues WHERE organisation_id=${user.organisationId} AND (id::text=${colleagueId} OR public_id=${colleagueId})`;
  if (!colleague) throw new WorkforceRuntimeError("NOT_FOUND", "Digital Colleague not found.", 404);
  if (action === "pause" && colleague.status !== "deployed") throw new WorkforceRuntimeError("INVALID_STATE", "Only a deployed Digital Colleague can be paused.", 409);
  if (action === "resume" && colleague.status !== "paused") throw new WorkforceRuntimeError("INVALID_STATE", "Only a paused Digital Colleague can be resumed.", 409);
  if (action === "pause") {
    await sql.begin(async (tx) => {
      await tx`UPDATE digital_colleagues SET status='paused',deployment_status='paused' WHERE organisation_id=${user.organisationId} AND id=${colleague.id}`;
      await tx`UPDATE colleague_deployments SET status='paused',paused_at=now() WHERE organisation_id=${user.organisationId} AND digital_colleague_id=${colleague.id} AND status='deployed'`;
      await tx`INSERT INTO runtime_events (organisation_id,digital_colleague_id,event_type,actor_type,actor_id,status,safe_detail) VALUES (${user.organisationId},${colleague.id},'deployment.paused','user',${user.id},'completed','{"new_work_blocked":true}'::jsonb)`;
    });
  } else {
    await sql.begin(async (tx) => {
      await tx`UPDATE digital_colleagues SET status='deployed',deployment_status='deployed' WHERE organisation_id=${user.organisationId} AND id=${colleague.id}`;
      await tx`UPDATE colleague_deployments SET status='deployed',paused_at=NULL WHERE organisation_id=${user.organisationId} AND digital_colleague_id=${colleague.id} AND status='paused'`;
      await tx`INSERT INTO runtime_events (organisation_id,digital_colleague_id,event_type,actor_type,actor_id,status,safe_detail) VALUES (${user.organisationId},${colleague.id},'deployment.resumed','user',${user.id},'completed','{"new_work_blocked":false}'::jsonb)`;
    });
  }
  return colleagueRuntimeReadiness(user.organisationId, String(colleague.id));
}

export async function cancelWorkItem(user: RuntimeUser, taskId: string) {
  const [task] = await sql`SELECT id,status FROM work_items WHERE organisation_id=${user.organisationId} AND (id::text=${taskId} OR public_id=${taskId})`;
  if (!task) throw new WorkforceRuntimeError("NOT_FOUND", "Work item not found.", 404);
  if (["completed","failed","cancelled"].includes(String(task.status))) throw new WorkforceRuntimeError("INVALID_STATE", "Only open work can be cancelled.", 409);
  await sql.begin(async (tx) => {
    await tx`UPDATE work_items SET status='cancelled',failure_reason='Cancelled by an authorised Studio user',progress=100 WHERE organisation_id=${user.organisationId} AND id=${task.id}`;
    await tx`INSERT INTO work_item_events (organisation_id,work_item_id,event_type,actor_type,actor_id,safe_detail) VALUES (${user.organisationId},${task.id},'work_item.cancelled','user',${user.id},'{}'::jsonb)`;
  });
  return { id: task.id, status: "cancelled" };
}

export async function promoteDeployment(user: RuntimeUser, deploymentId: string, input: JsonRecord) {
  const flags = runtimeFeatureFlags();
  if (!flags.deployment_promotion) throw new WorkforceRuntimeError("PROVIDER_DISABLED", "Deployment promotion is disabled.", 503);
  const target = typeof input.target_environment === "string" ? input.target_environment : "staging";
  if (!["test","pilot","staging","production"].includes(target)) throw new WorkforceRuntimeError("VALIDATION_ERROR", "Choose Test, Pilot, Staging or Production.", 422);
  if (target === "production" && !flags.production_runtime) throw new WorkforceRuntimeError("PRODUCTION_RUNTIME_DISABLED", "Production runtime is conservatively disabled. The promotion request was not executed.", 409);
  const [source] = await sql`SELECT * FROM colleague_deployments WHERE organisation_id=${user.organisationId} AND id::text=${deploymentId}`;
  if (!source) throw new WorkforceRuntimeError("NOT_FOUND", "Deployment not found.", 404);
  if (source.status !== "deployed") throw new WorkforceRuntimeError("INVALID_STATE", "Only an active deployment can be promoted.", 409);
  const environmentOrder = ["sandbox", "test", "pilot", "staging", "production"];
  if (environmentOrder.indexOf(target) <= environmentOrder.indexOf(String(source.environment))) throw new WorkforceRuntimeError("VALIDATION_ERROR", "Choose an environment above the current deployment.", 422);
  const readiness = await colleagueRuntimeReadiness(user.organisationId, String(source.digital_colleague_id));
  if (readiness.scores.configuration < 100 || readiness.scores.governance < 100 || readiness.scores.runtime < 60) throw new WorkforceRuntimeError("READINESS_BLOCKED", "Promotion requires complete configuration/governance and at least 60% runtime readiness.", 409, readiness.blockers);
  const [promotion] = await sql`INSERT INTO deployment_promotions (organisation_id,digital_colleague_id,source_deployment_id,target_environment,status,readiness_snapshot,rationale,requested_by) VALUES (${user.organisationId},${source.digital_colleague_id},${source.id},${target},'requested',${JSON.stringify(readiness.scores)}::jsonb,${typeof input.rationale === "string" ? input.rationale.slice(0,2000) : "Requested after sandbox verification."},${user.id}) RETURNING *`;
  return promotion;
}
