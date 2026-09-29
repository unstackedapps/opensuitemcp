import Link from "next/link";
import { memo } from "react";
import { useAppPortal } from "@/components/portal/context";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { clientPersonaShortNameWithCustoms } from "@/lib/ai/personas/ids";
import {
  CHAT_STATUS_LABEL,
  type ChatStatus,
  type ChatWithActivity,
  chatStatus,
} from "@/lib/chat-status";
import type { ChatGroup } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  CheckCircleFillIcon,
  ExternalLinkIcon,
  FolderIcon,
  GlobeIcon,
  LockIcon,
  MoreVerticalIcon,
  PencilEditIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
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
} from "./ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

function FadedSidebarText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "min-w-0 flex-1 overflow-hidden whitespace-nowrap",
        "mask-[linear-gradient(to_right,black_calc(100%-0.75rem),transparent)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const DOT_COLOR: Record<Exclude<ChatStatus, "idle">, string> = {
  working: "var(--chat-dot-working)",
  needsUser: "var(--chat-dot-needs-user)",
  finished: "var(--chat-dot-finished)",
};

function StatusDot({ status }: { status: ChatStatus }) {
  const label = CHAT_STATUS_LABEL[status];

  return (
    <span
      aria-hidden={label === "" ? "true" : undefined}
      className="flex size-3 shrink-0 items-center justify-center"
      title={label || undefined}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "working" && "animate-pulse",
          status === "idle" && "border border-[var(--chat-dot-idle)]",
        )}
        style={
          status === "idle" ? undefined : { backgroundColor: DOT_COLOR[status] }
        }
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

const EMPTY_PERSONA_CUSTOMS: Array<{
  id: string;
  shortName?: string;
  name?: string;
}> = [];

const EMPTY_GROUPS: ChatGroup[] = [];

/** Lowercase: the drag-and-drop API lowercases custom types on read. */
export const CHAT_DRAG_TYPE = "application/x-osmcp-chat";
export const GROUP_DRAG_TYPE = "application/x-osmcp-group";

