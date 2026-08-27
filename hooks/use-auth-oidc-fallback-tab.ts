"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  getOidcBasicAuthFallbackNote,
  shouldOfferBasicAuthFallback,
} from "@/lib/auth/oidc-login-errors";

export function useAuthOidcFallbackTab(basicAuthTabValue: string) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const description = searchParams.get("error_description");
  const showFallbackNote = shouldOfferBasicAuthFallback(error, description);
  const [tab, setTab] = useState(() =>
    showFallbackNote ? basicAuthTabValue : "netsuite",
  );

  return {
    tab,
    setTab,
    showFallbackNote,
    fallbackNote: getOidcBasicAuthFallbackNote(error, description),
  };
}
