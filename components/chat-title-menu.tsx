"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import useSWRInfinite, { unstable_serialize } from "swr/infinite";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/sidebar-history";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { cn, fetcher } from "@/lib/utils";
import {
  CheckCircleFillIcon,
  ChevronDownIcon,
  GlobeIcon,
  LockIcon,
  PencilEditIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
import type { VisibilityType } from "./visibility-selector";

/** Shown until the turn that names the chat has run. Matches the sidebar row. */
const PLACEHOLDER_TITLE = "New chat";

export function ChatTitleMenu({
  chatId,
  isReadonly,
  selectedVisibilityType,
}: {
  chatId: string;
  isReadonly: boolean;
  selectedVisibilityType: VisibilityType;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId,
    initialVisibilityType: selectedVisibilityType,
  });

  // The sidebar already holds every title, and SWR dedupes the key, so this
  // reads the same cache entry rather than asking for the chat again. It also
  // means a rename and the optimistic "New chat" row land here at once.
  const { data: pages } = useSWRInfinite<ChatHistory>(
    getChatHistoryPaginationKey,
    fetcher,
  );

  const title = useMemo(() => {
    for (const page of pages ?? []) {
      const found = page.chats.find((chat) => chat.id === chatId);
      if (found) {
        return found.title;
      }
    }
    return null;
  }, [pages, chatId]);

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const shown = title ?? PLACEHOLDER_TITLE;

  if (isReadonly) {
    return (
      <span className="min-w-0 max-w-[22rem] truncate text-foreground text-sm">
        {shown}
      </span>
    );
  }

  const submitRename = async () => {
    const next = renameValue?.trim();
    if (!next) {
      return;
    }
    setRenameValue(null);

    const response = await fetch(`/api/chat/${chatId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });

    if (!response.ok) {
      toast.error("Failed to rename chat");
      return;
    }

    await mutate(unstable_serialize(getChatHistoryPaginationKey));
  };

  const runDelete = async () => {
    setShowDelete(false);

    const response = await fetch(`/api/chat?id=${chatId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Failed to delete chat");
      return;
    }

    await mutate(unstable_serialize(getChatHistoryPaginationKey));
    // The router may still believe it is on "/", where a push does nothing.
    window.history.replaceState({}, "", "/");
    router.refresh();
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group/chat-title flex min-w-0 max-w-[22rem] items-center gap-1 rounded-md px-1 py-0.5",
              "text-foreground/80 text-sm transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            title={shown}
            type="button"
          >
            <span className="min-w-0 truncate">{shown}</span>
            <span className="shrink-0 text-foreground/40 transition-colors group-hover/chat-title:text-foreground">
              <ChevronDownIcon size={14} />
            </span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-48" side="bottom">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setRenameValue(shown)}
          >
            <PencilEditIcon size={14} />
            <span>Rename</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ShareIcon size={14} />
              <span>Share chat</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="flex-row justify-between gap-4 cursor-pointer"
                  onSelect={() => setVisibilityType("private")}
                >
                  <div className="flex flex-row items-center gap-2">
                    <LockIcon size={12} />
                    <span>Private</span>
                  </div>
                  {visibilityType === "private" ? (
                    <CheckCircleFillIcon />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex-row justify-between gap-4 cursor-pointer"
                  onSelect={() => setVisibilityType("public")}
                >
                  <div className="flex flex-row items-center gap-2">
                    <GlobeIcon size={12} />
                    <span>Public</span>
                  </div>
                  {visibilityType === "public" ? <CheckCircleFillIcon /> : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
            onSelect={() => setShowDelete(true)}
          >
            <TrashIcon size={14} />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameValue(null);
          }
        }}
        open={renameValue !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename chat</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }
            }}
            value={renameValue ?? ""}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void submitRename();
              }}
            >
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setShowDelete} open={showDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{shown}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void runDelete();
              }}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
