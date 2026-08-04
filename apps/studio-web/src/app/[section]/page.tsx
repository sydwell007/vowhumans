import { notFound } from "next/navigation";
import { StudioShell } from "@/components/StudioShell";
import { StudioView } from "@/components/StudioView";
import { pageMeta } from "@/data/platform";

export function generateStaticParams() {
  return Object.keys(pageMeta)
    .filter((section) => section !== "dashboard")
    .map((section) => ({ section }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!pageMeta[section]) notFound();
  return (
    <StudioShell section={section}>
      <StudioView section={section} />
    </StudioShell>
  );
}

