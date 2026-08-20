import Image from "next/image";
import { BadgeCheck, Sparkles } from "lucide-react";

export type EditorialVisualVariant =
  | "enterprise"
  | "experience"
  | "governance"
  | "learning"
  | "workforce";

type EditorialVisualProps = {
  variant: EditorialVisualVariant;
  priority?: boolean;
  className?: string;
  sizes?: string;
  decorative?: boolean;
};

const visuals = {
  enterprise: {
    src: "/editorial/enterprise-collaboration.webp",
    alt: "South African enterprise team collaborating with a disclosed digital colleague on screen",
    label: "Human + AI collaboration",
    detail: "Conceptual visual",
  },
  experience: {
    src: "/editorial/customer-experience.webp",
    alt: "Customer receiving guidance from a disclosed digital assistant with human support nearby",
    label: "AI guidance · human escalation",
    detail: "Conceptual visual",
  },
  governance: {
    src: "/editorial/governed-identity.webp",
    alt: "Abstract glass human profile surrounded by layered identity and consent controls",
    label: "Consent · provenance · control",
    detail: "Conceptual visual",
  },
  learning: {
    src: "/editorial/digital-learning.webp",
    alt: "South African professional learning with a disclosed digital tutor on screen",
    label: "Approved knowledge · human accountability",
    detail: "Conceptual visual",
  },
  workforce: {
    src: "/editorial/connected-workforce.webp",
    alt: "Connected digital workforce represented as governed identity, knowledge and workflow nodes",
    label: "One governed workforce",
    detail: "Conceptual visual",
  },
} as const;

export function EditorialVisual({
  variant,
  priority = false,
  className = "",
  sizes = "(max-width: 860px) 100vw, 46vw",
  decorative = false,
}: EditorialVisualProps) {
  const visual = visuals[variant];

  return (
    <figure className={`editorial-visual editorial-${variant} ${className}`.trim()} aria-hidden={decorative || undefined}>
      <Image src={visual.src} alt={decorative ? "" : visual.alt} fill priority={priority} sizes={sizes} />
      <span className="editorial-visual-scrim" aria-hidden="true" />
      <figcaption>
        <span><Sparkles size={13} /> AI-generated editorial visual</span>
        <strong>{visual.label}</strong>
        <small><BadgeCheck size={12} /> {visual.detail}</small>
      </figcaption>
    </figure>
  );
}
