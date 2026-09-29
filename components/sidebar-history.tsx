"use client";

import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "next-auth";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useAppPortal } from "@/components/portal/context";
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
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { clientPersonaShortNameWithCustoms } from "@/lib/ai/personas/ids";
import type { ChatWithActivity } from "@/lib/chat-status";
import type { ChatGroup } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";
import {
  ChevronDownIcon,
  MoreVerticalIcon,
  PencilEditIcon,
  PlusIcon,
  SlidersIcon,
  TrashIcon,
} from "./icons";
import {
  CHAT_DRAG_TYPE,
  ChatItem,
  GROUP_DRAG_TYPE,
} from "./sidebar-history-item";
import { toast } from "./toast";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type ChatHistory = {
  chats: ChatWithActivity[];
  hasMore: boolean;
};

type ChatGroupsPayload = { groups?: ChatGroup[] };

type SortKey = "activity" | "title";

const PAGE_SIZE = 20;
const HISTORY_SKELETON_WIDTHS = [44, 32, 28, 64, 52] as const;
const GROUPS_KEY = "/api/chat-groups";
const UNGROUPED_COLLAPSED_KEY = "sidebar:ungrouped-collapsed";

type PersonasPayload = {
  personas?: Array<{ id: string; name?: string; shortName?: string }>;
};

type PersonaRef = { id: string; shortName?: string; name?: string };

