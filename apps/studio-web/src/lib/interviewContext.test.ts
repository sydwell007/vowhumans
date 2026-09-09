import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyInterviewContextToken, InterviewContextError } from "./interviewContext";

const SECRET = "shared-interview-secret";

// Mirrors PlugConnect's src/lib/digitalHuman/interviewToken.ts mint scheme so this
// test proves the two sides of the wire contract stay compatible.
function mint(payload: Record<string, unknown>, secret = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    aud: "vowhumans-interview-context",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    candidate_first_name: "Lerato",
    target_role: "Customer Service Agent",
    target_category: "Customer Support",
    employer_name: "Acme Retail",
    job_summary: "Handle inbound customer queries with care.",
    interview_format: "single",
    question_count: 6,
    experience_level: "entry",
    lead_persona: "thandi",
    panelists: [{ name: "Thandi Mokoena", role: "Talent partner" }],
    ...overrides,
  };
}

describe("verifyInterviewContextToken", () => {
  beforeEach(() => {
    process.env.VOWHUMANS_INTERVIEW_CONTEXT_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.VOWHUMANS_INTERVIEW_CONTEXT_SECRET;
  });

  it("accepts a well-formed token minted with the shared scheme", () => {
    const context = verifyInterviewContextToken(mint(basePayload()));
    expect(context.target_role).toBe("Customer Service Agent");
    expect(context.candidate_first_name).toBe("Lerato");
    expect(context.interview_format).toBe("single");
    expect(context.panelists).toEqual([{ name: "Thandi Mokoena", role: "Talent partner" }]);
  });

  it("normalizes a panel token", () => {
    const context = verifyInterviewContextToken(
      mint(
        basePayload({
          interview_format: "panel",
          lead_persona: "sipho",
          panelists: [
            { name: "Sipho Dlamini", role: "Hiring manager" },
            { name: "Thandi Mokoena", role: "Talent partner" },
          ],
        }),
      ),
    );
    expect(context.interview_format).toBe("panel");
    expect(context.lead_persona).toBe("sipho");
    expect(context.panelists).toHaveLength(2);
  });

  it("rejects a tampered signature", () => {
    const token = mint(basePayload(), "wrong-secret");
    expect(() => verifyInterviewContextToken(token)).toThrow(InterviewContextError);
  });

  it("rejects an expired token", () => {
    const token = mint(basePayload({ exp: Math.floor(Date.now() / 1000) - 5 }));
    expect(() => verifyInterviewContextToken(token)).toThrow(/expired/i);
  });

  it("rejects a wrong audience", () => {
    const token = mint(basePayload({ aud: "something-else" }));
    expect(() => verifyInterviewContextToken(token)).toThrow(InterviewContextError);
  });

  it("clamps question_count and truncates the job summary", () => {
    const context = verifyInterviewContextToken(
      mint(basePayload({ question_count: 99, job_summary: "x".repeat(900) })),
    );
    expect(context.question_count).toBe(12);
    expect(context.job_summary.length).toBeLessThanOrEqual(500);
  });
});
