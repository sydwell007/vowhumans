import { notFound } from "next/navigation"; import { TemplateDetail } from "@/components/CommercialPages"; import { templates } from "@/data/commercial";
export default async function Page({params}:{params:Promise<{template:string}>}){const {template}=await params;if(!templates.some(item=>item.slug===template))notFound();return <TemplateDetail slug={template}/>}
