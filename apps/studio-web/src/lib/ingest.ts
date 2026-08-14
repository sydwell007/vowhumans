import { isIP } from "node:net";
import sql from "@/lib/db";
import { embedBatch } from "@/lib/openai";

const MAX_EXTRACTED_CHARS = 200_000;

// Independent of upload size — a large scraped page or a DOCX with huge embedded
// content shouldn't be able to blow up embedding cost/time unexpectedly.
function capExtractedText(text: string): string {
  return text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
}

export async function extractText(bytes: Buffer, sourceType: string): Promise<string> {
  switch (sourceType) {
    case "pdf": {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(bytes) });
        try {
          const result = await parser.getText();
          return capExtractedText(result.text);
        } finally {
          await parser.destroy();
        }
      } catch (err) {
        throw new Error(`Could not read this PDF: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: bytes });
      return capExtractedText(result.value);
    }
    case "xlsx": {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(new Uint8Array(bytes).buffer as ArrayBuffer);
      const lines: string[] = [];
      workbook.eachSheet((sheet) => {
        lines.push(`# ${sheet.name}`);
        sheet.eachRow((row) => {
          const cells = Array.isArray(row.values) ? row.values.slice(1) : [];
          lines.push(cells.map((cell) => (cell == null ? "" : String(cell))).join(" | "));
        });
      });
      return capExtractedText(lines.join("\n"));
    }
    default:
      return capExtractedText(bytes.toString("utf8"));
  }
}

function isPrivateOrLinkLocalIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return true; // not a resolvable IP at all — treat conservatively as blocked
}

// Website ingestion fetches an org-supplied URL server-side — block requests aimed at
// internal/private network targets rather than trusting the URL at face value.
async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http/https URLs are supported.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("This URL is not reachable.");
  const { lookup } = await import("node:dns/promises");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve this URL's host.");
  }
  if (addresses.some((a) => isPrivateOrLinkLocalIp(a.address))) throw new Error("This URL is not reachable.");
  return url;
}

const MAX_WEBSITE_BYTES = 10 * 1024 * 1024;

export async function fetchWebsiteText(rawUrl: string): Promise<string> {
  const url = await assertPublicHttpUrl(rawUrl);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!res.ok) throw new Error(`Could not fetch this page (HTTP ${res.status}).`);
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBSITE_BYTES) throw new Error("This page is too large to import.");
  const html = await res.text();
  if (html.length > MAX_WEBSITE_BYTES) throw new Error("This page is too large to import.");
  const { convert } = await import("html-to-text");
  return capExtractedText(convert(html, { wordwrap: false }));
}

export function chunkText(text: string, options: { size?: number; overlap?: number } = {}): string[] {
  const size = options.size ?? 800;
  const overlap = options.overlap ?? 100;
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + size, trimmed.length);
    const chunk = trimmed.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= trimmed.length) break;
    start = end - overlap;
  }
  return chunks;
}

export type RetrievedChunk = { id: string; documentId: string; documentTitle: string; content: string; similarity: number };

// Used by the persona test console to ground a reply in the persona's assigned
// knowledge bases — embeds the query, then a straight pgvector cosine-similarity scan.
export async function retrieveChunks(organisationId: string, knowledgeBaseIds: string[], queryText: string, k = 5): Promise<RetrievedChunk[]> {
  if (knowledgeBaseIds.length === 0 || !queryText.trim()) return [];
  const embedded = await embedBatch([queryText]);
  if (!embedded.ok || embedded.data.length === 0) return [];
  const queryVector = `[${embedded.data[0].join(",")}]`;
  const rows = await sql<{ id: string; document_id: string; title: string; content: string; similarity: number }[]>`
    SELECT c.id, c.document_id, d.title, c.content, 1 - (c.embedding <=> ${queryVector}::vector) AS similarity
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.id = c.document_id
    WHERE c.organisation_id = ${organisationId} AND d.knowledge_base_id = ANY(${knowledgeBaseIds}) AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${queryVector}::vector
    LIMIT ${k}
  `;
  return rows.map((row) => ({ id: row.id, documentId: row.document_id, documentTitle: row.title, content: row.content, similarity: row.similarity }));
}
