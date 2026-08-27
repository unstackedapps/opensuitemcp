import { redirectIfNeedsOrgSetup } from "@/lib/org/setup";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfNeedsOrgSetup();
  return children;
}
