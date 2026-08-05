import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "VowHumans Development API", version: "1.1.0", description: "Non-persistent development surface. Deploy the versioned Afrihost PHP API or FastAPI gateway for production persistence." },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": { get: { summary: "Health and capability truth", responses: { "200": { description: "Healthy" } } } },
      "/digital-humans": { get: { summary: "List digital humans", responses: { "200": { description: "List" } } } },
      "/personas": { get: { summary: "List Personas", responses: { "200": { description: "List" } } } },
      "/applications": { get: { summary: "List applications", responses: { "200": { description: "List" } } } },
      "/organisations": { post: { summary: "Validate a sandbox organisation draft", responses: { "202": { description: "Validated, not persisted" } } } },
      "/plans": { get: { summary: "List centrally configured proposed plans", responses: { "200": { description: "List" } } } },
      "/integrations": { get: { summary: "List connector status truth", responses: { "200": { description: "List" } } } },
      "/templates": { get: { summary: "List templates", responses: { "200": { description: "List" } } } },
      "/marketplace": { get: { summary: "List gated marketplace catalogue", responses: { "200": { description: "List" } } } },
      "/academy": { get: { summary: "List Academy courses", responses: { "200": { description: "List" } } } },
      "/demo-requests": { post: { summary: "Validate a public demo request without claiming delivery", responses: { "202": { description: "Validated, not persisted" } } } },
      "/sessions": { post: { summary: "Create a mock session draft", responses: { "201": { description: "Created" } } } },
      "/presenter-projects": { post: { summary: "Create a mock presenter draft", responses: { "201": { description: "Created" } } } },
    },
  });
}
