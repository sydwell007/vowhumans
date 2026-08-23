import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicWorkforcePaths, WorkforcePublic, type PublicWorkforcePath } from "@/components/WorkforcePublic";

const metadataByPath: Record<string, { title: string; description: string }> = {
  index: { title: "AI Digital Workforce", description: "Build governed Digital Colleagues from disclosed Digital Humans, published Personas and accountable work controls." },
  roles: { title: "Digital Colleague Roles", description: "Explore bounded Digital Colleague role templates across customer experience, operations, learning, sales, people, finance, risk and technology." },
  "how-it-works": { title: "How the Digital Workforce Works", description: "See the simple eight-step public journey and the persistent 12-step Studio configuration workflow." },
  deployment: { title: "Digital Workforce Deployment", description: "Move Digital Colleagues from draft to tested, approved and governed deployment." },
  "human-collaboration": { title: "Human and Digital Collaboration", description: "Design Digital Colleagues to extend teams while people retain authority for judgement and exceptions." },
  governance: { title: "Digital Workforce Governance", description: "Govern Digital Colleague identity, Persona, work, risk, tools, tests, approvals and deployment." },
};

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const path = (await params).path?.[0] ?? "index";
  return metadataByPath[path] ?? {};
}

export default async function WorkforceRoute({ params }: { params: Promise<{ path?: string[] }> }) {
  const segments = (await params).path ?? [];
  if (segments.length > 1) notFound();
  const path = segments[0];
  if (path && !publicWorkforcePaths.includes(path as PublicWorkforcePath)) notFound();
  return <WorkforcePublic path={path as PublicWorkforcePath | undefined} />;
}
