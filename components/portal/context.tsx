"use client";

import {
  Blocks,
  BookOpen,
  Brain,
  Cloud,
  FileText,
  Globe,
  KeyRound,
  type LucideIcon,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from "lucide-react";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type PortalSectionId =
  | "chats"
  | "artifacts"
  | "skills"
  | "memory"
  | "personas"
  | "prompts"
  | "provider"
  | "netsuite"
  | "agent-access"
  | "search"
  | "general"
  | "account";

export type PortalNavItem = {
  id: PortalSectionId;
  label: string;
  /** The same glyph the panel's own header uses, so the two agree. */
  icon: LucideIcon;
  group: "Workspace" | "Assistant" | "Connections" | "Preferences";
};

export const PORTAL_NAV: PortalNavItem[] = [
  // What this workspace holds: produced by work, reviewed rather than authored.
  { id: "chats", label: "Chats", icon: MessageSquare, group: "Workspace" },
  { id: "artifacts", label: "Artifacts", icon: FileText, group: "Workspace" },
  { id: "memory", label: "Memory", icon: Brain, group: "Workspace" },
  // What shapes how it behaves. All three answer the same question.
  { id: "personas", label: "Personas", icon: Users, group: "Assistant" },
  { id: "skills", label: "Skills", icon: Blocks, group: "Assistant" },
  { id: "prompts", label: "Prompts", icon: BookOpen, group: "Assistant" },
  // An outside system each: an account, a provider, a key, a search source.
  { id: "netsuite", label: "NetSuite", icon: Cloud, group: "Connections" },
  {
    id: "provider",
    label: "AI Provider",
    icon: Sparkles,
    group: "Connections",
  },
  {
    id: "agent-access",
    label: "Agent apps",
    icon: KeyRound,
    group: "Connections",
  },
  { id: "search", label: "Web Search", icon: Globe, group: "Connections" },
  // About you.
  { id: "account", label: "Account", icon: User, group: "Preferences" },
  {
    id: "general",
    label: "General",
    icon: SlidersHorizontal,
    group: "Preferences",
  },
];

type PromptSelectHandler = (promptText: string, promptName: string) => void;

type AppPortalContextValue = {
  open: boolean;
  section: PortalSectionId;
  openPortal: (section?: PortalSectionId) => void;
  closePortal: () => void;
  setSection: (section: PortalSectionId) => void;
  onSelectPrompt: PromptSelectHandler | null;
  registerPromptHandler: (handler: PromptSelectHandler | null) => void;
};

const AppPortalContext = createContext<AppPortalContextValue | null>(null);

export function AppPortalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<PortalSectionId>("provider");
  const [onSelectPrompt, setOnSelectPrompt] =
    useState<PromptSelectHandler | null>(null);

  const openPortal = useCallback((next?: PortalSectionId) => {
    if (next) {
      setSection(next);
    }
    setOpen(true);
  }, []);

  const closePortal = useCallback(() => {
    setOpen(false);
  }, []);

  const registerPromptHandler = useCallback(
    (handler: PromptSelectHandler | null) => {
      setOnSelectPrompt(() => handler);
    },
    [],
  );

  /**
   * `?portal=agent-access` opens straight to a section.
   *
   * Somewhere else in the app has to be able to say "go fix this there" — the
   * consent screen does, when no agent is waiting — and a sentence naming a
   * menu item is a worse answer than a link. Read from `window` rather than
   * `useSearchParams` so the page is not forced into a Suspense boundary for
   * something that only matters once, on arrival. The parameter is then
   * stripped, so a reload or a back button does not reopen it.
   */
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("portal");
    if (!requested) {
      return;
    }
    if (PORTAL_NAV.some((item) => item.id === requested)) {
      setSection(requested as PortalSectionId);
      setOpen(true);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("portal");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const value = useMemo(
    () => ({
      open,
      section,
      openPortal,
      closePortal,
      setSection,
      onSelectPrompt,
      registerPromptHandler,
    }),
    [
      open,
      section,
      openPortal,
      closePortal,
      onSelectPrompt,
      registerPromptHandler,
    ],
  );

  return (
    <AppPortalContext.Provider value={value}>
      {children}
    </AppPortalContext.Provider>
  );
}

export function useAppPortal() {
  const ctx = useContext(AppPortalContext);
  if (!ctx) {
    throw new Error("useAppPortal must be used within AppPortalProvider");
  }
  return ctx;
}

export function useOptionalAppPortal() {
  return useContext(AppPortalContext);
}