const PureChatItem = ({
  chat,
  groups = EMPTY_GROUPS,
  isActive,
  onDelete,
  onMoveToGroup,
  onNewGroupWith,
  onRename,
  personaCustoms = EMPTY_PERSONA_CUSTOMS,
  setOpenMobile,
  tone = "sidebar",
  dragging = false,
  onDragChatStart,
  onDragChatEnd,
}: {
  chat: ChatWithActivity;
  groups?: ChatGroup[];
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onMoveToGroup: (chatId: string, groupId: string | null) => void;
  onNewGroupWith: (chatId: string) => void;
  onRename: (chatId: string) => void;
  personaCustoms?: Array<{ id: string; shortName?: string; name?: string }>;
  dragging?: boolean;
  onDragChatStart?: (chatId: string) => void;
  onDragChatEnd?: () => void;
  setOpenMobile: (open: boolean) => void;
  tone?: "sidebar" | "panel";
}) => {
  const { closePortal } = useAppPortal();
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
  });
  const status = chatStatus(chat, isActive);
  const personaLabel = clientPersonaShortNameWithCustoms(
    chat.personaId,
    personaCustoms,
  );
  const menuFadeToneClass =
    tone === "panel"
      ? cn(
          "bg-background group-hover/menu-item:bg-muted/50",
          "group-focus-within/menu-item:bg-muted/50",
          "has-data-[state=open]:bg-muted/50",
          "peer-data-[active=true]/menu-button:bg-muted/70",
        )
      : cn(
          "bg-sidebar group-hover/menu-item:bg-sidebar-accent",
          "group-focus-within/menu-item:bg-sidebar-accent",
          "has-data-[state=open]:bg-sidebar-accent",
          "peer-data-[active=true]/menu-button:bg-sidebar-accent",
        );

  return (
    <SidebarMenuItem
      className={cn(dragging && "opacity-40")}
      draggable={onDragChatStart !== undefined}
      onDragEnd={onDragChatEnd}
      onDragStart={(event) => {
        // A row is a link, and a dragged link writes its href by default. The
        // payload has to be replaced or the drop target reads a URL.
        event.dataTransfer.clearData();
        event.dataTransfer.setData(CHAT_DRAG_TYPE, chat.id);
        event.dataTransfer.setData("text/plain", chat.title);
        event.dataTransfer.effectAllowed = "move";
        onDragChatStart?.(chat.id);
      }}
    >
      <SidebarMenuButton
        asChild
        className={cn(
          "h-7 min-w-0 group-has-data-[sidebar=menu-action]/menu-item:pr-2!",
          tone === "panel"
            ? "hover:bg-muted/50! hover:text-foreground group-hover/menu-item:bg-muted/50! group-hover/menu-item:text-foreground data-[active=true]:bg-muted/70! data-[active=true]:font-medium data-[active=true]:text-foreground"
            : "group-hover/menu-item:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground",
        )}
        isActive={isActive}
      >
        <Link
          href={`/chat/${chat.id}`}
          onClick={() => {
            setOpenMobile(false);
            closePortal();
          }}
          title={`${chat.title}\n${personaLabel}`}
        >
          <StatusDot status={status} />
          <FadedSidebarText className="text-[13px] leading-[18px]">
            {chat.title}
          </FadedSidebarText>
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={false}>
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-end overflow-hidden rounded-r-md pr-1",
            "mask-[linear-gradient(to_left,black_2rem,transparent)]",
            "opacity-0 transition-opacity duration-150",
            "group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100",
            "has-data-[state=open]:opacity-100 max-sm:opacity-100",
            menuFadeToneClass,
          )}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              className={cn(
                "static top-auto right-auto size-5 translate-y-0 rounded-md bg-transparent p-0 opacity-70 hover:bg-black/10 hover:opacity-100",
                "[&>svg]:size-3.5!",
                "pointer-events-none group-hover/menu-item:pointer-events-auto",
                "group-focus-within/menu-item:pointer-events-auto data-[state=open]:pointer-events-auto",
                "max-sm:pointer-events-auto",
              )}
              type="button"
            >
              <MoreVerticalIcon size={14} />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
        </div>

        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => {
              window.open(`/chat/${chat.id}`, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLinkIcon size={14} />
            <span>Open in new tab</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => onRename(chat.id)}
          >
            <PencilEditIcon size={14} />
            <span>Rename</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <FolderIcon size={14} />
              <span>Move to group</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {groups.map((group) => (
                  <DropdownMenuItem
                    className="flex-row justify-between gap-4 cursor-pointer"
                    key={group.id}
                    onSelect={() => onMoveToGroup(chat.id, group.id)}
                  >
                    <span className="truncate">{group.name}</span>
                    {chat.groupId === group.id ? <CheckCircleFillIcon /> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  className="flex-row justify-between gap-4 cursor-pointer"
                  onSelect={() => onMoveToGroup(chat.id, null)}
                >
                  <span>Ungrouped</span>
                  {chat.groupId === null ? <CheckCircleFillIcon /> : null}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => onNewGroupWith(chat.id)}
                >
                  <span>New group…</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ShareIcon size={14} />
              <span>Share</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType("private");
                  }}
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
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType("public");
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <GlobeIcon />
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
            onSelect={() => onDelete(chat.id)}
          >
            <TrashIcon size={14} />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) {
    return false;
  }
  if (prevProps.tone !== nextProps.tone) {
    return false;
  }
  if (prevProps.chat.id !== nextProps.chat.id) {
    return false;
  }
  if (prevProps.chat.title !== nextProps.chat.title) {
    return false;
  }
  if (prevProps.chat.personaId !== nextProps.chat.personaId) {
    return false;
  }
  if (prevProps.chat.groupId !== nextProps.chat.groupId) {
    return false;
  }
  if (prevProps.groups !== nextProps.groups) {
    return false;
  }
  if (prevProps.dragging !== nextProps.dragging) {
    return false;
  }
  if (prevProps.personaCustoms !== nextProps.personaCustoms) {
    return false;
  }
  if (
    chatStatus(prevProps.chat, prevProps.isActive) !==
    chatStatus(nextProps.chat, nextProps.isActive)
  ) {
    return false;
  }
  return true;
});
