"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type {
  ComponentPropsWithoutRef,
  ElementRef,
  HTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    ref={ref}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogChromeButtonClassName =
  "flex size-8 items-center justify-center rounded-full border border-white/25 bg-zinc-900/90 text-white shadow-md transition-opacity hover:bg-zinc-800 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:pointer-events-none disabled:opacity-50";

type DialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  showCloseButton?: boolean;
  closeClassName?: string;
  /** Extra round controls in the chrome row above the card, before Close. */
  headerActions?: ReactNode;
};

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      showCloseButton = true,
      closeClassName,
      headerActions,
      ...props
    },
    ref,
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[calc(50%+1.25rem)] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%] overflow-visible border-0 bg-transparent p-0 shadow-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:top-[50%]"
        ref={ref}
        {...props}
      >
        <div className="relative">
          {headerActions || showCloseButton ? (
            <div className="-top-10 absolute right-0 z-50 flex items-center gap-2">
              {headerActions}
              {showCloseButton ? (
                <DialogPrimitive.Close
                  className={cn(dialogChromeButtonClassName, closeClassName)}
                  type="button"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              "grid max-h-[calc(100dvh-5.5rem)] w-[calc(100vw-1.5rem)] max-w-lg gap-4 overflow-hidden rounded-lg border bg-background p-4 shadow-lg max-sm:[&_.text-sm]:text-xs! max-sm:[&_.text-xs]:text-[11px]! sm:p-6",
              className,
            )}
          >
            {children}
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    className={cn(
      "font-semibold text-base leading-none tracking-tight sm:text-lg",
      className
    )}
    ref={ref}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    className={cn("text-muted-foreground text-xs sm:text-sm", className)}
    ref={ref}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogChromeButtonClassName,
};
