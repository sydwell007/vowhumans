import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVowLmsLessonContext } from "./vowLmsContext";

const secret = "test-context-secret-with-more-than-32-characters";

function tokenFor(slug: string) {
  const encoded = Buffer.from(
    JSON.stringify({
      aud: "vowhumans-lesson-context",
      exp: Math.floor(Date.now() / 1000) + 300,
      slug,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

describe("VowLMS lesson context", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("loads a signed lesson without asking for a learner upload", async () => {
    vi.stubEnv("VOWHUMANS_LESSON_CONTEXT_SECRET", secret);
    vi.stubEnv("VOWLMS_CONTEXT_API_ORIGIN", "https://vowlms.vercel.app");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          academy_name: "Upskilling Academy",
          course_title: "Business Ethics Fundamentals",
          lesson_slug: "module-reading-material",
          lesson_title: "Module Reading Material",
          module_title: "Module 1: Foundation",
          lesson_text:
            "Integrity means aligning workplace conduct\u0000 with ethical principles.",
          resource: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const context = await loadVowLmsLessonContext(tokenFor("module-reading-material"));

    expect(context.lesson_title).toBe("Module Reading Material");
    expect(context.content).toContain("Integrity means");
    expect(context.content).not.toContain("\u0000");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://vowlms.vercel.app/api/vowhumans/lesson-context/module-reading-material",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: expect.stringMatching(/^Bearer /) }),
      }),
    );
  });

  it("rejects a tampered token before fetching lesson content", async () => {
    vi.stubEnv("VOWHUMANS_LESSON_CONTEXT_SECRET", secret);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadVowLmsLessonContext(`${tokenFor("module-reading-material")}tampered`),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
