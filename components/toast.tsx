"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCircleFillIcon, LoaderIcon, WarningIcon } from "./icons";

const iconsByType: Record<
  "success" | "error" | "loading" | "warning",
  ReactNode
> = {
  success: <CheckCircleFillIcon />,
  error: <WarningIcon />,
  warning: <WarningIcon />,
  loading: (
    <span className="animate-spin">
      <LoaderIcon />
    </span>
  ),
};

function createCustomToast(props: Omit<ToastProps, "id">) {
  return sonnerToast.custom((id) => (
    <Toast description={props.description} id={id} type={props.type} />
  ));
}

export const toast = Object.assign(createCustomToast, {
  success: (description: string) =>
    createCustomToast({ type: "success", description }),
  error: (description: string) =>
    createCustomToast({ type: "error", description }),
  warning: (description: string) =>
    createCustomToast({ type: "warning", description }),
  promise: <T,>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
  ) => {
    // Show loading toast first
    const loadingToastId = sonnerToast.custom((id) => (
      <Toast description={options.loading} id={id} type="loading" />
    ));

    // Handle promise resolution/rejection
    promise
      .then((data) => {
        // Dismiss loading toast
        sonnerToast.dismiss(loadingToastId);
        // Show success toast
        const message =
          typeof options.success === "function"
            ? options.success(data)
            : options.success;
        sonnerToast.custom((id) => (
          <Toast description={message} id={id} type="success" />
        ));
      })
      .catch((error) => {
        // Dismiss loading toast
        sonnerToast.dismiss(loadingToastId);
        // Show error toast
        const message =
          typeof options.error === "function"
            ? options.error(error)
            : options.error;
        sonnerToast.custom((id) => (
          <Toast description={message} id={id} type="error" />
        ));
      });

    return promise;
  },
});

function Toast(props: ToastProps) {
  const { id, type, description } = props;

  const descriptionRef = useRef<HTMLDivElement>(null);
  const [multiLine, setMultiLine] = useState(false);

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
      const lines = Math.round(el.scrollHeight / lineHeight);
      setMultiLine(lines > 1);
    };

    update(); // initial check
    const ro = new ResizeObserver(update); // re-check on width changes
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex toast-mobile:w-[356px] w-full justify-center">
      <div
        className={cn(
          "flex toast-mobile:w-fit w-full flex-row gap-3 rounded-lg border bg-background p-3",
          multiLine ? "items-start" : "items-center",
        )}
        data-testid="toast"
        key={id}
      >
        <div
          className={cn(
            "data-[type=error]:text-red-600 data-[type=loading]:text-muted-foreground data-[type=success]:text-green-600 data-[type=warning]:text-yellow-600 dark:data-[type=warning]:text-yellow-500",
            { "pt-1": multiLine },
          )}
          data-type={type}
        >
          {iconsByType[type]}
        </div>
        <div className="text-foreground text-sm" ref={descriptionRef}>
          {description}
        </div>
      </div>
    </div>
  );
}

type ToastProps = {
  id: string | number;
  type: "success" | "error" | "loading" | "warning";
  description: string;
};
