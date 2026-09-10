"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "next-auth";
import { type CSSProperties, useMemo, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { clientPersonaShortNameWithCustoms } from "@/lib/ai/personas/ids";
import type { Chat } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";
import { toast } from "./toast";

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const PAGE_SIZE = 20;
const HISTORY_SKELETON_WIDTHS = [44, 32, 28, 64, 52] as const;

type PersonasPayload = {
  personas?: Array<{ id: string; name?: string; shortName?: string }>;
};

function chatMatchesQuery(
  chat: Chat,
  query: string,
  customs: Array<{ id: string; shortName?: string; name?: string }>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const persona = clientPersonaShortNameWithCustoms(chat.personaId, customs);
  return (
    chat.title.toLowerCase().includes(q) ||
    (chat.summary ?? "").toLowerCase().includes(q) ||
    persona.toLowerCase().includes(q)
  );
}

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats,
  );
};

function ChatDayGroup({
  label,
  chats,
  activeChatId,
  onDelete,
  personaCustoms,
  setOpenMobile,
  tone = "sidebar",
}: {
  label: string;
  chats: Chat[];
  activeChatId: string | undefined;
  onDelete: (chatId: string) => void;
  personaCustoms: Array<{ id: string; shortName?: string; name?: string }>;
  setOpenMobile: (open: boolean) => void;
  tone?: "sidebar" | "panel";
}) {
  if (chats.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {chats.map((chat) => (
          <ChatItem
            chat={chat}
            isActive={chat.id === activeChatId}
            key={chat.id}
            onDelete={onDelete}
            personaCustoms={personaCustoms}
            setOpenMobile={setOpenMobile}
            tone={tone}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarHistorySkeleton() {
  return (
    <SidebarGroup>
      <div className="sticky top-0 z-10 bg-sidebar pb-2">
        <Skeleton
          aria-hidden
          className="h-8 w-full bg-sidebar-accent-foreground/10"
        />
      </div>
      <div className="px-2 py-1">
        <Skeleton
          aria-hidden
          className="h-3 w-12 bg-sidebar-accent-foreground/10"
        />
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col">
          {HISTORY_SKELETON_WIDTHS.map((item) => (
            <div
              className="flex h-8 items-center gap-2 rounded-md px-2"
              key={item}
            >
              <Skeleton
                aria-hidden
                className="h-4 max-w-(--skeleton-width) flex-1 bg-sidebar-accent-foreground/10"
                style={
                  {
                    "--skeleton-width": `${item}%`,
                  } as CSSProperties
                }
              />
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory,
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) {
    return `/api/history?limit=${PAGE_SIZE}`;
  }

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) {
    return null;
  }

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory({
  user,
  variant = "sidebar",
}: {
  user: User | undefined;
  variant?: "sidebar" | "panel";
}) {
  const { setOpenMobile, revealText } = useSidebar();
  const { id } = useParams();

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [query, setQuery] = useState("");
  const { data: personasPayload } = useSWR<PersonasPayload>(
    user ? "/api/personas" : null,
    fetcher,
  );
  const personaCustoms = useMemo(
    () =>
      (personasPayload?.personas ?? []).map((persona) => ({
        id: persona.id,
        shortName: persona.shortName,
        name: persona.name,
      })),
    [personasPayload],
  );

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  const requestDeleteChat = (chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  };

  const handleDelete = () => {
    const deletePromise = fetch(`/api/chat?id=${deleteId}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter((chat) => chat.id !== deleteId),
            }));
          }
        });

        return "Chat deleted successfully";
      },
      error: "Failed to delete chat",
    });

    setShowDeleteDialog(false);

    if (deleteId === id) {
      router.push("/");
    }
  };

  if (!revealText) {
    return <SidebarHistorySkeleton />;
  }

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return <SidebarHistorySkeleton />;
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Your conversations will appear here once you start chatting!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <div
            className={cn(
              "sticky top-0 z-10 pb-2",
              variant === "panel" ? "bg-background" : "bg-sidebar",
            )}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput
                aria-label="Search chats and personas"
                className={cn(
                  "h-8 pl-7 text-sm focus-visible:ring-0 md:h-8 md:px-2.5 md:pl-7",
                  variant === "panel" &&
                    "border-border/50 bg-muted/40 shadow-none focus-visible:border-border",
                )}
                data-testid="sidebar-history-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chats and personas"
                value={query}
              />
            </div>
          </div>
          <SidebarMenu>
            {paginatedChatHistories &&
              (() => {
                const chatsFromHistory = paginatedChatHistories
                  .flatMap((paginatedChatHistory) => paginatedChatHistory.chats)
                  .filter((chat) =>
                    chatMatchesQuery(chat, query, personaCustoms),
                  );

                if (chatsFromHistory.length === 0) {
                  return (
                    <div className="px-2 py-6 text-center text-sm text-zinc-500">
                      No chats or personas match.
                    </div>
                  );
                }

                const groupedChats = groupChatsByDate(chatsFromHistory);
                const activeChatId = typeof id === "string" ? id : undefined;

                return (
                  <div className="flex flex-col gap-6">
                    <ChatDayGroup
                      activeChatId={activeChatId}
                      chats={groupedChats.today}
                      label="Today"
                      onDelete={requestDeleteChat}
                      personaCustoms={personaCustoms}
                      setOpenMobile={setOpenMobile}
                      tone={variant}
                    />
                    <ChatDayGroup
                      activeChatId={activeChatId}
                      chats={groupedChats.yesterday}
                      label="Yesterday"
                      onDelete={requestDeleteChat}
                      personaCustoms={personaCustoms}
                      setOpenMobile={setOpenMobile}
                      tone={variant}
                    />
                    <ChatDayGroup
                      activeChatId={activeChatId}
                      chats={groupedChats.lastWeek}
                      label="Last 7 days"
                      onDelete={requestDeleteChat}
                      personaCustoms={personaCustoms}
                      setOpenMobile={setOpenMobile}
                      tone={variant}
                    />
                    <ChatDayGroup
                      activeChatId={activeChatId}
                      chats={groupedChats.lastMonth}
                      label="Last 30 days"
                      onDelete={requestDeleteChat}
                      personaCustoms={personaCustoms}
                      setOpenMobile={setOpenMobile}
                      tone={variant}
                    />
                    <ChatDayGroup
                      activeChatId={activeChatId}
                      chats={groupedChats.older}
                      label="Older than last month"
                      onDelete={requestDeleteChat}
                      personaCustoms={personaCustoms}
                      setOpenMobile={setOpenMobile}
                      tone={variant}
                    />
                  </div>
                );
              })()}
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!isValidating && !hasReachedEnd) {
                setSize((size) => size + 1);
              }
            }}
          />

          {isValidating && !hasReachedEnd ? (
            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>Loading Chats...</div>
            </div>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
