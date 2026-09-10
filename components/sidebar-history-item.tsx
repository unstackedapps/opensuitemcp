import Link from "next/link";
import { memo } from "react";
import { useAppPortal } from "@/components/portal/context";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { clientPersonaShortNameWithCustoms } from "@/lib/ai/personas/ids";
import type { Chat } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  CheckCircleFillIcon,
  GlobeIcon,
  LockIcon,
  MoreVerticalIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
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

const EMPTY_PERSONA_CUSTOMS: Array<{
  id: string;
  shortName?: string;
  name?: string;
}> = [];

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  personaCustoms = EMPTY_PERSONA_CUSTOMS,
  setOpenMobile,
  tone = "sidebar",
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  personaCustoms?: Array<{ id: string; shortName?: string; name?: string }>;
  setOpenMobile: (open: boolean) => void;
  tone?: "sidebar" | "panel";
}) => {
  const { closePortal } = useAppPortal();
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
  });
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
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(
          "h-8 min-w-0 group-has-data-[sidebar=menu-action]/menu-item:pr-2",
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
        >
          <FadedSidebarText className="text-sm leading-5">
            {chat.title}
          </FadedSidebarText>
          <span
            className="max-w-27 shrink-0 truncate rounded-full border border-border/50 bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground leading-4"
            title={personaLabel}
          >
            {personaLabel}
          </span>
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={false}>
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-end overflow-hidden rounded-r-md pr-2",
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
                "static top-auto right-auto size-6 translate-y-0 rounded-md bg-transparent p-0 hover:bg-black/10",
                "pointer-events-none group-hover/menu-item:pointer-events-auto",
                "group-focus-within/menu-item:pointer-events-auto data-[state=open]:pointer-events-auto",
                "max-sm:pointer-events-auto",
              )}
              type="button"
            >
              <MoreVerticalIcon />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
        </div>

        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ShareIcon />
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

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
            onSelect={() => onDelete(chat.id)}
          >
            <TrashIcon />
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
  if (prevProps.personaCustoms !== nextProps.personaCustoms) {
    return false;
  }
  return true;
});
