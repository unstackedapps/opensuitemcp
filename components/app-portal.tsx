"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { PersonasPanel } from "@/components/personas-panel";
import {
  PORTAL_NAV,
  type PortalSectionId,
  useAppPortal,
} from "@/components/portal/context";
import { PromptLibraryPanel } from "@/components/prompt-library-dialog";
import {
  SettingsPanel,
  type SettingsPanelSection,
} from "@/components/settings-modal";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/sidebar-history";
import { SkillsPanel } from "@/components/skills-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "./toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const SETTINGS_SECTIONS = new Set<PortalSectionId>([
  "provider",
  "netsuite",
  "search",
  "timezone",
  "account",
]);

const NAV_GROUPS = [
  "Workspace",
  "Customize",
  "Settings",
  "Preferences",
] as const;

function isSettingsSection(
  section: PortalSectionId,
): section is SettingsPanelSection {
  return SETTINGS_SECTIONS.has(section);
}

export function AppPortal({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { open, section, openPortal, closePortal, setSection, onSelectPrompt } =
    useAppPortal();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const visibleNav = PORTAL_NAV.filter((item) => {
    if (item.id === "account" && !user) {
      return false;
    }
    return true;
  });

  const handleDeleteAll = () => {
    const deletePromise = fetch("/api/history", {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        router.push("/");
        setShowDeleteAllDialog(false);
        closePortal();
        return "All chats deleted successfully";
      },
      error: "Failed to delete all chats",
    });
  };

  return (
    <>
      <Dialog
        onOpenChange={(next) => {
          if (next) {
            openPortal(section);
          } else {
            closePortal();
          }
        }}
        open={open}
      >
        <DialogContent
          className="flex h-[min(85vh,42rem)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          data-testid="app-portal"
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>App Portal</DialogTitle>
            <DialogDescription>
              Chats, skills, prompts, and settings
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav className="hidden w-52 shrink-0 flex-col gap-5 border-border/60 border-r bg-muted/20 px-3 py-4 sm:flex">
              <p className="px-2 font-medium text-sm">OpenSuiteMCP</p>
              {NAV_GROUPS.map((group) => {
                const items = visibleNav.filter((item) => item.group === group);
                if (items.length === 0) {
                  return null;
                }
                return (
                  <div className="space-y-1" key={group}>
                    <p className="px-2 text-[11px] text-muted-foreground uppercase tracking-wide">
                      {group}
                    </p>
                    {items.map((item) => (
                      <button
                        className={cn(
                          "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          section === item.id
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                        data-testid={`portal-nav-${item.id}`}
                        key={item.id}
                        onClick={() => setSection(item.id)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex gap-1.5 overflow-x-auto border-border/60 border-b px-4 py-3 sm:hidden">
                {visibleNav.map((item) => (
                  <button
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      section === item.id
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {section === "chats" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-1.5 font-medium text-sm">
                        <MessageSquare className="size-3.5 text-muted-foreground" />
                        Chats
                      </p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Open a conversation or clear history.
                      </p>
                    </div>
                    {user ? (
                      <button
                        className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
                        onClick={() => setShowDeleteAllDialog(true)}
                        type="button"
                      >
                        <Trash2 className="size-3" />
                        <span className="sr-only sm:not-sr-only">
                          Delete all
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <SidebarHistory user={user} />
                  </div>
                </div>
              ) : null}

              {section === "skills" ? (
                <SkillsPanel active={open && section === "skills"} />
              ) : null}

              {section === "personas" ? (
                <PersonasPanel active={open && section === "personas"} />
              ) : null}

              {section === "prompts" ? (
                <PromptLibraryPanel
                  active={open && section === "prompts"}
                  onRequestClose={closePortal}
                  onSelectPrompt={(promptText, promptName) => {
                    onSelectPrompt?.(promptText, promptName);
                  }}
                />
              ) : null}

              {isSettingsSection(section) ? (
                <SettingsPanel
                  active={open && isSettingsSection(section)}
                  section={section}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
