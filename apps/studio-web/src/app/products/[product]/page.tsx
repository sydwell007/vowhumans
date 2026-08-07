import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { ProductDetail } from "@/components/CommercialPages"; import { products } from "@/data/commercial";
export async function generateStaticParams(){return products.map(product=>({product:product.slug}))}
export async function generateMetadata({params}:{params:Promise<{product:string}>}):Promise<Metadata>{const {product:slug}=await params;const item=products.find(p=>p.slug===slug);if(!item)return {};return {title:item.name,description:item.summary}}
export default async function Page({params}:{params:Promise<{product:string}>}){const {product}=await params;if(!products.some(item=>item.slug===product))notFound();return <ProductDetail slug={product}/>}
