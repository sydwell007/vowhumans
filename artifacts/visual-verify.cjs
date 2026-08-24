const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3100";
const output = path.resolve(process.env.AUDIT_OUTPUT || "artifacts/visual-after");
const executablePath = process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  if (process.env.AUDIT_SHARE_URL) {
    await page.goto(process.env.AUDIT_SHARE_URL, { waitUntil: "networkidle", timeout: 60000 });
  }
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  const results = [];
  for (const route of ["/", "/workforce", "/workforce/how-it-works", "/legal/privacy", "/developers", "/sign-in"]) {
    errors.length = 0;
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector(".loading-screen"), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const audit = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const tiny = [...document.querySelectorAll("main p, main li, main label, main button, main a, main small")]
        .filter((element) => visible(element) && (element.textContent || "").trim().length > 1 && parseFloat(getComputedStyle(element).fontSize) < 12)
        .slice(0, 25)
        .map((element) => ({ tag: element.tagName, className: element.className, text: (element.textContent || "").trim().slice(0, 90), size: getComputedStyle(element).fontSize, ancestors: [...element.parentElement?.closest(".commercial-site, .studio-shell")?.classList || []] }));
      return {
        title: document.title,
        bodyLength: document.body.innerText.trim().length,
        h1: document.querySelector("h1")?.textContent?.trim() || null,
        loadingOverlay: Boolean(document.querySelector(".loading-screen")),
        errorOverlay: Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        tiny,
      };
    });
    await page.screenshot({ path: path.join(output, `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}.png`), fullPage: true });
    results.push({ route, status: response?.status() ?? null, errors: [...new Set(errors)], audit });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/workforce`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, "workforce-mobile.png"), fullPage: true });
  const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 2, bodyLength: document.body.innerText.trim().length }));

  await fs.writeFile(path.join(output, "report.json"), JSON.stringify({ results, mobile }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ results, mobile }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
