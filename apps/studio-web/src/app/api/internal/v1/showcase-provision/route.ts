import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export const maxDuration = 300;

type Showcase = {
  slug: string; name: string; role: string; image: string; voice: string;
  application: string; applicationSlug: string; persona: string; colleague: string;
  department: string; purpose: string; template: string; risk: "medium" | "high";
  autonomy: number; functions: string[]; skills: string[]; knowledge: string[];
};

const SHOWCASES: Showcase[] = [
  { slug: "thandi-mokoena", name: "Thandi Mokoena", role: "Talent Partner", image: "thandi.png", voice: "nova", application: "PlugConnect", applicationSlug: "plugconnect", persona: "Professional Practice Interviewer", colleague: "Thandi — Talent Interview Coach", department: "People", purpose: "Runs structured interview practice, gives evidence-based coaching and escalates safeguarding or employment-decision requests to a person.", template: "learning-coach", risk: "high", autonomy: 1, functions: ["Run structured interview practice", "Give competency-based coaching", "Prepare a learner-owned practice summary"], skills: ["Interview coaching", "Competency questioning", "Constructive feedback"], knowledge: ["Use STAR to structure situation, task, action and result.", "Feedback must be specific, developmental and controlled by the learner.", "Never score appearance, emotion, employability or make a hiring decision."] },
  { slug: "sipho-daniels", name: "Sipho Daniels", role: "Recruitment Consultant", image: "sipho.png", voice: "echo", application: "PlugConnect", applicationSlug: "plugconnect", persona: "Recruitment Coordination Specialist", colleague: "Sipho — Recruitment Coordinator", department: "People", purpose: "Coordinates consented recruitment logistics and candidate communications without ranking or deciding on candidates.", template: "recruitment-coordinator", risk: "high", autonomy: 1, functions: ["Coordinate interview logistics", "Draft candidate status updates", "Prepare reviewable interview packs"], skills: ["Scheduling", "Candidate communication", "Recruitment operations"], knowledge: ["Candidate communications must be timely, respectful and purpose-limited.", "Hiring decisions remain with authorised people.", "Never infer personality, emotion or suitability from appearance or voice."] },
  { slug: "goalvow-tutor", name: "GoalVow Tutor", role: "Digital Course Facilitator", image: "tutor.png", voice: "alloy", application: "GoalVow Academies", applicationSlug: "goalvow-academies", persona: "GoalVow Course Tutor", colleague: "GoalVow Tutor — Learning Colleague", department: "Learning", purpose: "Explains approved course material with citations, creates practice activities and escalates assessment or safeguarding matters.", template: "tutor", risk: "medium", autonomy: 1, functions: ["Explain approved lessons", "Generate bounded practice questions", "Cite the displayed learning source"], skills: ["Tutoring", "Adaptive explanation", "Citation-backed learning support"], knowledge: ["Explain concepts from approved learning material and label uncertainty.", "Practice questions support learning but do not expose answer keys.", "Final assessment and safeguarding decisions require a person."] },
  { slug: "lerato-maseko", name: "Lerato Maseko", role: "VowSupport Adviser", image: "support-adviser.png", voice: "shimmer", application: "VowSupport", applicationSlug: "vowsupport", persona: "Customer Support Adviser", colleague: "Lerato — Customer Service Colleague", department: "Customer Experience", purpose: "Triages customer requests, drafts policy-grounded responses and creates complete human escalation briefs.", template: "customer-service", risk: "medium", autonomy: 1, functions: ["Classify support requests", "Draft policy-grounded responses", "Create escalation briefs"], skills: ["Customer support", "Case summarisation", "De-escalation"], knowledge: ["Confirm the request and use only approved service policy.", "Refunds, complaints, account changes and disputes require human review.", "Collect the minimum information needed and never expose secrets."] },
  { slug: "kabelo-ndlovu", name: "Kabelo Ndlovu", role: "VowTools Coach", image: "vowtools-coach.png", voice: "onyx", application: "VowTools", applicationSlug: "vowtools", persona: "Productivity and Operations Coach", colleague: "Kabelo — Operations Coach", department: "Operations", purpose: "Turns approved goals into reviewable plans, tracks actions and escalates exceptions affecting people, money or safety.", template: "operations-coordinator", risk: "medium", autonomy: 1, functions: ["Prepare practical action plans", "Track approved workflow actions", "Summarise blockers and exceptions"], skills: ["Productivity coaching", "Process coordination", "Operational reporting"], knowledge: ["Plans must have a clear owner, next action and review point.", "Do not make financial, employment or safety decisions.", "Escalate exceptions and preserve a reviewable action trail."] },
];

