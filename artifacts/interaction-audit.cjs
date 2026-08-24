const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

const baseUrl = process.env.AUDIT_BASE_URL || "http://localhost:3100";
const output = path.resolve(process.env.AUDIT_OUTPUT || "artifacts/interaction-after");
const executablePath = process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.url()}`); });
  const checks = [];
  async function check(name, task) {
    const start = Date.now();
    try {
      await task();
      checks.push({ name, passed: true, durationMs: Date.now() - start });
    } catch (error) {
      checks.push({ name, passed: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await check("desktop navigation menus open and close", async () => {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    for (const label of ["Platform", "Solutions", "Industries", "Resources"]) {
      const button = page.getByRole("button", { name: label });
      await button.click();
      if (await button.getAttribute("aria-expanded") !== "true") throw new Error(`${label} did not open`);
      await page.keyboard.press("Escape");
      if (await button.getAttribute("aria-expanded") !== "false") throw new Error(`${label} did not close on Escape`);
    }
  });

  await check("mobile navigation opens without page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).waitFor({ state: "visible" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    if (overflow) throw new Error("mobile navigation introduced horizontal overflow");
    await page.getByRole("button", { name: "Close navigation" }).click();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await check("public search submits and returns matching content", async () => {
    await page.goto(`${baseUrl}/search`, { waitUntil: "networkidle" });
    await page.getByLabel("Search public VowHumans content").fill("studio");
    await Promise.all([page.waitForURL(/q=studio/), page.getByRole("button", { name: "Search" }).click()]);
    if (await page.locator(".search-results-public a").count() < 1) throw new Error("search returned no results");
  });

  await check("lead form validates and reports successful safe submission", async () => {
    await page.goto(`${baseUrl}/book-demo`, { waitUntil: "networkidle" });
    await page.getByLabel("Work email").fill("audit@example.com");
    await page.getByLabel("Full name").fill("VowHumans Audit");
    await page.getByLabel("Organisation").fill("Audit Workspace");
    await page.getByLabel("What do you need?").fill("Validate the complete governed Digital Workforce flow.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Request demonstration" }).click();
    const status = page.getByRole("status");
    await status.waitFor({ state: "visible" });
    if (!/received|validated|persist/i.test(await status.innerText())) throw new Error(`unexpected lead response: ${await status.innerText()}`);
  });

  await check("ROI calculator recalculates and downloads CSV", async () => {
    await page.goto(`${baseUrl}/roi-calculator`, { waitUntil: "networkidle" });
    const heading = page.locator(".roi-output h2");
    const before = await heading.innerText();
    await page.getByLabel("Interactions per month").fill("5000");
    await page.getByLabel("Minutes per interaction").fill("9");
    const after = await heading.innerText();
    if (before === after) throw new Error("ROI output did not recalculate");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download CSV/ }).click()]);
    if (download.suggestedFilename() !== "vowhumans-roi-estimate.csv") throw new Error("unexpected ROI filename");
  });

  await check("interview demo completes its disclosed workflow", async () => {
    await page.goto(`${baseUrl}/demos/interview`, { waitUntil: "networkidle" });
    await page.getByLabel("Role or job context").fill("Customer success manager interview");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Start disclosed mock session/ }).click();
    await page.getByRole("button", { name: "End practice" }).click();
    await page.getByRole("heading", { name: "Your preparation belongs to you." }).waitFor();
    await page.getByRole("button", { name: /Practise again/ }).click();
    await page.getByRole("button", { name: /Start disclosed mock session/ }).waitFor();
  });

  await check("course tutor demo accepts a question and returns citations", async () => {
    await page.goto(`${baseUrl}/demos/tutor`, { waitUntil: "networkidle" });
    const input = page.getByLabel("Ask the tutor");
    await input.fill("How should I use active listening?");
    await page.getByRole("button", { name: "Send question" }).click();
    if (await page.locator(".citations span").count() < 2) throw new Error("tutor answer did not show citations");
  });

  await check("unauthenticated Studio routes are protected", async () => {
    await page.goto(`${baseUrl}/studio/digital-workforce`, { waitUntil: "networkidle" });
    if (!page.url().includes("/sign-in?next=")) throw new Error(`unexpected unauthenticated destination: ${page.url()}`);
  });

  await page.screenshot({ path: path.join(output, "final-state.png"), fullPage: true });
  const report = { baseUrl, passed: checks.every((item) => item.passed) && runtimeErrors.length === 0, checks, runtimeErrors: [...new Set(runtimeErrors)] };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
