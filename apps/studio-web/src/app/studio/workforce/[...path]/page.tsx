import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/StudioShell";
import { WorkforceStudio } from "@/components/WorkforceStudio";

export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }): Promise<Metadata> {
  const { path } = await params;
  return path[0] === "create"
    ? { title: "Create Digital Colleague", description: "Start from a bounded workforce role template." }
    : { title: "Configure Digital Colleague", description: "Complete the governed 12-step Digital Colleague workflow." };
}

export default async function WorkforcePathPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length === 0 || path.length > 2) notFound();
  const mode = path[0] === "create" ? "create" : "builder";
  return <StudioShell section="workforce"><WorkforceStudio mode={mode} path={path} /></StudioShell>;
}
