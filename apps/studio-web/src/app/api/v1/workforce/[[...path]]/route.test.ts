import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET, POST, PUT } from "./route";

vi.mock("@/lib/db", () => ({
  databaseConfigured: true,
  default: vi.fn(),
}));

const colleagueId = "11111111-1111-4111-8111-111111111111";

function context(path: string[] = []) {
  return { params: Promise.resolve({ path }) };
}

describe("Digital Workforce API access boundary", () => {
  it("protects the dashboard and catalogue", async () => {
    const dashboard = await GET(
      new NextRequest("http://localhost/api/v1/workforce"),
      context(),
    );
    const templates = await GET(
      new NextRequest("http://localhost/api/v1/workforce/templates"),
      context(["templates"]),
    );
    expect(dashboard.status).toBe(401);
    expect(templates.status).toBe(401);
  });

  it("protects every one of the twelve configuration step mutations", async () => {
    const steps = [
      "role",
      "functions",
      "skills",
      "knowledge",
      "tools",
      "workflows",
      "objectives",
      "guardrails",
      "collaboration",
      "testing",
      "approval",
      "deployment",
    ];

    for (const step of steps) {
      const response = await PUT(
        new NextRequest(
          `http://localhost/api/v1/workforce/colleagues/${colleagueId}/steps/${step}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
        context(["colleagues", colleagueId, "steps", step]),
      );
      expect(response.status, step).toBe(401);
    }
  });

  it("protects create, test, approval and deployment operations", async () => {
    for (const path of [
      [],
      ["colleagues", colleagueId, "tests", "run"],
      ["colleagues", colleagueId, "approvals"],
      ["colleagues", colleagueId, "deployments"],
      ["testing", "runs"],
      ["providers", "health", "test"],
      ["colleagues", colleagueId, "pause"],
      ["tasks", colleagueId, "cancel"],
      ["deployments", colleagueId, "promote"],
    ]) {
      const response = await POST(
        new NextRequest(`http://localhost/api/v1/workforce/${path.join("/")}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        context(path),
      );
      expect(response.status, path.join("/") || "create").toBe(401);
    }
  });

  it("protects every post-deployment read surface", async () => {
    for (const path of [
      ["testing"],
      ["operations"],
      ["products"],
      ["providers", "health"],
      ["colleagues", colleagueId, "runtime"],
    ]) {
      const response = await GET(
        new NextRequest(`http://localhost/api/v1/workforce/${path.join("/")}`),
        context(path),
      );
      expect(response.status, path.join("/")).toBe(401);
    }
  });
});
