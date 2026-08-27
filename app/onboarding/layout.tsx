import { AuthBrand } from "@/components/auth-brand";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="shrink-0 border-border/60 border-b px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-352 items-center justify-between gap-3">
          <AuthBrand className="justify-start" />
          <p className="text-muted-foreground text-xs">Setup wizard</p>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-352 flex-1 flex-col px-4 py-4 md:px-6 md:py-6">
        {children}
      </main>
    </div>
  );
}
