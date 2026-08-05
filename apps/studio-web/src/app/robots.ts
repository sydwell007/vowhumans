import type { MetadataRoute } from "next";
export default function robots():MetadataRoute.Robots {const origin=process.env.NEXT_PUBLIC_SITE_URL??"https://vowhumans.com";return {rules:{userAgent:"*",allow:"/",disallow:["/admin/","/app/","/api/","/studio/"]},sitemap:`${origin}/sitemap.xml`}}
