import { cn } from "@/lib/utils";

/** The product name. It sits at the top of the side panel, where Claude puts
 *  its own, so the main header can carry the thread title instead. */
export function AppWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("select-none font-light text-lg leading-none", className)}
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      <span className="tracking-tight">OpenSuite</span>
      <span className="font-semibold">MCP</span>
    </span>
  );
}
