import Image from "next/image";

type BrandLogoProps = {
  variant?: "lockup" | "mark";
  priority?: boolean;
  className?: string;
};

const assets = {
  lockup: { src: "/brand/vowhumans-horizontal-lockup.png", width: 1394, height: 386 },
  mark: { src: "/brand/vowhumans-mark.png", width: 550, height: 457 },
} as const;

export function BrandLogo({ variant = "lockup", priority = false, className = "" }: BrandLogoProps) {
  const asset = assets[variant];

  return (
    <span className={`brand-logo brand-logo-${variant} ${className}`.trim()} aria-hidden="true">
      <Image
        src={asset.src}
        alt=""
        width={asset.width}
        height={asset.height}
        priority={priority}
        sizes={variant === "lockup" ? "(max-width: 640px) 174px, 220px" : "72px"}
      />
    </span>
  );
}
