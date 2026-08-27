"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/toast";
import {
  getNetSuiteAuthErrorMessage,
  shouldOfferBasicAuthFallback,
} from "@/lib/auth/oidc-login-errors";

export function NetSuiteAuthErrorToast() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const description = searchParams.get("error_description");

  useEffect(() => {
    if (!error || shouldOfferBasicAuthFallback(error, description)) {
      return;
    }

    toast({
      type: "error",
      description: getNetSuiteAuthErrorMessage(error, description),
    });
  }, [description, error]);

  return null;
}
