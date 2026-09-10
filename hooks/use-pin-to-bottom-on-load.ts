"use client";

import { type RefObject, useLayoutEffect } from "react";

export function usePinToBottomOnLoad(
  containerRef: RefObject<HTMLDivElement | null>,
  chatId: string,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pin when switching chats
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let pinning = true;
    let lastScrollTop = container.scrollTop;

    const pin = () => {
      if (!pinning) {
        return;
      }
      container.scrollTop = container.scrollHeight;
      lastScrollTop = container.scrollTop;
    };

    const onScroll = () => {
      if (!pinning) {
        return;
      }
      const top = container.scrollTop;
      if (top + 2 < lastScrollTop) {
        pinning = false;
      }
      lastScrollTop = top;
    };

    pin();
    const raf = requestAnimationFrame(pin);

    const resize = new ResizeObserver(pin);
    const content = container.firstElementChild;
    if (content) {
      resize.observe(content);
    }

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      pinning = false;
      cancelAnimationFrame(raf);
      resize.disconnect();
      container.removeEventListener("scroll", onScroll);
    };
  }, [chatId, containerRef]);
}
