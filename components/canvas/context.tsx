"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * One piece of a message, opened beside the conversation rather than inside it.
 *
 * A NetSuite result is the case this exists for. It arrives as rows of JSON,
 * renders into a code block inside a collapsed tool card inside a chat bubble,
 * and by the time a person reaches it there is a column of text perhaps forty
 * characters wide to read a vendor ledger in. The content is not the problem;
 * the width is.
 */
export type CanvasContent = {
  /** Stable per payload, so reopening the same result does not stack. */
  id: string;
  title: string;
  code: string;
  language: string;
};

type CanvasContextValue = {
  content: CanvasContent | null;
  open: boolean;
  /** False when no provider is mounted; callers hide the affordance. */
  available: boolean;
  openCanvas: (content: CanvasContent) => void;
  closeCanvas: () => void;
  isOpenFor: (id: string) => boolean;
};

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<CanvasContent | null>(null);

  const openCanvas = useCallback((next: CanvasContent) => {
    // Opening the panel on what it already shows is a request to close it,
    // which is what the same button being pressed twice means.
    setContent((current) => (current?.id === next.id ? null : next));
  }, []);

  const closeCanvas = useCallback(() => setContent(null), []);

  const isOpenFor = useCallback(
    (id: string) => content?.id === id,
    [content?.id],
  );

  const value = useMemo(
    () => ({
      content,
      open: content !== null,
      available: true,
      openCanvas,
      closeCanvas,
      isOpenFor,
    }),
    [content, openCanvas, closeCanvas, isOpenFor],
  );

  return (
    <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
  );
}

/**
 * Canvas where it is mounted, and nothing where it is not.
 *
 * Deliberately not a throw. A downstream repo can replace the layout that
 * mounts the provider — opensuitemcp-hosted ships its own copy of several app
 * files — and a hook that throws would turn a missing side panel into a blank
 * page. The reading experience degrades to what it was before canvas existed,
 * which is a complete answer.
 */
export function useCanvas(): CanvasContextValue {
  return useContext(CanvasContext) ?? UNAVAILABLE;
}

const UNAVAILABLE: CanvasContextValue = {
  content: null,
  open: false,
  available: false,
  openCanvas: () => undefined,
  closeCanvas: () => undefined,
  isOpenFor: () => false,
};
