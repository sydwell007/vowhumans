import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { CustomerDetail } from "@/components/CommercialPages"; import { customerStories } from "@/data/commercial";
export async function generateStaticParams(){return customerStories.map(story=>({customer:story.slug}))}
export async function generateMetadata({params}:{params:Promise<{customer:string}>}):Promise<Metadata>{const {customer:slug}=await params;const item=customerStories.find(c=>c.slug===slug);if(!item)return {};return {title:item.name,description:item.problem}}
export default async function Page({params}:{params:Promise<{customer:string}>}){const {customer}=await params;if(!customerStories.some(item=>item.slug===customer))notFound();return <CustomerDetail slug={customer}/>}
