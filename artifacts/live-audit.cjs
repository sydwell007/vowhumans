const fs = require("node:fs/promises");
const path = require("node:path");

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE must point to the installed Playwright package");
const { chromium } = require(playwrightModule);

const baseUrl = new URL(process.env.AUDIT_BASE_URL || "https://vowhumans.com");
const outputDirectory = path.resolve(process.env.AUDIT_OUTPUT || "artifacts/live-audit-before");
const edgePath = process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function liveUrl(value) {
  const url = new URL(value, baseUrl);
  // Audit the requested target environment even when the canonical sitemap is
  // deliberately pinned to production (as it should be in every deployment).
  url.protocol = baseUrl.protocol;
  url.hostname = baseUrl.hostname;
  url.port = baseUrl.port;
  url.hash = "";
  return url.href;
}

(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
  const sitemapResponse = await context.request.get(new URL("/sitemap.xml", baseUrl).href);
  const sitemapXml = await sitemapResponse.text();
  const sitemapSourceUrls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  const sitemapUrls = sitemapSourceUrls.map((value) => liveUrl(value));
  const extras = [
    "/sign-in", "/sign-up", "/studio", "/studio/workforce", "/documentation", "/support",
    "/search", "/partner-apply", "/investor-contact", "/trust-request", "/offline", "/not-a-real-route"
  ].map((value) => new URL(value, baseUrl).href);
  const urls = [...new Set([...sitemapUrls, ...extras])];
  const page = await context.newPage();
  const results = [];
  const discoveredLinks = new Set();
  let activeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") activeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => activeErrors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText.includes("ERR_ABORTED")) return;
    activeErrors.push(`request: ${request.method()} ${request.url()} ${failure ? failure.errorText : "failed"}`);
  });

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    activeErrors = [];
    let response;
    let navigationError = null;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => !document.querySelector(".loading-screen"), null, { timeout: 15000 }).catch(() => {});
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
          window.setTimeout(resolve, 5000);
        })));
      });
      await page.waitForTimeout(100);
    } catch (error) {
      navigationError = error.message;
    }
    const audit = navigationError ? null : await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const internalLinks = [...document.querySelectorAll("a[href]")].map((link) => link.href);
      const invalidLinks = [...document.querySelectorAll("a")]
        .filter((link) => visible(link) && (!link.getAttribute("href") || link.getAttribute("href") === "#"))
        .map((link) => (link.textContent || "").trim().slice(0, 80));
      const brokenImages = [...document.images]
        .filter((image) => visible(image) && (!image.complete || image.naturalWidth === 0))
        .map((image) => image.currentSrc || image.src);
      const missingAltImages = [...document.images]
        .filter((image) => !image.hasAttribute("alt"))
        .map((image) => image.currentSrc || image.src);
      const unnamedButtons = [...document.querySelectorAll("button")]
        .filter((button) => visible(button) && !(button.getAttribute("aria-label") || button.textContent || "").trim())
        .length;
      const fieldsWithoutNames = [...document.querySelectorAll("input, select, textarea")]
        .filter((field) => visible(field) && field.type !== "hidden" && !(
          field.getAttribute("aria-label") || field.getAttribute("aria-labelledby") ||
          (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) || field.closest("label")
        ))
        .length;
      const tinyText = [...document.querySelectorAll("main p, main li, main label, main button, main a, main small")]
        .filter((element) => visible(element) && (element.textContent || "").trim().length > 1 && parseFloat(getComputedStyle(element).fontSize) < 12)
        .slice(0, 20)
        .map((element) => ({ text: (element.textContent || "").trim().slice(0, 80), size: getComputedStyle(element).fontSize }));
      return {
        title: document.title,
        h1Count: document.querySelectorAll("h1").length,
        formCount: document.forms.length,
        buttonCount: document.querySelectorAll("button").length,
        linkCount: document.links.length,
        invalidLinks,
        brokenImages,
        missingAltImages,
        unnamedButtons,
        fieldsWithoutNames,
        tinyText,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        internalLinks,
        bodyText: (document.body.innerText || "").slice(0, 500)
      };
    });
    if (audit) {
      for (const href of audit.internalLinks) {
        try {
          const parsed = new URL(href);
          if (parsed.origin === baseUrl.origin && !parsed.hash && !parsed.pathname.startsWith("/api/")) discoveredLinks.add(parsed.href);
        } catch {}
      }
      delete audit.internalLinks;
    }
    results.push({
      requestedUrl: url,
      finalUrl: page.url(),
      status: response ? response.status() : null,
      navigationError,
      errors: [...new Set(activeErrors)].slice(0, 30),
      audit
    });
    console.log(`[${index + 1}/${urls.length}] ${response ? response.status() : "ERR"} ${new URL(url).pathname}`);
  }

  const linkResults = [];
  for (const href of discoveredLinks) {
    let status = null;
    let error = null;
    try {
      const response = await context.request.get(href, { timeout: 30000, failOnStatusCode: false });
      status = response.status();
    } catch (caught) {
      error = caught.message;
    }
    linkResults.push({ href, status, error });
  }

  for (const [name, pathname] of Object.entries({ home: "/", privacy: "/legal/privacy", signin: "/sign-in", studio: "/studio", workforce: "/workforce" })) {
    await page.goto(new URL(pathname, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".loading-screen"), null, { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: path.join(outputDirectory, `${name}.png`), fullPage: true });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl.href,
    sitemapStatus: sitemapResponse.status(),
    sitemapUsesLocalhost: sitemapSourceUrls.some((url) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname)),
    testedPageCount: results.length,
    discoveredInternalLinkCount: discoveredLinks.size,
    results,
    linkResults
  };
  await fs.writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();

  const failures = results.filter((item) => item.navigationError || !item.status || item.status >= 400 || item.errors.length || (item.audit && (
    item.audit.brokenImages.length || item.audit.invalidLinks.length || item.audit.unnamedButtons || item.audit.fieldsWithoutNames || item.audit.horizontalOverflow
  )));
  const brokenLinks = linkResults.filter((item) => item.error || !item.status || item.status >= 400);
  console.log(JSON.stringify({ tested: results.length, failures: failures.length, internalLinks: linkResults.length, brokenLinks: brokenLinks.length }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
