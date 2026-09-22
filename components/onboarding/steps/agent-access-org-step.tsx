"use client";

import Link from "next/link";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { Button } from "@/components/ui/button";

/**
 * Agent access during org onboarding.
 *
 * The admin is configuring the organization, not minting their own key, so
 * this points at the admin panel rather than embedding the member-facing one.
 */
export function OnboardingAgentAccessOrgStep() {
  return (
    <div className="space-y-4">
      <OnboardingStepProse
        title="Agent access"
        description="Members can connect an external AI agent to their own NetSuite workspace over MCP. The agent acts as that member, with their permissions and their tool policy. Off until you turn it on, and you can come back to this later."
      />
      <Button asChild size="sm" variant="outline">
        <Link href="/admin/agent-access">Open Agent access settings</Link>
      </Button>
    </div>
  );
}
