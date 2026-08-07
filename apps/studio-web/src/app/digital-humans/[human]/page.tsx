import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { HumanDetail } from "@/components/CommercialPages"; import { humans } from "@/data/platform";
export async function generateStaticParams(){return humans.map(human=>({human:human.id}))}
export async function generateMetadata({params}:{params:Promise<{human:string}>}):Promise<Metadata>{const {human:slug}=await params;const item=humans.find(h=>h.id===slug);if(!item)return {};return {title:`${item.name} · Fictional AI-generated identity`,description:`${item.role}. ${item.use}`}}
export default async function Page({params}:{params:Promise<{human:string}>}){const {human}=await params;if(!humans.some(item=>item.id===human))notFound();return <HumanDetail slug={human}/>}
