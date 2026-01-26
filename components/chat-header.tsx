"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR, assume desktop size (>= 768) to match initial render
  const isMobile =
    mounted && windowWidth !== undefined ? windowWidth < 768 : false;

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="pointer-events-none order-2 flex h-8 select-none flex-row items-center justify-center gap-0 rounded-md text-xl md:order-3">
        <span
          className="font-light"
          style={{ fontFamily: "var(--font-raleway)" }}
        >
          <span className="tracking-tight">OpenSuite</span>
          <span className="font-semibold">MCP</span>
        </span>
      </div>

      {(!open || isMobile) && (
        <Button
          className="order-3 ml-auto h-8 px-2 md:order-1 md:ml-0 md:px-2"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
