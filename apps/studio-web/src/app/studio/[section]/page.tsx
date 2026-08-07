import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/StudioShell";
import { StudioView } from "@/components/StudioView";
import { pageMeta } from "@/data/platform";
export async function generateMetadata({params}:{params:Promise<{section:string}>}):Promise<Metadata>{const {section}=await params;if(!(section in pageMeta))return {};const meta=pageMeta[section];return {title:section==='dashboard'?'Dashboard':meta.title,description:meta.description}}
export default async function StudioSectionPage({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!(section in pageMeta))notFound();return <StudioShell section={section}><StudioView section={section}/></StudioShell>}
