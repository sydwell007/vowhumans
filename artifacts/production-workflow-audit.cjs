const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

const baseUrl = process.env.AUDIT_BASE_URL || "https://vowhumans.com";
const output = path.resolve(process.env.AUDIT_OUTPUT || "artifacts/production-workflow-audit");
const executablePath = process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const stamp = process.env.AUDIT_STAMP || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const auditEmail = process.env.AUDIT_RESUME_EMAIL || `vowhumans.audit.${stamp}@example.com`;
const resumeAudit = Boolean(process.env.AUDIT_RESUME_EMAIL);
const auditName = "VowHumans Production Audit";
const auditWorkspace = `VowHumans Workflow Audit ${stamp}`;
const auditPassword = process.env.AUDIT_PASSWORD || `Vh!${crypto.randomBytes(18).toString("base64url")}9a`;
const digitalHumanName = `Naledi Audit ${stamp}`;
const personaName = `Bounded Audit Persona ${stamp}`;
const knowledgeName = `Approved Audit Knowledge ${stamp}`;
const applicationName = `Audit Sandbox ${stamp}`;
const voiceName = `Audit Voice ${stamp}`;
const gestureName = `Audit Gesture ${stamp}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  let previousEvidence = null;
  if (resumeAudit) {
    previousEvidence = JSON.parse(await fs.readFile(path.join(output, "report.json"), "utf8")).evidence;
  }
  if (resumeAudit && process.env.AUDIT_ACCOUNT_PREPARED !== "true") {
    let envValues = process.env;
    if (!(envValues.DATABASE_URL || envValues.database_DATABASE_URL || envValues.database_POSTGRES_URL)) {
      const envText = await fs.readFile(path.resolve(process.env.AUDIT_ENV_FILE || ".env.local"), "utf8");
      envValues = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return null;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        return [match[1], value];
      }).filter(Boolean));
    }
    const databaseUrl = envValues.DATABASE_URL || envValues.database_DATABASE_URL || envValues.database_POSTGRES_URL;
    assert(databaseUrl, "DATABASE_URL is unavailable for the isolated audit-account resume");
    const postgres = require("postgres");
    const database = postgres(databaseUrl, { max: 1, connect_timeout: 10, idle_timeout: 2, ssl: "require", prepare: false });
    const salt = crypto.randomBytes(16);
    const passwordHash = `${salt.toString("hex")}:${crypto.scryptSync(auditPassword, salt, 64).toString("hex")}`;
    const resumed = await database`
      UPDATE users SET password_hash = ${passwordHash}, failed_login_attempts = 0, locked_until = NULL
      WHERE email = ${auditEmail} AND display_name = ${auditName}
      RETURNING id, organisation_id
    `;
    await database.end({ timeout: 2 });
    assert(resumed.length === 1, "the isolated audit account could not be resumed uniquely");
  }
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    reducedMotion: "reduce",
    locale: "en-ZA",
  });
  const page = await context.newPage();
  const checks = [];
  const apiTraffic = [];
  const runtimeErrors = [];
  const evidence = {};

  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/v1/") || url.endsWith("/api/health")) {
      apiTraffic.push({ method: response.request().method(), status: response.status(), url: new URL(url).pathname });
    }
    if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.request().method()} ${url}`);
  });

  async function record(name, task) {
    const startedAt = Date.now();
    try {
      const detail = await task();
      checks.push({ name, passed: true, durationMs: Date.now() - startedAt, ...(detail || {}) });
      return detail;
    } catch (error) {
      checks.push({ name, passed: false, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function api(pathname, options = {}) {
    const url = `${baseUrl}${pathname}`;
    const response = await context.request.fetch(url, options);
    const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
    if (!response.ok() || body.success === false) {
      throw new Error(`${options.method || "GET"} ${pathname} failed (${response.status()}): ${body.message || body.code || JSON.stringify(body).slice(0, 300)}`);
    }
    return { status: response.status(), body, data: body.data, meta: body.meta };
  }

  async function waitForApi(method, pathname, action) {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === method && url.pathname === pathname;
    }, { timeout: 30000 });
    await action();
    const response = await responsePromise;
    const body = await response.json().catch(() => ({}));
    assert(response.ok(), `${method} ${pathname} failed (${response.status()}): ${body.message || body.code || "unknown response"}`);
    assert(body.success !== false, `${method} ${pathname} returned success=false: ${body.message || body.code || "unknown response"}`);
    return body;
  }

  async function waitForStudioReady() {
    await page.locator(".studio-main").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(300);
  }

  try {
    await record("production health is live and fully ready", async () => {
      const response = await context.request.get(`${baseUrl}/api/health`);
      const body = await response.json();
      assert(response.ok(), `health returned ${response.status()}`);
      assert(body.status === "ok", `health status is ${body.status}`);
      assert(body.mode === "live", `health mode is ${body.mode}`);
      assert(body.persistence === true, "persistence is not enabled");
      assert(body.dependencies?.database === "reachable", "database is not reachable");
      assert(body.dependencies?.schema?.control_plane_ready === true, "control-plane schema is not ready");
      assert(body.dependencies?.schema?.workforce_ready === true, "workforce schema is not ready");
      assert(body.dependencies?.schema?.audit_ready === true, "audit function is not ready");
      evidence.health = body;
      return { mode: body.mode, database: body.dependencies.database };
    });

    await record(resumeAudit ? "temporary audit account signs in through the production UI" : "temporary audit account registers through the production UI", async () => {
      await page.goto(`${baseUrl}/${resumeAudit ? "sign-in" : "sign-up"}`, { waitUntil: "networkidle" });
      await page.getByLabel("Work email").fill(auditEmail);
      if (!resumeAudit) {
        await page.getByLabel("Full name").fill(auditName);
        await page.getByLabel("Workspace name").fill(auditWorkspace);
      }
      await page.getByLabel("Password").fill(auditPassword);
      if (!resumeAudit) await page.getByRole("checkbox").check();
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/studio", { timeout: 30000 }),
        page.getByRole("button", { name: resumeAudit ? "Sign in" : "Register", exact: true }).click(),
      ]);
      await waitForStudioReady();
      const session = await api("/api/v1/auth/session");
      assert(session.data?.authenticated === true, "registered account has no authenticated session");
      evidence.account = {
        email: auditEmail,
        workspace: auditWorkspace,
        userId: session.data.user?.id,
        organisationId: session.data.user?.organisationId || session.data.user?.organisation_id,
        role: session.data.user?.role,
      };
      return { email: auditEmail, role: session.data.user?.role, resumed: resumeAudit };
    });

    const assets = await record("production assets persist for the governed builders", async () => {
      if (resumeAudit) {
        const [faces, voices, knowledge, personas, applications] = await Promise.all([
          api("/api/v1/faces"),
          api("/api/v1/voices"),
          api("/api/v1/knowledge-bases"),
          api("/api/v1/personas"),
          api("/api/v1/applications"),
        ]);
        const prior = previousEvidence?.assets || {
          faceId: faces.data.items.length === 1 ? faces.data.items[0].id : "",
          voiceId: voices.data.items.find((item) => item.name === voiceName)?.id,
          knowledgeId: knowledge.data.items.find((item) => item.name === knowledgeName)?.id,
          personaId: personas.data.items.find((item) => item.name === personaName)?.id,
          personaVersionId: personas.data.items.find((item) => item.name === personaName)?.version_id,
          applicationId: applications.data.items.find((item) => item.name === applicationName)?.id,
        };
        assert(faces.data.items.some((item) => item.id === prior.faceId), "audit face is missing on resume");
        assert(voices.data.items.some((item) => item.id === prior.voiceId), "audit voice is missing on resume");
        assert(knowledge.data.items.some((item) => item.id === prior.knowledgeId), "audit knowledge is missing on resume");
        assert(personas.data.items.some((item) => item.version_id === prior.personaVersionId && item.state === "published"), "published audit Persona is missing on resume");
        assert(applications.data.items.some((item) => item.id === prior.applicationId), "audit application is missing on resume");
        evidence.assets = prior;
        return prior;
      }
      const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      const faceResponse = await context.request.post(`${baseUrl}/api/v1/faces`, {
        multipart: { file: { name: `audit-${stamp}.png`, mimeType: "image/png", buffer: onePixelPng } },
      });
      const faceBody = await faceResponse.json();
      assert(faceResponse.ok() && faceBody.success, `face upload failed (${faceResponse.status()}): ${faceBody.message || faceBody.code}`);
      const voice = await api("/api/v1/voices", { method: "POST", data: { name: voiceName, language: "en-ZA", provider_voice_id: "alloy" } });
      const knowledge = await api("/api/v1/knowledge-bases", { method: "POST", data: { name: knowledgeName, description: "Approved synthetic operating guidance for the isolated production audit workspace." } });
      const persona = await api("/api/v1/personas", { method: "POST", data: { mode: "blank", name: personaName, role: "Bounded production workflow auditor", description: "A disclosed, human-supervised audit persona." } });
      const published = await api(`/api/v1/persona-versions/${persona.data.version.id}/publish`, { method: "POST", data: {} });
      const application = await api("/api/v1/applications", { method: "POST", data: { name: applicationName } });
      const created = {
        faceId: faceBody.data.id,
        voiceId: voice.data.id,
        knowledgeId: knowledge.data.id,
        personaId: persona.data.persona.id,
        personaVersionId: published.data.id,
        applicationId: application.data.id,
      };
      evidence.assets = created;
      return created;
    });

    const digitalHuman = await record("8-step Digital Human builder completes and activates", async () => {
      await page.goto(`${baseUrl}/studio/digital-humans`, { waitUntil: "networkidle" });
      await waitForStudioReady();
      const beforeHumans = await api("/api/v1/digital-humans");
      const partialHuman = beforeHumans.data.items.find((item) => item.name === digitalHumanName);
      if (partialHuman) {
        const humanRow = page.locator(".persona-list > button").filter({ hasText: digitalHumanName });
        await humanRow.waitFor({ state: "visible" });
        assert(await humanRow.count() === 1, "partial audit Digital Human was not uniquely available");
        await humanRow.click();
        const voiceSlot = page.locator(".profile-slot").filter({ hasText: "Voice" });
        await voiceSlot.waitFor({ state: "visible" });
        assert(await voiceSlot.count() === 1, "voice setup slot was not uniquely available");
        await voiceSlot.getByRole("button").click();
      } else {
        await page.getByRole("button", { name: "New", exact: true }).click();
      }
      const dialog = page.getByRole("dialog", { name: "Build a Digital Human" });
      await dialog.waitFor({ state: "visible" });
      assert(await dialog.locator(".wizard-steps > div").count() === 8, "Digital Human builder does not show exactly 8 stages");

      if (!partialHuman) {
        await dialog.getByLabel("Name", { exact: true }).fill(digitalHumanName);
        await dialog.getByLabel("Role", { exact: true }).fill("Production Workflow Auditor");
        const disclosureField = dialog.locator(".form-grid textarea");
        assert(await disclosureField.count() === 1, "identity stage does not expose one disclosure field");
        await disclosureField.fill("AI-generated audit Digital Human. Not a real person. Operates only in the isolated audit workspace with human supervision.");
        await waitForApi("POST", "/api/v1/digital-humans", () => dialog.getByRole("button", { name: "Continue", exact: true }).click());
        await dialog.getByRole("heading", { name: "Face", exact: true }).waitFor();
        await dialog.getByLabel("Existing face assets").selectOption(assets.faceId);
        await waitForApi("POST", "/api/v1/face-assignments", () => dialog.getByRole("button", { name: "Use this face", exact: true }).click());
      }
      await dialog.getByRole("heading", { name: "Voice", exact: true }).waitFor();

      const voiceRow = dialog.locator(".voice-pick-row").filter({ hasText: voiceName });
      await voiceRow.waitFor({ state: "visible", timeout: 15000 });
      assert(await voiceRow.count() === 1, "audit voice was not uniquely available in the wizard");
      await waitForApi("POST", "/api/v1/voice-assignments", () => voiceRow.getByRole("button", { name: "Use", exact: true }).click());
      await dialog.getByRole("heading", { name: "Knowledge", exact: true }).waitFor();

      const knowledgeChoice = dialog.getByRole("button", { name: knowledgeName, exact: true });
      await knowledgeChoice.waitFor({ state: "visible", timeout: 15000 });
      assert(await knowledgeChoice.count() === 1, "audit knowledge library was not uniquely available");
      await knowledgeChoice.click();
      await waitForApi("POST", "/api/v1/knowledge-assignments", () => dialog.getByRole("button", { name: "Use selected library", exact: true }).click());
      await dialog.getByRole("heading", { name: "Persona", exact: true }).waitFor();

      await dialog.getByLabel("Existing personas").selectOption(assets.personaVersionId);
      await waitForApi("POST", "/api/v1/persona-assignments", () => dialog.getByRole("button", { name: "Use this persona", exact: true }).click());
      await dialog.getByRole("heading", { name: "Gesture profile", exact: true }).waitFor();

      const existingGesture = dialog.getByLabel("Existing profiles");
      await existingGesture.waitFor({ state: "visible", timeout: 15000 });
      const gestureOption = existingGesture.locator("option").filter({ hasText: gestureName });
      if (await gestureOption.count()) {
        await existingGesture.selectOption({ label: gestureName });
        await waitForApi("POST", "/api/v1/gesture-assignments", () => dialog.getByRole("button", { name: "Use this profile", exact: true }).click());
      } else {
        await dialog.getByLabel("Or create a new profile").fill(gestureName);
        await waitForApi("POST", "/api/v1/gesture-assignments", () => dialog.getByRole("button", { name: "Create & use", exact: true }).click());
      }
      await dialog.getByRole("heading", { name: "Applications and channels", exact: true }).waitFor();

      const applicationChoice = dialog.locator(".application-toggle-row").filter({ hasText: applicationName });
      await applicationChoice.waitFor({ state: "visible", timeout: 15000 });
      assert(await applicationChoice.count() === 1, "audit application was not uniquely available");
      if ((await applicationChoice.getAttribute("aria-pressed")) !== "true") {
        await waitForApi("POST", "/api/v1/digital-human-applications", () => applicationChoice.click());
      }
      await expectPressed(applicationChoice);
      await dialog.getByRole("button", { name: "Continue to review", exact: true }).click();
      await dialog.getByRole("heading", { name: "Review and activate", exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll(".wizard-review-summary .requirement-list .done").length === 7);
      assert(await dialog.locator(".wizard-review-summary .requirement-list .done").count() === 7, "one or more Digital Human review requirements are incomplete");
      await page.screenshot({ path: path.join(output, "digital-human-eight-step-review.png"), fullPage: true });
      await waitForApi("PATCH", `/api/v1/digital-humans/${(await api("/api/v1/digital-humans")).data.items.find((item) => item.name === digitalHumanName).id}`, () => dialog.getByRole("button", { name: "Activate Digital Human", exact: true }).click());
      await dialog.waitFor({ state: "hidden" });

      const humansResponse = await api("/api/v1/digital-humans");
      const human = humansResponse.data.items.find((item) => item.name === digitalHumanName);
      assert(human, "activated Digital Human was not persisted");
      assert(human.state === "active", `Digital Human ended in ${human.state}, not active`);
      const detail = await api(`/api/v1/digital-humans/${human.id}`);
      assert(detail.data.face?.id === assets.faceId, "face assignment did not persist");
      assert(detail.data.voice?.id === assets.voiceId, "voice assignment did not persist");
      assert(detail.data.persona?.version_id === assets.personaVersionId && detail.data.persona?.state === "published", "published Persona assignment did not persist");
      assert(detail.data.knowledge_bases.some((item) => item.id === assets.knowledgeId), "knowledge assignment did not persist");
      await page.screenshot({ path: path.join(output, "digital-human-active.png"), fullPage: true });
      evidence.digitalHuman = { id: human.id, state: human.state, builderSteps: 8 };
      return { id: human.id, state: human.state, builderSteps: 8 };
    });

    async function expectPressed(locator) {
      await locator.waitFor({ state: "visible" });
      await page.waitForFunction((name) => {
        const nodes = [...document.querySelectorAll("[role='dialog'] .application-toggle-row")];
        const node = nodes.find((item) => item.textContent?.includes(name));
        return node?.getAttribute("aria-pressed") === "true";
      }, applicationName);
    }

    const workforce = await record("12-step Digital Workforce builder tests, approves, and deploys", async () => {
      const colleagueName = `Naledi Reception Audit ${stamp}`;
      const workforceBefore = await api("/api/v1/workforce");
      const partialColleague = workforceBefore.data.colleagues.find((item) => item.name === colleagueName);
      let colleagueId;
      if (partialColleague) {
        colleagueId = partialColleague.id;
        await page.goto(`${baseUrl}/studio/workforce/${colleagueId}/role`, { waitUntil: "networkidle" });
        await page.locator(".workforce-step-card").waitFor({ state: "visible" });
      } else {
        await page.goto(`${baseUrl}/studio/workforce/create`, { waitUntil: "networkidle" });
        await waitForStudioReady();
        const template = page.locator(".workforce-template-grid > button").filter({ hasText: "AI Receptionist" });
        assert(await template.count() === 1, "AI Receptionist template was not uniquely available");
        await template.click();
        await page.getByLabel("Colleague name").fill(colleagueName);
        const createBodyPromise = waitForApi("POST", "/api/v1/workforce", () => page.getByRole("button", { name: "Create draft and configure", exact: true }).click());
        await page.waitForURL(/\/studio\/workforce\/[^/]+\/role$/, { timeout: 30000 });
        const createdBody = await createBodyPromise;
        colleagueId = createdBody.data.id;
        assert(page.url().endsWith(`/studio/workforce/${colleagueId}/role`), "created colleague route does not match persisted ID");
      }

      async function saveStep(step, configure) {
        await page.goto(`${baseUrl}/studio/workforce/${colleagueId}/${step}`, { waitUntil: "networkidle" });
        await page.locator(".workforce-step-card").waitFor({ state: "visible" });
        assert(await page.locator("nav[aria-label='12-step workforce configuration'] a").count() === 12, `${step}: builder rail does not show 12 stages`);
        if (configure) await configure();
        const body = await waitForApi("PUT", `/api/v1/workforce/colleagues/${colleagueId}/steps/${step}`, () => page.getByRole("button", { name: "Save step", exact: true }).click());
        await page.getByRole("status").filter({ hasText: "Saved to the organisation workspace" }).waitFor({ state: "visible" });
        return body.data;
      }

      await saveStep("role", async () => {
        await page.getByLabel("Digital Human").selectOption(digitalHuman.id);
        await page.getByLabel("Published Persona").selectOption(assets.personaVersionId);
        await page.getByLabel("Languages (comma separated)").fill("en-ZA");
      });
      await saveStep("functions");
      await saveStep("skills");
      await saveStep("knowledge", async () => {
        const row = page.locator(".choice-grid label").filter({ hasText: knowledgeName });
        assert(await row.count() === 1, "audit knowledge source was not available in workforce step 4");
        // The visual choice card intentionally owns the hit target, so direct
        // pointer checks on the nested input are intercepted by its label.
        // Force only the native checked-state transition while Playwright still
        // verifies that the control exists, is visible, and is enabled above.
        await row.getByRole("checkbox").check({ force: true });
      });
      await saveStep("tools");
      await saveStep("workflows");
      await saveStep("objectives");
      await saveStep("guardrails");
      await saveStep("collaboration");

      await page.goto(`${baseUrl}/studio/workforce/${colleagueId}/testing`, { waitUntil: "networkidle" });
      await page.locator(".workforce-step-card").waitFor({ state: "visible" });
      const testsBody = await waitForApi("POST", `/api/v1/workforce/colleagues/${colleagueId}/tests/run`, () => page.getByRole("button", { name: "Run readiness tests", exact: true }).click());
      assert(testsBody.data.readiness.readyForReview === true, `readiness remains blocked: ${JSON.stringify(testsBody.data.readiness.blockers)}`);
      assert(testsBody.data.tests.length === 8 && testsBody.data.tests.every((test) => test.status === "passed"), "not all 8 deterministic readiness tests passed");

      await page.goto(`${baseUrl}/studio/workforce/${colleagueId}/approval`, { waitUntil: "networkidle" });
      await page.locator(".workforce-step-card").waitFor({ state: "visible" });
      await page.getByLabel("Reviewer rationale").fill("Production audit confirms the bounded role, published persona, identity, guardrails, escalation route and deterministic readiness tests are acceptable for sandbox deployment.");
      const approvalBody = await waitForApi("POST", `/api/v1/workforce/colleagues/${colleagueId}/approvals`, () => page.getByRole("button", { name: "Record immutable approval", exact: true }).click());
      assert(approvalBody.data.readiness.readyForDeployment === true, "immutable approval did not make the colleague deployment-ready");
      assert(approvalBody.data.approvals.length >= 1, "approval history is empty after approval");

      await page.goto(`${baseUrl}/studio/workforce/${colleagueId}/deployment`, { waitUntil: "networkidle" });
      await page.locator(".workforce-step-card").waitFor({ state: "visible" });
      await page.getByLabel("Environment").selectOption("sandbox");
      const deploymentBody = await waitForApi("POST", `/api/v1/workforce/colleagues/${colleagueId}/deployments`, () => page.getByRole("button", { name: "Deploy governed role", exact: true }).click());
      assert(deploymentBody.data.status === "deployed", `colleague status is ${deploymentBody.data.status}`);
      assert(deploymentBody.data.deployment_status === "deployed", `deployment status is ${deploymentBody.data.deployment_status}`);
      assert(deploymentBody.data.deployments.some((item) => item.environment === "sandbox" && item.status === "deployed"), "sandbox deployment history is missing");
      await page.getByRole("heading", { name: "Deployment history", exact: true }).waitFor({ state: "visible" });
      await page.screenshot({ path: path.join(output, "digital-workforce-twelve-step-deployed.png"), fullPage: true });

      const persisted = await api(`/api/v1/workforce/colleagues/${colleagueId}`);
      assert(persisted.data.readiness.score === 100, `final workforce readiness is ${persisted.data.readiness.score}%`);
      assert(persisted.data.readiness.readyForDeployment === true, "final workforce state is not deployment-ready");
      evidence.workforce = {
        id: colleagueId,
        publicId: persisted.data.public_id,
        status: persisted.data.status,
        deploymentStatus: persisted.data.deployment_status,
        readinessScore: persisted.data.readiness.score,
        builderSteps: 12,
        deterministicTests: persisted.data.tests.length,
        approvals: persisted.data.approvals.length,
        deployments: persisted.data.deployments.length,
      };
      return evidence.workforce;
    });

    await record("authenticated production session remains isolated and healthy", async () => {
      const session = await api("/api/v1/auth/session");
      assert(session.data.authenticated === true, "audit session ended unexpectedly");
      assert((session.data.user.organisationId || session.data.user.organisation_id) === evidence.account.organisationId, "tenant context changed during workflow");
      const dashboard = await api("/api/v1/workforce");
      assert(dashboard.data.colleagues.some((item) => item.id === workforce.id), "deployed colleague is absent from the organisation dashboard");
      return { organisationId: session.data.user.organisationId || session.data.user.organisation_id, persistedColleagues: dashboard.data.colleagues.length };
    });
  } catch (error) {
    runtimeErrors.push(`audit: ${error instanceof Error ? error.message : String(error)}`);
    await page.screenshot({ path: path.join(output, "failure-state.png"), fullPage: true }).catch(() => {});
  } finally {
    const failedChecks = checks.filter((item) => !item.passed);
    const serverErrors = runtimeErrors.filter((item) => /^5\d\d /.test(item) || item.startsWith("audit:") || item.startsWith("page:") || item.startsWith("console:"));
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      passed: failedChecks.length === 0 && serverErrors.length === 0 && Boolean(evidence.digitalHuman?.state === "active") && Boolean(evidence.workforce?.status === "deployed"),
      account: evidence.account,
      evidence,
      checks,
      apiSummary: {
        total: apiTraffic.length,
        failures: apiTraffic.filter((entry) => entry.status >= 400),
        entries: apiTraffic,
      },
      runtimeErrors: [...new Set(serverErrors)],
      cleanup: "Audit account and persisted records intentionally retained pending separate user confirmation for deletion. The generated password was not written to disk.",
    };
    await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
