"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  adminCreateOrgCustomSkill,
  adminDeleteOrgCustomSkill,
  adminSetOrgCustomSkillEnabled,
  adminSetOrgSkillEnabled,
  adminUpdateOrgCustomSkill,
} from "@/app/admin/skills/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  ADMIN_SKILL_LIST_SCROLL_CLASS,
  AdminDeleteButton,
  AdminEditButton,
  AdminPanel,
} from "@/components/admin/admin-shell";
import { ConnectedSkillsAdminSection } from "@/components/admin/connected-skills-admin-section";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminOrgSkillRow } from "@/lib/org/admin/skills";
import type { OrgConnectedSkillSourceRow } from "@/lib/org/connected-skills";
import type { OrgCustomSkillRow } from "@/lib/org/custom-skills";
import { skillsPackSyncEnabled } from "@/lib/product-features";
import { cn } from "@/lib/utils";

type SectionId = "oracle" | "community" | "connected" | "custom";

type SkillsPanelProps = {
  section: SectionId;
  skills?: AdminOrgSkillRow[];
  customSkills?: OrgCustomSkillRow[];
  connectedSources?: OrgConnectedSkillSourceRow[];
};

export function SkillsPanel({
  section,
  skills = [],
  customSkills = [],
  connectedSources = [],
}: SkillsPanelProps) {
  const router = useRouter();
  const activeSection = section;
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshingPack, setRefreshingPack] = useState<
    "oracle" | "community" | null
  >(null);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [editingCustom, setEditingCustom] = useState<OrgCustomSkillRow | null>(
    null,
  );
  const [customName, setCustomName] = useState("");
  const [customContent, setCustomContent] = useState("");
  const customNameId = "admin-custom-skill-name";
  const customContentId = "admin-custom-skill-content";

  const oracleSkills = useMemo(
    () => skills.filter((skill) => skill.source === "oracle"),
    [skills],
  );
  const communitySkills = useMemo(
    () => skills.filter((skill) => skill.source === "community"),
    [skills],
  );

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list =
      activeSection === "oracle"
        ? oracleSkills
        : activeSection === "community"
          ? communitySkills
          : [];
    if (!q) {
      return list;
    }
    return list.filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.skillRef.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q),
    );
  }, [activeSection, communitySkills, oracleSkills, query]);

  const notify = (result: { ok: boolean; error?: string }, success: string) => {
    if (result.ok) {
      toast({ type: "success", description: success });
      router.refresh();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Request failed.",
    });
  };

  const run = async (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(id);
    const result = await action();
    setPendingId(null);
    notify(result, success);
  };

  const handleRefreshPack = async (pack: "oracle" | "community") => {
    setRefreshingPack(pack);
    try {
      const response = await fetch("/api/skills/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to refresh skills",
        );
      }
      toast({
        type: "success",
        description:
          pack === "oracle"
            ? "Oracle skills refreshed."
            : "Community skills refreshed.",
      });
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to refresh skills",
      });
    } finally {
      setRefreshingPack(null);
    }
  };

  const openCustomEditor = (skill?: OrgCustomSkillRow) => {
    setEditingCustom(skill ?? null);
    setCustomName(skill?.name ?? "");
    setCustomContent(skill?.content ?? "");
    setCustomEditorOpen(true);
  };

  const saveCustomSkill = async () => {
    const name = customName.trim();
    const content = customContent.trim();
    if (!name || !content) {
      toast({ type: "error", description: "Name and content are required." });
      return;
    }

    const id = editingCustom?.id ?? "new";
    setPendingId(id);
    const result = editingCustom
      ? await adminUpdateOrgCustomSkill({
          customSkillId: editingCustom.id,
          name,
          content,
        })
      : await adminCreateOrgCustomSkill({ name, content });
    setPendingId(null);

    if (result.ok) {
      toast({
        type: "success",
        description: editingCustom
          ? "Custom skill updated."
          : "Custom skill added.",
      });
      setCustomEditorOpen(false);
      setEditingCustom(null);
      router.refresh();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Request failed.",
    });
  };

  return (
    <AdminPanel
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      fillViewport
    >
      {activeSection === "oracle" || activeSection === "community" ? (
        <>
          <Input
            className={cn(ADMIN_SELECT_TRIGGER_CLASS, "max-w-md shrink-0")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills…"
            value={query}
          />
          <ul className={ADMIN_SKILL_LIST_SCROLL_CLASS}>
            {filteredCatalog.map((skill) => {
              const busy = pendingId === skill.id;
              return (
                <li
                  className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
                  key={skill.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{skill.name}</p>
                    <p className="line-clamp-2 text-muted-foreground text-xs">
                      {skill.description || skill.skillRef}
                    </p>
                    {skill.alwaysOn ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Always on for MCP
                      </p>
                    ) : null}
                  </div>
                  <Button
                    className={ADMIN_CONTROL_CLASS}
                    disabled={busy || skill.alwaysOn}
                    onClick={() =>
                      run(
                        skill.id,
                        () =>
                          adminSetOrgSkillEnabled({
                            skillId: skill.id,
                            enabled: !skill.enabled,
                          }),
                        skill.enabled ? "Skill disabled." : "Skill enabled.",
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    {skill.enabled ? "Disable" : "Enable"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {skillsPackSyncEnabled ? (
            <Button
              className={cn(ADMIN_CONTROL_CLASS, "shrink-0")}
              disabled={refreshingPack !== null}
              onClick={() => void handleRefreshPack(activeSection)}
              type="button"
              variant="outline"
            >
              {refreshingPack === activeSection ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Refresh
            </Button>
          ) : null}
        </>
      ) : null}

      {activeSection === "connected" ? (
        <ConnectedSkillsAdminSection connectedSources={connectedSources} />
      ) : null}

      {activeSection === "custom" ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => openCustomEditor()}
              type="button"
              variant="outline"
            >
              <Plus className="mr-1 size-3.5" />
              Add org custom skill
            </Button>
          </div>
          <ul className={ADMIN_SKILL_LIST_SCROLL_CLASS}>
            {customSkills.map((skill) => {
              const busy = pendingId === skill.id;
              return (
                <li
                  className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
                  key={skill.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{skill.name}</p>
                    <p className="text-muted-foreground text-xs">Org custom</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminEditButton
                      disabled={busy}
                      label={`Edit ${skill.name}`}
                      onClick={() => openCustomEditor(skill)}
                    />
                    <Button
                      className={ADMIN_CONTROL_CLASS}
                      disabled={busy}
                      onClick={() =>
                        run(
                          skill.id,
                          () =>
                            adminSetOrgCustomSkillEnabled({
                              customSkillId: skill.id,
                              enabled: !skill.enabled,
                            }),
                          skill.enabled ? "Skill disabled." : "Skill enabled.",
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {skill.enabled ? "Disable" : "Enable"}
                    </Button>
                    <AdminDeleteButton
                      description="This permanently deletes the org custom skill."
                      disabled={busy}
                      label="Delete custom skill"
                      onConfirm={() =>
                        run(
                          skill.id,
                          () =>
                            adminDeleteOrgCustomSkill({
                              customSkillId: skill.id,
                            }),
                          "Custom skill removed.",
                        )
                      }
                      title={`Delete ${skill.name}?`}
                    />
                  </div>
                </li>
              );
            })}
            {customSkills.length === 0 ? (
              <li className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-muted-foreground text-sm">
                    No custom skills yet
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Add org-wide instructions your team can use in chat.
                  </p>
                </div>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}

      <Dialog onOpenChange={setCustomEditorOpen} open={customEditorOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="text-base">
              {editingCustom ? "Edit org custom skill" : "New org custom skill"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={customNameId}>
                Name
              </Label>
              <Input
                className={ADMIN_SELECT_TRIGGER_CLASS}
                id={customNameId}
                onChange={(event) => setCustomName(event.target.value)}
                value={customName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={customContentId}>
                Content
              </Label>
              <Textarea
                className="min-h-64 resize-y text-sm md:min-h-80"
                id={customContentId}
                onChange={(event) => setCustomContent(event.target.value)}
                rows={14}
                value={customContent}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => setCustomEditorOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={pendingId !== null}
              onClick={() => void saveCustomSkill()}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPanel>
  );
}
