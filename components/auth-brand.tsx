import { OpenSuiteMCPLogo } from "@/components/icons";
import { cn } from "@/lib/utils";

const AUTH_BRAND_SIZE_CLASS = {
  default:
    "gap-[0.1em] text-2xl tracking-tight md:text-[1.75rem] [&_svg]:size-[1.22em]!",
  lg: "gap-[0.1em] text-4xl tracking-tight sm:text-5xl [&_svg]:size-[1.2em]!",
} as const;

export function AuthBrand({
  className,
  size = "default",
}: {
  className?: string;
  size?: keyof typeof AUTH_BRAND_SIZE_CLASS;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        AUTH_BRAND_SIZE_CLASS[size],
        className,
      )}
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      <OpenSuiteMCPLogo size={size === "lg" ? 48 : 28} />
      <span>
        <span className="font-light">OpenSuite</span>
        <span className="font-semibold">MCP</span>
      </span>
    </div>
  );
}
