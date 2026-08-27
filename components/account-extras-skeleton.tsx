import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";

type AccountExtrasSkeletonProps = {
  showPasswordSection?: boolean;
};

export function AccountExtrasSkeleton({
  showPasswordSection = true,
}: AccountExtrasSkeletonProps) {
  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <OnboardingPanelSkeleton
        headerClassName="h-3.5 w-24"
        rowClassName="h-9 w-full"
        rows={2}
        showHeader
      />
      {showPasswordSection ? (
        <OnboardingPanelSkeleton
          headerClassName="h-3.5 w-28"
          rowClassName="h-8 w-full"
          rows={3}
          showHeader
        />
      ) : null}
    </div>
  );
}
