import { notFound } from "next/navigation"; import { CustomerDetail } from "@/components/CommercialPages"; import { customerStories } from "@/data/commercial";
export default async function Page({params}:{params:Promise<{customer:string}>}){const {customer}=await params;if(!customerStories.some(item=>item.slug===customer))notFound();return <CustomerDetail slug={customer}/>}
