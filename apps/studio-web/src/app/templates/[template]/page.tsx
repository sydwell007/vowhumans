import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { TemplateDetail } from "@/components/CommercialPages"; import { templates } from "@/data/commercial";
export async function generateStaticParams(){return templates.map(template=>({template:template.slug}))}
export async function generateMetadata({params}:{params:Promise<{template:string}>}):Promise<Metadata>{const {template:slug}=await params;const item=templates.find(t=>t.slug===slug);if(!item)return {};return {title:item.name,description:item.description}}
export default async function Page({params}:{params:Promise<{template:string}>}){const {template}=await params;if(!templates.some(item=>item.slug===template))notFound();return <TemplateDetail slug={template}/>}
