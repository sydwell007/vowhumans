import { createHmac, timingSafeEqual } from "node:crypto";
import "@napi-rs/canvas";

const TOKEN_AUDIENCE = "vowhumans-lesson-context";
const MAX_CONTEXT_TOKEN_LENGTH = 2_048;
const MAX_RESOURCE_BYTES = 15 * 1024 * 1024;
const MAX_LESSON_CONTEXT_CHARS = 60_000;

type LessonContextTokenPayload = {
  aud: typeof TOKEN_AUDIENCE;
  exp: number;
  slug: string;
};

type VowLmsContextResponse = {
  academy_name?: string;
  course_title?: string;
  lesson_slug?: string;
  lesson_title?: string;
  module_title?: string;
  lesson_text?: string;
  resource?: {
    filename?: string;
    filesize?: number;
    mime_type?: string;
    type?: string;
    url?: string;
  } | null;
};

export type VowLmsLessonContext = {
  academy_name: string;
  course_title: string;
  lesson_slug: string;
  lesson_title: string;
  module_title: string;
  source_title: string;
  source_type: "lesson" | "pdf";
  content: string;
};

export class VowLmsContextError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "VowLmsContextError";
  }
}

function verifyToken(token: string): LessonContextTokenPayload {
  const secret = process.env.VOWHUMANS_LESSON_CONTEXT_SECRET ?? "";
  if (!secret || !token || token.length > MAX_CONTEXT_TOKEN_LENGTH) {
    throw new VowLmsContextError("Invalid lesson context token", 401);
  }

  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) {
    throw new VowLmsContextError("Invalid lesson context token", 401);
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new VowLmsContextError("Invalid lesson context token", 401);
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<LessonContextTokenPayload>;
    if (
      payload.aud !== TOKEN_AUDIENCE ||
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000) ||
      typeof payload.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)
    ) {
      throw new Error("Invalid payload");
    }
    return payload as LessonContextTokenPayload;
  } catch {
    throw new VowLmsContextError("Invalid lesson context token", 401);
  }
}

function configuredOrigin(name: string, fallback: string) {
  try {
    const url = new URL(process.env[name] ?? fallback);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function extractPdf(resource: NonNullable<VowLmsContextResponse["resource"]>) {
  const allowedOrigin = configuredOrigin(
    "VOWLMS_RESOURCE_ORIGIN",
    "https://api.goalvow.com",
  );
  if (!allowedOrigin || !resource.url) {
    throw new VowLmsContextError("Lesson resource is unavailable", 502);
  }

  let resourceUrl: URL;
  try {
    resourceUrl = new URL(resource.url);
  } catch {
    throw new VowLmsContextError("Lesson resource is unavailable", 502);
  }
  if (
    resourceUrl.origin !== allowedOrigin.origin ||
    resourceUrl.pathname !== "/files/serve"
  ) {
    throw new VowLmsContextError("Lesson resource is not approved", 502);
  }

  const response = await fetch(resourceUrl, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25_000),
  });
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentLength > MAX_RESOURCE_BYTES) {
    throw new VowLmsContextError("Lesson resource could not be retrieved", 502);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESOURCE_BYTES) {
    throw new VowLmsContextError("Lesson resource is too large", 413);
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    console.error("[vowlms-context] Lesson resource is not a PDF", {
      bytes: bytes.length,
      contentType,
    });
    throw new VowLmsContextError("Lesson resource could not be read", 502);
  }

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const result = await parser.getText();
      return result.text.trim().slice(0, MAX_LESSON_CONTEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error("[vowlms-context] PDF extraction failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      bytes: bytes.length,
      contentType,
    });
    throw new VowLmsContextError("Lesson resource could not be read", 502);
  }
}

export async function loadVowLmsLessonContext(
  token: string,
): Promise<VowLmsLessonContext> {
  const payload = verifyToken(token);
  const contextOrigin = configuredOrigin(
    "VOWLMS_CONTEXT_API_ORIGIN",
    "https://vowlms.vercel.app",
  );
  if (!contextOrigin) {
    throw new VowLmsContextError("Lesson context provider is not configured", 503);
  }

  const endpoint = new URL(
    `/api/vowhumans/lesson-context/${encodeURIComponent(payload.slug)}`,
    contextOrigin,
  );
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => null)) as VowLmsContextResponse | null;
  if (!response.ok || !body || body.lesson_slug !== payload.slug) {
    throw new VowLmsContextError("Lesson context could not be retrieved", 502);
  }

  const lessonText = typeof body.lesson_text === "string" ? body.lesson_text.trim() : "";
  let sourceType: VowLmsLessonContext["source_type"] = "lesson";
  let sourceTitle = body.lesson_title || payload.slug;
  let content = lessonText;

  if (body.resource?.type === "pdf" && body.resource.url) {
    content = await extractPdf(body.resource);
    sourceType = "pdf";
    sourceTitle = body.resource.filename || sourceTitle;
  }
  // PostgreSQL text/jsonb cannot store U+0000. Some generated PDFs include NUL
  // glyph placeholders even though the visible text is valid, so remove only
  // those database-invalid characters before persisting the approved context.
  content = content.replaceAll("\u0000", "").trim();
  if (!content) {
    throw new VowLmsContextError("Lesson content is empty", 422);
  }

  return {
    academy_name: body.academy_name || "GoalVow Academy",
    course_title: body.course_title || "GoalVow course",
    lesson_slug: payload.slug,
    lesson_title: body.lesson_title || payload.slug,
    module_title: body.module_title || "Course module",
    source_title: sourceTitle,
    source_type: sourceType,
    content: content.slice(0, MAX_LESSON_CONTEXT_CHARS),
  };
}
