import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { IndustryDetail } from "@/components/CommercialPages"; import { industries } from "@/data/commercial";
export async function generateStaticParams(){return industries.map(industry=>({industry:industry.slug}))}
export async function generateMetadata({params}:{params:Promise<{industry:string}>}):Promise<Metadata>{const {industry:slug}=await params;const item=industries.find(i=>i.slug===slug);if(!item)return {};return {title:`${item.name} solutions`,description:item.headline}}
export default async function Page({params}:{params:Promise<{industry:string}>}){const {industry}=await params;if(!industries.some(item=>item.slug===industry))notFound();return <IndustryDetail slug={industry}/>}
