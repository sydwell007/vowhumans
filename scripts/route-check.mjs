import { existsSync } from "node:fs";
const root="apps/studio-web/src/app";
const expected=["page.tsx","studio/page.tsx","studio/[section]/page.tsx","products/page.tsx","products/[product]/page.tsx","industries/page.tsx","industries/[industry]/page.tsx","pricing/page.tsx","digital-humans/page.tsx","digital-humans/[human]/page.tsx","templates/page.tsx","integrations/page.tsx","customers/page.tsx","marketplace/[[...path]]/page.tsx","academy/[[...path]]/page.tsx","developers/page.tsx","api-reference/page.tsx","security/page.tsx","trust/page.tsx","investors/page.tsx","roi-calculator/page.tsx","app/[[...section]]/page.tsx","admin/[[...section]]/page.tsx","legal/[document]/page.tsx","api/health/route.ts","api/v1/[...route]/route.ts","sitemap.ts","robots.ts","manifest.ts"];
const missing=expected.filter(path=>!existsSync(`${root}/${path}`));
if(missing.length){console.error("Missing route contracts:\n"+missing.join("\n"));process.exit(1)}
console.log(`Route contract check passed (${expected.length} required route files).`);
