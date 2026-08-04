import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "VowHumans Studio Development API", version: "1.0.0", description: "Mock local surface. The FastAPI gateway is the production API." },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": { get: { summary: "Health and capability truth", responses: { "200": { description: "Healthy" } } } },
      "/digital-humans": { get: { summary: "List digital humans", responses: { "200": { description: "List" } } } },
      "/personas": { get: { summary: "List Personas", responses: { "200": { description: "List" } } } },
      "/applications": { get: { summary: "List applications", responses: { "200": { description: "List" } } } },
      "/sessions": { post: { summary: "Create a mock session draft", responses: { "201": { description: "Created" } } } },
      "/presenter-projects": { post: { summary: "Create a mock presenter draft", responses: { "201": { description: "Created" } } } },
    },
  });
}

