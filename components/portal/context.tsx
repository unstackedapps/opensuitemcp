"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type PortalSectionId =
  | "chats"
  | "skills"
  | "personas"
  | "prompts"
  | "provider"
  | "netsuite"
  | "search"
  | "timezone"
  | "account";

export type PortalNavItem = {
  id: PortalSectionId;
  label: string;
  group: "Workspace" | "Customize" | "Settings" | "Preferences";
};

export const PORTAL_NAV: PortalNavItem[] = [
  { id: "chats", label: "Chats", group: "Workspace" },
  { id: "personas", label: "Personas", group: "Customize" },
  { id: "skills", label: "Skills", group: "Customize" },
  { id: "prompts", label: "Prompts", group: "Customize" },
  { id: "provider", label: "AI Provider", group: "Settings" },
  { id: "netsuite", label: "NetSuite", group: "Settings" },
  { id: "search", label: "Web Search", group: "Settings" },
  { id: "timezone", label: "Timezone", group: "Preferences" },
  { id: "account", label: "Account", group: "Preferences" },
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
