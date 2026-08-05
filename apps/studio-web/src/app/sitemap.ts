import type { MetadataRoute } from "next";
import { academyCourses, customerStories, industries, integrations, legalDocuments, products, templates } from "@/data/commercial";
import { humans } from "@/data/platform";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin=process.env.NEXT_PUBLIC_SITE_URL??"https://vowhumans.com";
  const base=["","platform","products","solutions","industries","digital-humans","templates","integrations","pricing","customers","marketplace","academy","developers","docs","api-reference","sdks","webhooks","status","security","trust","resources","blog","about","partners","investors","contact","book-demo","roi-calculator"];
  const detail=[...products.map(item=>`products/${item.slug}`),...industries.map(item=>`industries/${item.slug}`),...humans.map(item=>`digital-humans/${item.id}`),...templates.map(item=>`templates/${item.slug}`),...integrations.map(item=>`integrations/${item.slug}`),...customerStories.map(item=>`customers/${item.slug}`),...academyCourses.map(item=>`academy/courses/${item.slug}`),...legalDocuments.map(item=>`legal/${item}`)];
  return [...base,...detail].map((path,index)=>({url:`${origin}/${path}`,lastModified:new Date("2026-08-05"),changeFrequency:index===0?"weekly":"monthly",priority:index===0?1:path.includes("/")?0.7:0.8}));
}