function chatMatchesQuery(
  chat: ChatWithActivity,
  query: string,
  customs: PersonaRef[],
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

function sortChats(
  chats: ChatWithActivity[],
  sort: SortKey,
): ChatWithActivity[] {
  if (sort === "title") {
    return [...chats].sort((a, b) => a.title.localeCompare(b.title));
  }
  // The server already returns them newest-activity first.
  return chats;
}

function ChatGroupSection({
  activeChatId,
  chats,
  collapsed,
  draggingChatId,
  dropActive,
  filtering,
  group,
  onDragChatEnd,
  onDragChatStart,
  onDropChat,
  onDropGroupBefore,
  onGroupDragEnd,
  onGroupDragStart,
  onHoverTarget,
  onNudgeGroup,
  tools,
  canNudgeUp,
  canNudgeDown,
  groups,
  onDelete,
  onDeleteGroup,
  onMoveToGroup,
  onNewChatInGroup,
  onNewGroupWith,
  onRename,
  onRenameGroup,
  onToggle,
  personaCustoms,
  setOpenMobile,
  showHeader,
  tone,
}: {
  activeChatId: string | undefined;
  chats: ChatWithActivity[];
  collapsed: boolean;
  draggingChatId: string | null;
  dropActive: boolean;
  filtering: boolean;
  group: ChatGroup | null;
  onDragChatEnd: () => void;
  onDragChatStart: (chatId: string) => void;
  onDropChat: (groupId: string | null) => void;
  onDropGroupBefore: (targetId: string) => void;
  onGroupDragEnd: () => void;
  onGroupDragStart: (groupId: string) => void;
  onHoverTarget: (key: string | null) => void;
  tools?: ReactNode;
  onNudgeGroup: (groupId: string, delta: number) => void;
  canNudgeUp: boolean;
  canNudgeDown: boolean;
  groups: ChatGroup[];
  onDelete: (chatId: string) => void;
  onDeleteGroup: (group: ChatGroup) => void;
  onMoveToGroup: (chatId: string, groupId: string | null) => void;
  onNewChatInGroup: (groupId: string | null) => void;
  onNewGroupWith: (chatId: string) => void;
  onRename: (chatId: string) => void;
  onRenameGroup: (group: ChatGroup) => void;
  onToggle: () => void;
  personaCustoms: PersonaRef[];
  setOpenMobile: (open: boolean) => void;
  showHeader: boolean;
  tone: "sidebar" | "panel";
}) {
  // An empty group you made still shows, because you need its + to fill it.
  // A group with no matches under a search or filter is just a stranded
  // heading, so it goes.
  if (chats.length === 0 && (group === null || filtering)) {
    return null;
  }

  const targetKey = group?.id ?? "ungrouped";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone; the row menu's Move to group is the keyboard path
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop zone; the row menu's Move to group is the keyboard path
    <div
      className={cn(
        "rounded-md",
        dropActive && "bg-sidebar-accent/60 ring-1 ring-sidebar-border",
      )}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          onHoverTarget(null);
        }
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CHAT_DRAG_TYPE)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onHoverTarget(targetKey);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(CHAT_DRAG_TYPE)) {
          return;
        }
        event.preventDefault();
        onHoverTarget(null);
        onDropChat(group?.id ?? null);
      }}
    >
      {showHeader ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: drag handle; Move up and Move down are the keyboard path
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag handle; Move up and Move down are the keyboard path
        <div
          className="group/group-header flex h-6 items-center gap-1 pr-1 pl-2"
          draggable={group !== null}
          onDragEnd={onGroupDragEnd}
          onDragOver={(event) => {
            if (
              !(group && event.dataTransfer.types.includes(GROUP_DRAG_TYPE))
            ) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragStart={(event) => {
            if (!group) {
              return;
            }
            event.stopPropagation();
            event.dataTransfer.setData(GROUP_DRAG_TYPE, group.id);
            event.dataTransfer.setData("text/plain", group.name);
            event.dataTransfer.effectAllowed = "move";
            onGroupDragStart(group.id);
          }}
          onDrop={(event) => {
            if (
              !(group && event.dataTransfer.types.includes(GROUP_DRAG_TYPE))
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onDropGroupBefore(group.id);
          }}
        >
          {/* Nothing sits left of the name, so every group title starts on the
              same edge as nothing else in the list. */}
          <span className="min-w-0 flex-1 truncate text-[11px] text-sidebar-foreground/50">
            {group ? group.name : "Ungrouped"}
          </span>

          <button
            aria-expanded={!collapsed}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-black/10 hover:text-sidebar-foreground",
              "opacity-0 focus-visible:opacity-100 group-hover/group-header:opacity-100",
              collapsed && "opacity-100",
            )}
            onClick={onToggle}
            type="button"
          >
            <span
              className={cn("transition-transform", collapsed && "-rotate-90")}
            >
              <ChevronDownIcon size={12} />
            </span>
            <span className="sr-only">
              {collapsed ? "Expand" : "Collapse"}{" "}
              {group ? group.name : "Ungrouped"}
            </span>
          </button>

          <button
            className="flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-black/10 hover:text-sidebar-foreground"
            onClick={() => onNewChatInGroup(group?.id ?? null)}
            title={group ? `New chat in ${group.name}` : "New chat"}
            type="button"
          >
            <PlusIcon size={13} />
            <span className="sr-only">
              {group ? `New chat in ${group.name}` : "New chat"}
            </span>
          </button>

          {tools}

          {group ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 opacity-0 hover:bg-black/10 hover:text-sidebar-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover/group-header:opacity-100"
                  type="button"
                >
                  <MoreVerticalIcon size={13} />
                  <span className="sr-only">{group.name} options</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => onRenameGroup(group)}
                >
                  <PencilEditIcon size={14} />
                  <span>Rename group</span>
                </DropdownMenuItem>
                {/* The keyboard path to the order that dragging a header
                      gives a pointer. */}
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={!canNudgeUp}
                  onSelect={() => onNudgeGroup(group.id, -1)}
                >
                  <span>Move up</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={!canNudgeDown}
                  onSelect={() => onNudgeGroup(group.id, 1)}
                >
                  <span>Move down</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
                  onSelect={() => onDeleteGroup(group)}
                >
                  <TrashIcon size={14} />
                  <span>Delete group</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      {collapsed ? null : (
        <div className="flex flex-col gap-0.5">
          {chats.map((chat) => (
            <ChatItem
              chat={chat}
              dragging={draggingChatId === chat.id}
              groups={groups}
              isActive={chat.id === activeChatId}
              key={chat.id}
              onDragChatEnd={onDragChatEnd}
              onDragChatStart={onDragChatStart}
              onDelete={onDelete}
              onMoveToGroup={onMoveToGroup}
              onNewGroupWith={onNewGroupWith}
              onRename={onRename}
              personaCustoms={personaCustoms}
              setOpenMobile={setOpenMobile}
              tone={tone}
            />
          ))}
        </div>
      )}
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
  const { openPortal } = useAppPortal();
  const { id } = useParams();

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
    // A turn creates its Stream row and clears it at the end, and nothing in
    // the sidebar asked again in between — so a chat never rendered as
    // working, least of all one an agent is driving in another thread. SWR
    // skips hidden tabs, so a background window costs nothing.
    refreshInterval: 10_000,
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [personaFilter, setPersonaFilter] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    kind: "chat" | "group";
    id: string;
    value: string;
  } | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<ChatGroup | null>(null);
  const [pendingGroupChatId, setPendingGroupChatId] = useState<string | null>(
    null,
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [ungroupedCollapsed, setUngroupedCollapsedState] = useState(false);
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    try {
      setUngroupedCollapsedState(
        window.localStorage.getItem(UNGROUPED_COLLAPSED_KEY) === "1",
      );
    } catch {
      // Private windows and blocked site data both throw. Expanded is correct.
    }
  }, []);

  const toggleUngrouped = useCallback(() => {
    setUngroupedCollapsedState((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(UNGROUPED_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // The state simply does not persist.
      }
      return next;
    });
  }, []);

  const { data: personasPayload } = useSWR<PersonasPayload>(
    user ? "/api/personas" : null,
    fetcher,
  );
  const { data: groupsPayload, mutate: mutateGroups } =
    useSWR<ChatGroupsPayload>(user ? GROUPS_KEY : null, fetcher);

  const groups = useMemo(() => groupsPayload?.groups ?? [], [groupsPayload]);

  const personaCustoms = useMemo(
    () =>
      (personasPayload?.personas ?? []).map((persona) => ({
        id: persona.id,
        shortName: persona.shortName,
        name: persona.name,
      })),
    [personasPayload],
  );

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  const allChats = useMemo(
    () =>
      (paginatedChatHistories ?? []).flatMap(
        (paginatedChatHistory) => paginatedChatHistory.chats,
      ),
    [paginatedChatHistories],
  );

  // Only personas that actually appear in the loaded chats are offered, so the
  // filter never lists something that would return nothing.
  const personaOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const chat of allChats) {
      labels.add(
        clientPersonaShortNameWithCustoms(chat.personaId, personaCustoms),
      );
    }
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [allChats, personaCustoms]);

  const requestDeleteChat = (chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  };

  const handleDelete = () => {
    const target = deleteId;
    setShowDeleteDialog(false);

    // fetch resolves on 403 and 404 as readily as on 200, so the old code ran
    // its success branch either way: the row vanished, the toast claimed the
    // chat was deleted, and the next revalidation put it back.
    const runDelete = async () => {
      const response = await fetch(`/api/chat?id=${target}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let message = "Failed to delete chat";
        try {
          const body = (await response.json()) as { message?: string };
          message = body?.message ?? message;
        } catch {
          // A body that is not JSON tells us nothing more than the status did.
        }
        throw new Error(message);
      }

      await mutate(
        (chatHistories) =>
          chatHistories?.map((chatHistory) => ({
            ...chatHistory,
            chats: chatHistory.chats.filter((chat) => chat.id !== target),
          })),
        { revalidate: false },
      );

      if (target === id) {
        router.push("/");
      }
    };

    toast.promise(runDelete(), {
      loading: "Deleting chat...",
      success: () => "Chat deleted",
      error: (error: unknown) =>
        error instanceof Error ? error.message : "Failed to delete chat",
    });
  };

  const moveToGroup = useCallback(
    async (chatId: string, groupId: string | null) => {
      await fetch(`/api/chat/${chatId}/group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      refresh();
    },
    [refresh],
  );

  const toggleCollapsed = useCallback(
    async (group: ChatGroup) => {
      // Applied locally first: the chevron has to move on click, not after a
      // round trip. The PATCH only has to make it survive a reload.
      await mutateGroups(
        {
          groups: groups.map((candidate) =>
            candidate.id === group.id
              ? { ...candidate, collapsed: !group.collapsed }
              : candidate,
          ),
        },
        { revalidate: false },
      );

      await fetch(`${GROUPS_KEY}/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collapsed: !group.collapsed }),
      });
    },
    [groups, mutateGroups],
  );

  const createGroup = useCallback(
    async (name: string, withChatId: string | null) => {
      const response = await fetch(GROUPS_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast({
          type: "error",
          description: body?.error ?? "Failed to create group",
        });
        return;
      }

      const { group } = (await response.json()) as { group: ChatGroup };
      await mutateGroups();

      if (withChatId) {
        await moveToGroup(withChatId, group.id);
      }
    },
    [moveToGroup, mutateGroups],
  );

  const submitRename = useCallback(async () => {
    if (!renameTarget || renameTarget.value.trim().length === 0) {
      return;
    }

    const { kind, id: targetId, value } = renameTarget;
    setRenameTarget(null);

    if (kind === "chat") {
      await fetch(`/api/chat/${targetId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value.trim() }),
      });
      refresh();
      return;
    }

    await fetch(`${GROUPS_KEY}/${targetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value.trim() }),
    });
    await mutateGroups();
  }, [mutateGroups, refresh, renameTarget]);

  const dropChatInGroup = useCallback(
    (groupId: string | null) => {
      const chatId = draggingChatId;
      setDraggingChatId(null);
      if (!chatId) {
        return;
      }
      const moving = allChats.find((candidate) => candidate.id === chatId);
      if (moving && (moving.groupId ?? null) === groupId) {
        return;
      }
      void moveToGroup(chatId, groupId);
    },
    [allChats, draggingChatId, moveToGroup],
  );

  const applyGroupOrder = useCallback(
    async (order: string[]) => {
      const byId = new Map(
        groups.map((candidate) => [candidate.id, candidate]),
      );
      await mutateGroups(
        {
          groups: order
            .map((groupId, index) => {
              const found = byId.get(groupId);
              return found ? { ...found, position: index } : null;
            })
            .filter((candidate): candidate is ChatGroup => candidate !== null),
        },
        { revalidate: false },
      );

      await fetch(GROUPS_KEY, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: order }),
      });
    },
    [groups, mutateGroups],
  );

  const dropGroupBefore = useCallback(
    (targetId: string) => {
      const sourceId = draggingGroupId;
      setDraggingGroupId(null);
      if (!sourceId || sourceId === targetId) {
        return;
      }
      const order = groups.map((candidate) => candidate.id);
      const from = order.indexOf(sourceId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0) {
        return;
      }
      order.splice(to, 0, ...order.splice(from, 1));
      void applyGroupOrder(order);
    },
    [applyGroupOrder, draggingGroupId, groups],
  );

  const nudgeGroup = useCallback(
    (groupId: string, delta: number) => {
      const order = groups.map((candidate) => candidate.id);
      const from = order.indexOf(groupId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= order.length) {
        return;
      }
      order.splice(to, 0, ...order.splice(from, 1));
      void applyGroupOrder(order);
    },
    [applyGroupOrder, groups],
  );

  const confirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete) {
      return;
    }
    const target = groupToDelete;
    setGroupToDelete(null);

    await fetch(`${GROUPS_KEY}/${target.id}`, { method: "DELETE" });
    await mutateGroups();
    refresh();
  }, [groupToDelete, mutateGroups, refresh]);

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

  if (hasEmptyChatHistory && groups.length === 0) {
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

  const visibleChats = allChats
    .filter((chat) => chatMatchesQuery(chat, query, personaCustoms))
    .filter(
      (chat) =>
        personaFilter.length === 0 ||
        personaFilter.includes(
          clientPersonaShortNameWithCustoms(chat.personaId, personaCustoms),
        ),
    );

  const filtering = query.trim().length > 0 || personaFilter.length > 0;
  const activeChatId = typeof id === "string" ? id : undefined;
  const ungrouped = sortChats(
    visibleChats.filter((chat) => chat.groupId === null),
    sort,
  );

  // Search and sort ride on the first heading rather than a row of their own,
  // which is a row of the list back.
  const listTools =
    variant === "panel" ? null : (
      <>
        <button
          className="flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-black/10 hover:text-sidebar-foreground"
          onClick={() => openPortal("chats")}
          title="Search chats"
          type="button"
        >
          <Search className="size-3.5" />
          <span className="sr-only">Search chats</span>
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                personaFilter.length > 0 && "text-sidebar-foreground",
              )}
              title="Filter, sort and group"
              type="button"
            >
              <SlidersIcon size={15} />
              <span className="sr-only">Filter, sort and group</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" side="bottom">
            <DropdownMenuLabel>Sort</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => setSort(value as SortKey)}
              value={sort}
            >
              <DropdownMenuRadioItem
                className="cursor-pointer"
                value="activity"
              >
                Activity
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="cursor-pointer" value="title">
                Title
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            {personaOptions.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Persona</DropdownMenuLabel>
                {personaOptions.map((label) => (
                  <DropdownMenuCheckboxItem
                    checked={personaFilter.includes(label)}
                    className="cursor-pointer"
                    key={label}
                    onCheckedChange={(checked) =>
                      setPersonaFilter((current) =>
                        checked
                          ? [...current, label]
                          : current.filter((value) => value !== label),
                      )
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
                {personaFilter.length > 0 ? (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => setPersonaFilter([])}
                  >
                    Clear persona filter
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => {
                setPendingGroupChatId(null);
                setNewGroupName("");
                setShowNewGroup(true);
              }}
            >
              <PlusIcon size={14} />
              <span>New group</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          {variant === "panel" ? (
            <div className="sticky top-0 z-10 bg-background pb-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <SidebarInput
                  aria-label="Search chats and personas"
                  className="h-8 border-border/50 bg-muted/40 pl-7 text-sm shadow-none focus-visible:border-border focus-visible:ring-0 md:h-8 md:px-2.5 md:pl-7"
                  data-testid="sidebar-history-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search chats and personas"
                  value={query}
                />
              </div>
            </div>
          ) : null}

          <SidebarMenu>
            {visibleChats.length === 0 && groups.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-zinc-500">
                No chats or personas match.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group, index) => (
                  <ChatGroupSection
                    activeChatId={activeChatId}
                    chats={sortChats(
                      visibleChats.filter((chat) => chat.groupId === group.id),
                      sort,
                    )}
                    filtering={filtering}
                    collapsed={group.collapsed}
                    dropActive={dropTarget === group.id}
                    draggingChatId={draggingChatId}
                    onDragChatEnd={() => setDraggingChatId(null)}
                    onDragChatStart={setDraggingChatId}
                    onDropChat={dropChatInGroup}
                    canNudgeDown={index < groups.length - 1}
                    canNudgeUp={index > 0}
                    onDropGroupBefore={dropGroupBefore}
                    onNudgeGroup={nudgeGroup}
                    onGroupDragEnd={() => setDraggingGroupId(null)}
                    onGroupDragStart={setDraggingGroupId}
                    onHoverTarget={setDropTarget}
                    group={group}
                    groups={groups}
                    key={group.id}
                    onDelete={requestDeleteChat}
                    onDeleteGroup={setGroupToDelete}
                    onMoveToGroup={(chatId, groupId) => {
                      void moveToGroup(chatId, groupId);
                    }}
                    onNewChatInGroup={(groupId) =>
                      router.push(groupId ? `/?group=${groupId}` : "/")
                    }
                    tools={index === 0 ? listTools : undefined}
                    onNewGroupWith={(chatId) => {
                      setPendingGroupChatId(chatId);
                      setNewGroupName("");
                      setShowNewGroup(true);
                    }}
                    onRename={(chatId) => {
                      const target = allChats.find(
                        (candidate) => candidate.id === chatId,
                      );
                      setRenameTarget({
                        kind: "chat",
                        id: chatId,
                        value: target?.title ?? "",
                      });
                    }}
                    onRenameGroup={(target) =>
                      setRenameTarget({
                        kind: "group",
                        id: target.id,
                        value: target.name,
                      })
                    }
                    onToggle={() => {
                      void toggleCollapsed(group);
                    }}
                    personaCustoms={personaCustoms}
                    setOpenMobile={setOpenMobile}
                    showHeader
                    tone={variant}
                  />
                ))}

                <ChatGroupSection
                  activeChatId={activeChatId}
                  chats={ungrouped}
                  filtering={filtering}
                  collapsed={ungroupedCollapsed}
                  dropActive={dropTarget === "ungrouped"}
                  draggingChatId={draggingChatId}
                  onDragChatEnd={() => setDraggingChatId(null)}
                  onDragChatStart={setDraggingChatId}
                  onDropChat={dropChatInGroup}
                  canNudgeDown={false}
                  canNudgeUp={false}
                  onDropGroupBefore={dropGroupBefore}
                  onNudgeGroup={nudgeGroup}
                  onGroupDragEnd={() => setDraggingGroupId(null)}
                  onGroupDragStart={setDraggingGroupId}
                  onHoverTarget={setDropTarget}
                  group={null}
                  groups={groups}
                  onDelete={requestDeleteChat}
                  onDeleteGroup={setGroupToDelete}
                  onMoveToGroup={(chatId, groupId) => {
                    void moveToGroup(chatId, groupId);
                  }}
                  onNewChatInGroup={(groupId) =>
                    router.push(groupId ? `/?group=${groupId}` : "/")
                  }
                  tools={groups.length === 0 ? listTools : undefined}
                  onNewGroupWith={(chatId) => {
                    setPendingGroupChatId(chatId);
                    setNewGroupName("");
                    setShowNewGroup(true);
                  }}
                  onRename={(chatId) => {
                    const target = allChats.find(
                      (candidate) => candidate.id === chatId,
                    );
                    setRenameTarget({
                      kind: "chat",
                      id: chatId,
                      value: target?.title ?? "",
                    });
                  }}
                  onRenameGroup={(target) =>
                    setRenameTarget({
                      kind: "group",
                      id: target.id,
                      value: target.name,
                    })
                  }
                  onToggle={toggleUngrouped}
                  personaCustoms={personaCustoms}
                  setOpenMobile={setOpenMobile}
                  showHeader={groups.length > 0}
                  tone={variant}
                />
              </div>
            )}
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!isValidating && !hasReachedEnd) {
                setSize((size) => size + 1);
              }
            }}
          />
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

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setGroupToDelete(null);
          }
        }}
        open={groupToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{groupToDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its chats move to Ungrouped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void confirmDeleteGroup();
              }}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        open={renameTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rename {renameTarget?.kind === "group" ? "group" : "chat"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            autoFocus
            onChange={(event) =>
              setRenameTarget((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }
            }}
            value={renameTarget?.value ?? ""}
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

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setShowNewGroup(false);
          }
        }}
        open={showNewGroup}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New group</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            autoFocus
            onChange={(event) => setNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newGroupName.trim().length > 0) {
                event.preventDefault();
                setShowNewGroup(false);
                void createGroup(newGroupName, pendingGroupChatId);
              }
            }}
            placeholder="Group name"
            value={newGroupName}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (newGroupName.trim().length === 0) {
                  return;
                }
                setShowNewGroup(false);
                void createGroup(newGroupName, pendingGroupChatId);
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
