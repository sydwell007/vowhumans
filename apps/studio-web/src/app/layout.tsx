import type { Metadata } from "next";
import "./globals.css";
import "./commercial.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://vowhumans.com"),
  title: { default: "VowHumans | AI Digital Workforce Platform", template: "%s · VowHumans" },
  description: "Build, deploy and govern disclosed AI digital employees across live conversations, presentations, websites and enterprise workflows.",
  alternates: { canonical: "/" },
  openGraph: { title: "VowHumans | AI Digital Workforce Platform", description: "Create a governed AI digital workforce with VowHumans Studio, Live, Present, Connect, Marketplace and Academy.", url: "/", siteName: "VowHumans", type: "website" },
  twitter: { card: "summary_large_image", title: "VowHumans", description: "AI digital employees, built for responsible commercial work." },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "VowHumans", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: "https://vowhumans.com", creator: { "@type": "Organization", name: "GoalVow" } }).replaceAll("<", "\\u003c") }} />
      </body>
    </html>
  );
}
