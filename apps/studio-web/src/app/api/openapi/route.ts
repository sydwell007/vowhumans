import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "VowHumans Platform API",
      version: "1.2.0",
      description:
        "Authenticated, organisation-scoped Studio API. Provider-backed workforce generation and execution remain explicitly feature-gated.",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": {
        get: {
          summary: "Health and capability truth",
          responses: { "200": { description: "Healthy" } },
        },
      },
      "/digital-humans": {
        get: {
          summary: "List digital humans",
          responses: { "200": { description: "List" } },
        },
      },
      "/personas": {
        get: {
          summary: "List Personas",
          responses: { "200": { description: "List" } },
        },
      },
      "/applications": {
        get: {
          summary: "List applications",
          responses: { "200": { description: "List" } },
        },
      },
      "/organisations": {
        post: {
          summary: "Validate a sandbox organisation draft",
          responses: { "202": { description: "Validated, not persisted" } },
        },
      },
      "/plans": {
        get: {
          summary: "List centrally configured proposed plans",
          responses: { "200": { description: "List" } },
        },
      },
      "/integrations": {
        get: {
          summary: "List connector status truth",
          responses: { "200": { description: "List" } },
        },
      },
      "/templates": {
        get: {
          summary: "List templates",
          responses: { "200": { description: "List" } },
        },
      },
      "/marketplace": {
        get: {
          summary: "List gated marketplace catalogue",
          responses: { "200": { description: "List" } },
        },
      },
      "/academy": {
        get: {
          summary: "List Academy courses",
          responses: { "200": { description: "List" } },
        },
      },
      "/demo-requests": {
        post: {
          summary: "Validate a public demo request without claiming delivery",
          responses: { "202": { description: "Validated, not persisted" } },
        },
      },
      "/sessions": {
        post: {
          summary: "Create a mock session draft",
          responses: { "201": { description: "Created" } },
        },
      },
      "/presenter-projects": {
        post: {
          summary: "Create a mock presenter draft",
          responses: { "201": { description: "Created" } },
        },
      },
      "/workforce/dashboard": {
        get: {
          summary: "Read tenant-scoped Digital Workforce operational state",
          responses: {
            "200": { description: "Recorded workforce state" },
            "401": { description: "Authentication required" },
          },
        },
      },
      "/workforce/templates": {
        get: {
          summary: "List the governed Digital Colleague starter catalogue",
          responses: { "200": { description: "Published templates" } },
        },
      },
      "/workforce/colleagues": {
        post: {
          summary: "Create a Digital Colleague draft from a template",
          responses: {
            "201": { description: "Draft created" },
            "403": { description: "Insufficient permission" },
          },
        },
      },
      "/workforce/colleagues/{id}": {
        get: {
          summary: "Read a complete Digital Colleague configuration",
          responses: {
            "200": { description: "Tenant-scoped configuration" },
            "404": { description: "Not found" },
          },
        },
      },
      "/workforce/colleagues/{id}/steps/{step}": {
        put: {
          summary: "Persist one of the 12 workforce configuration steps",
          responses: {
            "200": { description: "Step saved" },
            "422": { description: "Invalid configuration" },
          },
        },
      },
      "/workforce/colleagues/{id}/tests": {
        post: {
          summary: "Run deterministic readiness and governance tests",
          responses: { "200": { description: "Recorded test evidence" } },
        },
      },
      "/workforce/colleagues/{id}/approvals": {
        post: {
          summary: "Append an immutable approval decision",
          responses: {
            "201": { description: "Decision recorded" },
            "409": { description: "Readiness requirements not met" },
          },
        },
      },
      "/workforce/colleagues/{id}/deployments": {
        post: {
          summary: "Create a governed deployment from an approval snapshot",
          responses: {
            "201": { description: "Deployment recorded" },
            "409": { description: "Approval or capability gate failed" },
          },
        },
      },
      "/workforce/tasks": {
        get: {
          summary: "List tenant-scoped work items and reviewable products",
          responses: { "200": { description: "Work queue" } },
        },
        post: {
          summary: "Assign a work item to a deployed Digital Colleague",
          responses: { "201": { description: "Work item queued" } },
        },
      },
      "/workforce/tasks/{id}/review-brief": {
        post: {
          summary: "Create a deterministic, provider-free review brief",
          responses: { "201": { description: "Reviewable brief" } },
        },
      },
      "/workforce/tasks/{id}/execute": {
        post: {
          summary:
            "Create a labelled model draft when the provider gate is enabled",
          responses: {
            "201": { description: "Model draft awaiting human review" },
            "503": { description: "Provider disabled" },
          },
        },
      },
      "/workforce/products/{id}/reviews": {
        post: {
          summary: "Append a human work-product review",
          responses: { "201": { description: "Review recorded" } },
        },
      },
      "/workforce/analytics": {
        get: {
          summary: "Read recorded, non-inferred workforce evidence",
          responses: { "200": { description: "Evidence-backed analytics" } },
        },
      },
    },
  });
}
