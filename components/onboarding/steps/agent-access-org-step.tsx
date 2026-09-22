"use client";

import useSWR from "swr";
import { AgentAccessPanel } from "@/components/admin/agent-access-panel";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import type { AdminAgentAccessState } from "@/lib/org/admin/agent-access";

type AgentAccessResponse = {
  serverEnabled: boolean;
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
export function OnboardingAgentAccessOrgStep() {
  const { data, isLoading, mutate } = useSWR(
    "onboarding-agent-access",
    fetchAgentAccess,
  );

  return (
    <div className="space-y-4">
      <OnboardingStepProse
        title="Agent access"
        description="Members can connect an external AI agent to their own NetSuite workspace over MCP. The agent acts as that member, with their permissions and their tool policy. Off until you turn it on, and you can change this later in the admin area."
      />

      {isLoading || !data ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          {data.serverEnabled ? null : (
            <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
              This install does not have the MCP server switched on, so these
              settings will not take effect until an operator sets
              OSMCP_MCP_SERVER_ENABLED=true and restarts.
            </p>
          )}
          <AgentAccessPanel
            bare
            onChanged={() => mutate()}
            state={data.state}
            users={data.users}
          />
        </>
      )}
    </div>
  );
}
