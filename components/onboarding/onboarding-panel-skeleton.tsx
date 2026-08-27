import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

type OnboardingPanelSkeletonProps = {
  className?: string;
  headerClassName?: string;
  rowClassName?: string;
  rows?: number;
  showHeader?: boolean;
};

export function OnboardingPanelSkeleton({
  className,
  headerClassName = "h-4 w-40",
  rowClassName = "h-8 w-full",
  rows = 3,
  showHeader = true,
}: OnboardingPanelSkeletonProps) {
  const rowCount = Math.min(Math.max(rows, 1), ROW_KEYS.length);

  return (
    <div className={cn("space-y-3", className)}>
      {showHeader ? <Skeleton className={headerClassName} /> : null}
      {ROW_KEYS.slice(0, rowCount).map((key) => (
        <Skeleton className={rowClassName} key={key} />
      ))}
    </div>
  );
}
