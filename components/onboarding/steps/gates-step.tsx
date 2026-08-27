"use client";

import { type ReactNode, useState } from "react";
import { adminSetOrgPersonaEnabled } from "@/app/admin/personas/actions";
import { adminSetOrgSkillEnabled } from "@/app/admin/skills/actions";
import { ConnectedSkillsAdminSection } from "@/components/admin/connected-skills-admin-section";
import { SearchResourcesAdminSection } from "@/components/admin/search-resources-admin-section";
import {
  OnboardingCallout,
  OnboardingStepProse,
} from "@/components/onboarding/onboarding-step-prose";
import { SkillPackSyncButton } from "@/components/skill-pack-sync-button";
import { toast } from "@/components/toast";
import { Switch } from "@/components/ui/switch";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { AdminOrgSkillRow } from "@/lib/org/admin/skills";
import type { OrgConnectedSkillSourceRow } from "@/lib/org/connected-skills";
import type { OrgSearchResourceRow } from "@/lib/org/search-resources";
import { skillsPackSyncEnabled } from "@/lib/product-features";
import { cn } from "@/lib/utils";

type OnboardingGatesStepProps = {
  orgSkills: AdminOrgSkillRow[];
  orgPersonas: AdminOrgPersonaRow[];
  searchResources: OrgSearchResourceRow[];
  connectedSources: OrgConnectedSkillSourceRow[];
  onRefresh: () => Promise<void>;
};

function GatesStepSection({
  action,
  children,
  first = false,
  title,
}: {
  title: string;
  first?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("space-y-3", !first && "border-border/60 border-t pt-7")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
          {title}
        </h3>
        {action}
      </div>
      <div className="border-border/50 border-l-2 pl-3 sm:pl-4">{children}</div>
    </section>
  );
}

export function OnboardingGatesStep({
  orgSkills,
  orgPersonas,
  searchResources,
  connectedSources,
  onRefresh,
}: OnboardingGatesStepProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const oracleSkills = orgSkills.filter((skill) => skill.source === "oracle");
  const communitySkills = orgSkills.filter(
    (skill) => skill.source === "community",
  );

  const runToggle = async (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(id);
    const result = await action();
    setPendingId(null);
    if (!result.ok) {
      toast({ type: "error", description: result.error ?? "Request failed." });
      return;
    }
    toast({ type: "success", description: success });
    await onRefresh();
  };

  return (
    <div className="space-y-7">
      <OnboardingStepProse
        description="Choose what your team can use. Disabled items are hidden from users."
        title="Org policies"
        titleAccessory={
          <SkillPackSyncButton
            className="ml-auto shrink-0"
            label="Resync all"
            onSynced={onRefresh}
            pack="all"
          />
        }
      />

      <OnboardingCallout>
        Org policies apply to every user and override individual settings.
        {skillsPackSyncEnabled
          ? " If Oracle or Community lists are empty, use Resync all to pull them from GitHub."
          : null}
      </OnboardingCallout>

      <GatesStepSection
        action={
          <SkillPackSyncButton
            label="Resync"
            onSynced={onRefresh}
            pack="oracle"
          />
        }
        first
        title="Oracle skills"
      >
        {oracleSkills.length === 0 ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            No Oracle skills on disk yet.
            {skillsPackSyncEnabled
              ? " Resync to pull the pack."
              : " Contact your operator if the pack is missing."}
          </p>
        ) : (
          <ul className="space-y-2">
            {oracleSkills.map((skill) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
                key={skill.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{skill.name}</p>
                  <p className="truncate text-muted-foreground text-[11px]">
                    {skill.skillRef}
                  </p>
                </div>
                <Switch
                  checked={skill.enabled}
                  disabled={pendingId === skill.id}
                  onCheckedChange={(enabled) => {
                    void runToggle(
                      skill.id,
                      () =>
                        adminSetOrgSkillEnabled({
                          skillId: skill.id,
                          enabled,
                        }),
                      enabled ? "Skill enabled." : "Skill disabled.",
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </GatesStepSection>

      <GatesStepSection
        action={
          <SkillPackSyncButton
            label="Resync"
            onSynced={onRefresh}
            pack="community"
          />
        }
        title="Community skills"
      >
        {communitySkills.length === 0 ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            No Community skills on disk yet.
            {skillsPackSyncEnabled
              ? " Resync to pull the pack."
              : " Contact your operator if the pack is missing."}
          </p>
        ) : (
          <ul className="space-y-2">
            {communitySkills.map((skill) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
                key={skill.id}
              >
                <p className="min-w-0 truncate text-sm">{skill.name}</p>
                <Switch
                  checked={skill.enabled}
                  disabled={pendingId === skill.id}
                  onCheckedChange={(enabled) => {
                    void runToggle(
                      skill.id,
                      () =>
                        adminSetOrgSkillEnabled({
                          skillId: skill.id,
                          enabled,
                        }),
                      enabled ? "Skill enabled." : "Skill disabled.",
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </GatesStepSection>

      <GatesStepSection title="Connected skills">
        <ConnectedSkillsAdminSection
          compact
          connectedSources={connectedSources}
          onAfterChange={onRefresh}
        />
      </GatesStepSection>

      <GatesStepSection title="Personas">
        <ul className="space-y-2">
          {orgPersonas.map((persona) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
              key={persona.id}
            >
              <p className="min-w-0 truncate text-sm">{persona.name}</p>
              <Switch
                checked={persona.enabled}
                disabled={pendingId === persona.id || persona.alwaysOn}
                onCheckedChange={(enabled) => {
                  void runToggle(
                    persona.id,
                    () =>
                      adminSetOrgPersonaEnabled({
                        personaId: persona.id,
                        enabled,
                      }),
                    enabled ? "Persona enabled." : "Persona disabled.",
                  );
                }}
              />
            </li>
          ))}
        </ul>
      </GatesStepSection>

      <GatesStepSection title="Web search">
        <SearchResourcesAdminSection
          onAfterChange={onRefresh}
          resources={searchResources}
        />
      </GatesStepSection>
    </div>
  );
}
