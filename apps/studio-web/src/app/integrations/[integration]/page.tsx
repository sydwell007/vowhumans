import { notFound } from "next/navigation"; import { IntegrationDetail } from "@/components/CommercialPages"; import { integrations } from "@/data/commercial";
export default async function Page({params}:{params:Promise<{integration:string}>}){const {integration}=await params;if(!integrations.some(item=>item.slug===integration))notFound();return <IntegrationDetail slug={integration}/>}
