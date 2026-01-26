import { LoaderIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

function Spinner({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-label="Loading"
      className={cn(
        "inline-flex size-8 animate-spin items-center justify-center",
        className
      )}
      role="status"
      {...props}
    >
      <LoaderIcon size={24} />
    </div>
  );
}

export { Spinner };
