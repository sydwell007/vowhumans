import { notFound } from "next/navigation";
import { DemoExperience } from "@/components/DemoExperience";

export function generateStaticParams() {
  return ["interview", "tutor", "presenter"].map((demo) => ({ demo }));
}

export default async function DemoPage({ params }: { params: Promise<{ demo: string }> }) {
  const { demo } = await params;
  if (!['interview','tutor','presenter'].includes(demo)) notFound();
  return <DemoExperience demo={demo as 'interview'|'tutor'|'presenter'} />;
}