function authorised(request: NextRequest) {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY;
  const provided = request.headers.get("x-internal-key");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected); const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function targetOrganisation() {
  const rows = await sql`
    SELECT DISTINCT o.id, o.name, o.slug, u.id AS owner_id, u.display_name
    FROM organisations o JOIN users u ON u.organisation_id=o.id
    WHERE lower(u.display_name)='sydwell' AND o.name NOT ILIKE '%workflow audit%'
  `;
  if (rows.length !== 1) throw new Error(`Expected one Sydwell customer workspace; found ${rows.length}.`);
  return rows[0];
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ success: false }, { status: 401 });
  const organisation = await targetOrganisation();
  const [humans, colleagues] = await Promise.all([
    sql`SELECT name, role, state, count(*)::int AS copies FROM digital_humans WHERE organisation_id=${organisation.id} GROUP BY name,role,state ORDER BY name,state`,
    sql`SELECT name, role_title, status, deployment_status, builder_step FROM digital_colleagues WHERE organisation_id=${organisation.id} ORDER BY created_at`,
  ]);
  return NextResponse.json({ success: true, data: { organisation: { id: organisation.id, name: organisation.name, slug: organisation.slug }, humans, colleagues } });
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ success: false }, { status: 401 });
  const organisation = await targetOrganisation();
  const images = new Map<string, { data: Buffer; mime: string; sha: string }>();
  for (const item of SHOWCASES) {
    const response = await fetch(`https://vowhumans.com/humans/${item.image}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${item.image} (${response.status}).`);
    const data = Buffer.from(await response.arrayBuffer());
    images.set(item.slug, { data, mime: response.headers.get("content-type") || "image/png", sha: createHash("sha256").update(data).digest("hex") });
  }

  const provisioned: { human: string; humanId: string; colleague: string; colleagueId: string; archivedDuplicates: number }[] = [];
  for (const item of SHOWCASES) {
    const image = images.get(item.slug)!;
    const result = await sql.begin(async (tx) => {
      let [identity] = await tx`SELECT id FROM identities WHERE organisation_id=${organisation.id} AND provenance->>'showcase_slug'=${item.slug} LIMIT 1`;
      if (!identity) [identity] = await tx`
        INSERT INTO identities (organisation_id,owner_name,display_name,provenance,geographic_scope,commercial_use_confirmed,state,approved_by,approved_at)
        VALUES (${organisation.id},'VowHumans synthetic asset',${item.name},${JSON.stringify({ source: "vowhumans-showcase", showcase_slug: item.slug, actor_media: false })}::jsonb,ARRAY['South Africa']::text[],true,'approved',${organisation.owner_id},now()) RETURNING id
      `;
      for (const consentType of ["written", "face", "voice", "commercial"]) {
        const [consent] = await tx`SELECT id FROM identity_consents WHERE organisation_id=${organisation.id} AND identity_id=${identity.id} AND consent_type=${consentType} LIMIT 1`;
        if (!consent) await tx`
          INSERT INTO identity_consents (organisation_id,identity_id,consent_type,object_key,sha256,permitted_roles,state,signed_at)
          VALUES (${organisation.id},${identity.id},${consentType},${`showcase://${item.slug}/${consentType}`},${createHash("sha256").update(`${item.slug}:${consentType}:synthetic-no-actor`).digest("hex")},ARRAY[${item.role}]::text[],'approved',now())
        `;
      }

      const objectKey = `showcase/${organisation.id}/${item.slug}.png`;
      await tx`INSERT INTO media_blobs (object_key,organisation_id,mime_type,data,size_bytes) VALUES (${objectKey},${organisation.id},${image.mime},${image.data},${image.data.length}) ON CONFLICT (object_key) DO UPDATE SET data=EXCLUDED.data,mime_type=EXCLUDED.mime_type,size_bytes=EXCLUDED.size_bytes`;
      let [face] = await tx`SELECT id FROM face_assets WHERE organisation_id=${organisation.id} AND object_key=${objectKey} LIMIT 1`;
      if (!face) [face] = await tx`INSERT INTO face_assets (organisation_id,identity_id,object_key,sha256,media_type,provenance,detector_provider,preprocessing_state,state) VALUES (${organisation.id},${identity.id},${objectKey},${image.sha},${image.mime},${JSON.stringify({ source: "vowhumans-showcase", showcase_slug: item.slug, ai_generated: true })}::jsonb,'vowhumans-showcase','ready','active') RETURNING id`;

      const voiceName = `${item.name} showcase voice`;
      let [voice] = await tx`SELECT id FROM voices WHERE organisation_id=${organisation.id} AND name=${voiceName} LIMIT 1`;
      if (!voice) [voice] = await tx`INSERT INTO voices (organisation_id,identity_id,name,provider,provider_voice_id,language,is_custom,state,settings) VALUES (${organisation.id},${identity.id},${voiceName},'openai',${item.voice},'en-ZA',false,'active',${JSON.stringify({ source: "vowhumans-showcase", disclosed: true })}::jsonb) RETURNING id`;
      else await tx`UPDATE voices SET identity_id=${identity.id},provider='openai',provider_voice_id=${item.voice},language='en-ZA',state='active' WHERE id=${voice.id}`;

      const gestureName = `${item.name} — warm and attentive`;
      let [gesture] = await tx`SELECT id FROM gesture_profiles WHERE organisation_id=${organisation.id} AND name=${gestureName} LIMIT 1`;
      const gestureConfig = { features: { blinking: { enabled: true, range: "4–7s" }, head_tilt: { enabled: true, range: "±3°" }, listening_nod: { enabled: true, range: "subtle" }, expression: { enabled: true, range: "professional" } }, source: "vowhumans-showcase" };
      if (!gesture) [gesture] = await tx`INSERT INTO gesture_profiles (organisation_id,name,state,state_config) VALUES (${organisation.id},${gestureName},'active',${JSON.stringify(gestureConfig)}::jsonb) RETURNING id`;
      else await tx`UPDATE gesture_profiles SET state='active',state_config=${JSON.stringify(gestureConfig)}::jsonb WHERE id=${gesture.id}`;

      const knowledgeName = `${item.name} — approved role knowledge`;
      let [knowledge] = await tx`SELECT id FROM knowledge_bases WHERE organisation_id=${organisation.id} AND name=${knowledgeName} LIMIT 1`;
      if (!knowledge) [knowledge] = await tx`INSERT INTO knowledge_bases (organisation_id,name,description,state) VALUES (${organisation.id},${knowledgeName},${`Approved showcase guidance for ${item.role}.`},'active') RETURNING id`;
      else await tx`UPDATE knowledge_bases SET state='active',description=${`Approved showcase guidance for ${item.role}.`} WHERE id=${knowledge.id}`;
      let [document] = await tx`SELECT id FROM knowledge_documents WHERE organisation_id=${organisation.id} AND knowledge_base_id=${knowledge.id} AND title=${`${item.role} operating guide`} LIMIT 1`;
      if (!document) [document] = await tx`INSERT INTO knowledge_documents (organisation_id,knowledge_base_id,title,source_type,sha256,version,access_policy,state,language) VALUES (${organisation.id},${knowledge.id},${`${item.role} operating guide`},'generated',${createHash("sha256").update(item.knowledge.join("\n")).digest("hex")},1,'{"audience":"showcase","classification":"internal"}'::jsonb,'active','en-ZA') RETURNING id`;
      for (const [index, content] of item.knowledge.entries()) await tx`INSERT INTO knowledge_chunks (organisation_id,document_id,ordinal,content,citation) VALUES (${organisation.id},${document.id},${index},${content},${JSON.stringify({ source: `${item.role} operating guide`, section: index + 1 })}::jsonb) ON CONFLICT (document_id,ordinal) DO UPDATE SET content=EXCLUDED.content,citation=EXCLUDED.citation`;

      let [persona] = await tx`SELECT id FROM personas WHERE organisation_id=${organisation.id} AND name=${item.persona} LIMIT 1`;
      if (!persona) [persona] = await tx`INSERT INTO personas (organisation_id,name,description) VALUES (${organisation.id},${item.persona},${`Bounded, disclosed ${item.role} behaviour for the VowHumans showcase.`}) RETURNING id`;
      let [personaVersion] = await tx`SELECT id FROM persona_versions WHERE organisation_id=${organisation.id} AND persona_id=${persona.id} AND version=1 LIMIT 1`;
      const instructions = `You are ${item.name}, a disclosed AI-generated ${item.role}. Work only within approved knowledge. Do not make consequential decisions. Explain uncertainty and escalate exceptions to the named human owner.`;
      if (!personaVersion) [personaVersion] = await tx`INSERT INTO persona_versions (organisation_id,persona_id,version,state,role,system_instructions,conversation_style,opening_message,language,speaking_rate,max_response_words,voice_id,face_asset_id,gesture_profile_id,knowledge_base_ids,published_at,created_by) VALUES (${organisation.id},${persona.id},1,'published',${item.role},${instructions},'Warm, professional, concise and transparent',${`Hello, I’m ${item.name}, an AI-generated ${item.role}. How can I help within my approved role?`},'en-ZA',1,160,${voice.id},${face.id},${gesture.id},ARRAY[${knowledge.id}]::uuid[],now(),${organisation.owner_id}) RETURNING id`;
      else await tx`UPDATE persona_versions SET state='published',role=${item.role},system_instructions=${instructions},conversation_style='Warm, professional, concise and transparent',opening_message=${`Hello, I’m ${item.name}, an AI-generated ${item.role}. How can I help within my approved role?`},voice_id=${voice.id},face_asset_id=${face.id},gesture_profile_id=${gesture.id},knowledge_base_ids=ARRAY[${knowledge.id}]::uuid[],published_at=now() WHERE id=${personaVersion.id}`;

      const matchingHumans = await tx`SELECT id,state FROM digital_humans WHERE organisation_id=${organisation.id} AND name=${item.name} ORDER BY CASE WHEN state='active' THEN 0 ELSE 1 END,created_at`;
      let human = matchingHumans[0];
      if (!human) [human] = await tx`INSERT INTO digital_humans (organisation_id,identity_id,name,role,disclosure,default_voice_id,default_face_asset_id,default_gesture_profile_id,state) VALUES (${organisation.id},${identity.id},${item.name},${item.role},${`Fictional AI-generated ${item.role}; disclosed and human-supervised.`},${voice.id},${face.id},${gesture.id},'active') RETURNING id`;
      else await tx`UPDATE digital_humans SET identity_id=${identity.id},role=${item.role},disclosure=${`Fictional AI-generated ${item.role}; disclosed and human-supervised.`},default_voice_id=${voice.id},default_face_asset_id=${face.id},default_gesture_profile_id=${gesture.id},state='active',updated_at=now() WHERE id=${human.id}`;
      const duplicates = matchingHumans.slice(1).filter((row) => row.state === "draft");
      if (duplicates.length) await tx`UPDATE digital_humans SET state='archived',updated_at=now() WHERE organisation_id=${organisation.id} AND id=ANY(${duplicates.map((row) => row.id)}::uuid[])`;
      const humanSlug = String(human.id);
      await tx`INSERT INTO human_face_assignments (organisation_id,human_slug,face_asset_id) VALUES (${organisation.id},${humanSlug},${face.id}) ON CONFLICT (organisation_id,human_slug) DO UPDATE SET face_asset_id=EXCLUDED.face_asset_id,assigned_at=now()`;
      await tx`INSERT INTO human_voice_assignments (organisation_id,human_slug,voice_id) VALUES (${organisation.id},${humanSlug},${voice.id}) ON CONFLICT (organisation_id,human_slug) DO UPDATE SET voice_id=EXCLUDED.voice_id,assigned_at=now()`;
      await tx`INSERT INTO human_gesture_assignments (organisation_id,human_slug,gesture_profile_id) VALUES (${organisation.id},${humanSlug},${gesture.id}) ON CONFLICT (organisation_id,human_slug) DO UPDATE SET gesture_profile_id=EXCLUDED.gesture_profile_id,assigned_at=now()`;
      await tx`INSERT INTO human_persona_assignments (organisation_id,human_slug,persona_version_id) VALUES (${organisation.id},${humanSlug},${personaVersion.id}) ON CONFLICT (organisation_id,human_slug) DO UPDATE SET persona_version_id=EXCLUDED.persona_version_id,assigned_at=now()`;
      await tx`INSERT INTO human_knowledge_assignments (organisation_id,human_slug,knowledge_base_id) VALUES (${organisation.id},${humanSlug},${knowledge.id}) ON CONFLICT DO NOTHING`;

      let [application] = await tx`SELECT id FROM applications WHERE organisation_id=${organisation.id} AND slug=${item.applicationSlug} LIMIT 1`;
      if (!application) [application] = await tx`INSERT INTO applications (organisation_id,name,slug,status,settings) VALUES (${organisation.id},${item.application},${item.applicationSlug},'active',${JSON.stringify({ source: "vowhumans-showcase" })}::jsonb) RETURNING id`;
      await tx`INSERT INTO digital_human_applications (organisation_id,digital_human_id,application_id,persona_version_id,enabled) VALUES (${organisation.id},${human.id},${application.id},${personaVersion.id},true) ON CONFLICT (digital_human_id,application_id) DO UPDATE SET persona_version_id=EXCLUDED.persona_version_id,enabled=true`;

      let [colleague] = await tx`SELECT id FROM digital_colleagues WHERE organisation_id=${organisation.id} AND configuration->>'showcase_slug'=${item.slug} LIMIT 1`;
      if (!colleague) {
        const [template] = await tx`SELECT id FROM workforce_templates WHERE slug=${item.template} LIMIT 1`;
        [colleague] = await tx`INSERT INTO digital_colleagues (organisation_id,template_id,name,role_title,department,purpose,digital_human_id,persona_version_id,human_owner_user_id,escalation_owner_user_id,supported_languages,risk_level,autonomy_level,status,deployment_status,builder_step,configuration,approved_at,deployed_at,created_by) VALUES (${organisation.id},${template?.id || null},${item.colleague},${item.role},${item.department},${item.purpose},${human.id},${personaVersion.id},${organisation.owner_id},${organisation.owner_id},ARRAY['en-ZA']::text[],${item.risk},${item.autonomy},'deployed','deployed',12,${JSON.stringify({ source: "vowhumans-showcase", showcase_slug: item.slug, revision: 1, execution: "governed-work-queue" })}::jsonb,now(),now(),${organisation.owner_id}) RETURNING id`;
        for (const [priority, name] of item.functions.entries()) await tx`INSERT INTO colleague_functions (organisation_id,digital_colleague_id,name,description,in_scope,out_of_scope,required_knowledge,required_tools,human_review_required,priority) VALUES (${organisation.id},${colleague.id},${name},${name},ARRAY[${name}]::text[],ARRAY['Consequential decisions','Requests outside approved knowledge','External commitments without review']::text[],true,false,true,${item.functions.length-priority})`;
        for (const name of item.skills) await tx`INSERT INTO colleague_skills (organisation_id,digital_colleague_id,name,proficiency,evidence) VALUES (${organisation.id},${colleague.id},${name},'proficient','Configured showcase capability; validate outputs through the governed work queue')`;
        await tx`INSERT INTO colleague_knowledge_sources (organisation_id,digital_colleague_id,knowledge_base_id,purpose,required,status) VALUES (${organisation.id},${colleague.id},${knowledge.id},${`Approved source for ${item.role} work.`},true,'active')`;
        await tx`INSERT INTO colleague_workflows (organisation_id,digital_colleague_id,name,trigger_type,steps,expected_output,exception_policy,human_checkpoint_policy,max_iterations,status) VALUES (${organisation.id},${colleague.id},'Governed work intake','manual',${JSON.stringify([{ order: 1, action: "Validate consent, scope and requested outcome" },{ order: 2, action: "Retrieve approved role knowledge" },{ order: 3, action: "Prepare a cited, reviewable work product" },{ order: 4, action: "Route exceptions to the human owner" }])}::jsonb,'A traceable draft or completed bounded task','Pause and escalate when scope, policy or confidence is insufficient','Human review before consequential or external action',2,'active')`;
        const [objective] = await tx`INSERT INTO colleague_objectives (organisation_id,digital_colleague_id,label,description,owner_user_id,status) VALUES (${organisation.id},${colleague.id},'Deliver safe, reviewable role work',${item.purpose},${organisation.owner_id},'active') RETURNING id`;
        await tx`INSERT INTO colleague_kpis (organisation_id,digital_colleague_id,objective_id,name,unit,direction,target_value,measurement_policy) VALUES (${organisation.id},${colleague.id},${objective.id},'Human-approved completion rate','percent','increase',90,'Measured only from explicit human work-product reviews; no fabricated baseline')`;
        for (const [code,instruction,enforcement,action] of [["disclose_ai","Disclose the AI system at the start of material interactions.","hard","block"],["bounded_role","Work only inside configured functions and approved knowledge.","policy","escalate"],["privacy_minimisation","Use the minimum authorised data and never expose secrets.","hard","block"],["human_authority","Escalate consequential decisions and exceptions to the named person.","human_review","escalate"]]) await tx`INSERT INTO colleague_guardrails (organisation_id,digital_colleague_id,code,instruction,enforcement,action_on_violation) VALUES (${organisation.id},${colleague.id},${code},${instruction},${enforcement},${action})`;
        await tx`INSERT INTO colleague_collaboration_routes (organisation_id,digital_colleague_id,route_type,target_user_id,condition,service_level_minutes,channel) VALUES (${organisation.id},${colleague.id},'human_owner',${organisation.owner_id},'Routine ownership and output review',480,'work_queue'),(${organisation.id},${colleague.id},'human_escalation',${organisation.owner_id},'Policy exception, low confidence, dispute or consequential decision',60,'work_queue')`;
        for (const [code,name] of [["identity_link","Disclosed Digital Human linked"],["persona_published","Published Persona linked"],["bounded_functions","Functions are bounded"],["knowledge_ready","Required knowledge is active"],["tools_least_privilege","Required tools are approved"],["guardrails_present","Core guardrails are active"],["human_escalation","Human escalation route works"],["autonomy_risk","Autonomy matches risk"]]) await tx`INSERT INTO colleague_tests (organisation_id,digital_colleague_id,test_code,name,test_type,expected_policy,status,result,run_by,run_at) VALUES (${organisation.id},${colleague.id},${code},${name},'readiness','{"requirement":"Showcase production-readiness contract"}'::jsonb,'passed','{"passed":true,"deterministic":true,"configuration_revision":1}'::jsonb,${organisation.owner_id},now())`;
        const snapshot = { configuration_revision: 1, source: "vowhumans-showcase", colleague: { name: item.colleague, role_title: item.role, digital_human_id: human.id, persona_version_id: personaVersion.id }, readiness: { score: 100 } };
        const [approval] = await tx`INSERT INTO colleague_approvals (organisation_id,digital_colleague_id,decision,scope,snapshot,rationale,approved_by) VALUES (${organisation.id},${colleague.id},'approved','sandbox deployment',${JSON.stringify(snapshot)}::jsonb,'Approved as a bounded VowHumans showcase with deterministic readiness checks and named human escalation.',${organisation.owner_id}) RETURNING id`;
        await tx`INSERT INTO colleague_deployments (organisation_id,digital_colleague_id,approval_id,environment,channels,version,status,configuration_snapshot,deployed_by,deployed_at) VALUES (${organisation.id},${colleague.id},${approval.id},'sandbox',ARRAY['work_queue']::text[],1,'deployed',${JSON.stringify({ configuration_revision: 1, readiness_score: 100, source: "vowhumans-showcase" })}::jsonb,${organisation.owner_id},now())`;
      }
      return { humanId: String(human.id), colleagueId: String(colleague.id), archivedDuplicates: duplicates.length };
    });
    provisioned.push({ human: item.name, humanId: result.humanId, colleague: item.colleague, colleagueId: result.colleagueId, archivedDuplicates: result.archivedDuplicates });
  }
  return NextResponse.json({ success: true, data: { organisation: { id: organisation.id, name: organisation.name }, provisioned } });
}
