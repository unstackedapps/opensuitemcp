"use client";

import useSWR from "swr";
import { AgentAccessPanel } from "@/components/admin/agent-access-panel";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import type { AdminAgentAccessState } from "@/lib/org/admin/agent-access";

type AgentAccessResponse = {
  state: AdminAgentAccessState;
  users: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
  }[];
};

async function fetchAgentAccess(): Promise<AgentAccessResponse> {
  const response = await fetch("/api/admin/agent-access");
  if (!response.ok) {
    throw new Error("Failed to load Agent access settings.");
  }
  return response.json();
}

/**
 * Agent access during org onboarding.
 *
 * The same controls as /admin/agent-access, rendered here rather than linked,
 * so an admin can set the policy without leaving the wizard. The step is
 * optional; skipping it leaves the feature off, which is the default.
 */
export function OnboardingAgentAccessOrgStep({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  const { data, isLoading, mutate } = useSWR(
    "onboarding-agent-access",
    fetchAgentAccess,
  );

  return (
    <div className="space-y-4">
      <OnboardingStepProse
        title="Agent access"
        description="Let members connect an external AI agent to their NetSuite workspace. The agent acts as that member. Off until you turn it on."
      />

      {isLoading || !data ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <AgentAccessPanel
          bare
          onChanged={async () => {
            await mutate();
            await onRefresh();
          }}
          state={data.state}
          users={data.users}
        />
      )}
    </div>
  );
}
