import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoExperience } from "@/components/DemoExperience";

const demoMeta: Record<string, { title: string; description: string }> = {
  interview: { title: "Interview practice demo", description: "Rehearse a disclosed AI-generated interview in a private, candidate-owned practice room." },
  tutor: { title: "Course tutor demo", description: "Ask a disclosed AI course tutor a question and see a cited, source-grounded answer." },
  presenter: { title: "Presenter demo", description: "Turn a lesson script into an honest static preview with a disclosed AI presenter." },
};

export function generateStaticParams() {
  return ["interview", "tutor", "presenter"].map((demo) => ({ demo }));
}

export async function generateMetadata({ params }: { params: Promise<{ demo: string }> }): Promise<Metadata> {
  const { demo } = await params;
  return demoMeta[demo] ?? {};
}

export default async function DemoPage({ params }: { params: Promise<{ demo: string }> }) {
  const { demo } = await params;
  if (!['interview','tutor','presenter'].includes(demo)) notFound();
  return <DemoExperience demo={demo as 'interview'|'tutor'|'presenter'} />;
}

