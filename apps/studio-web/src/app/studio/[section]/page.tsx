import { notFound } from "next/navigation";
import { StudioShell } from "@/components/StudioShell";
import { StudioView } from "@/components/StudioView";
import { pageMeta } from "@/data/platform";
export default async function StudioSectionPage({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!(section in pageMeta))notFound();return <StudioShell section={section}><StudioView section={section}/></StudioShell>}
