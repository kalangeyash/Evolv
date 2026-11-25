"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade_150ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[min(92dvh,860px)] w-full flex-col border border-line bg-surface shadow-2xl focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-[20px] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px]",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="font-display text-lg font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
          </div>
          <D.Close className="-mr-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4 safe-bottom">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/** Confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  busy,
  disabled,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {children}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <D.Close asChild>
            <button type="button" className="h-10 rounded-[10px] px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
              Cancel
            </button>
          </D.Close>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void onConfirm()}
            className={cn(
              "h-10 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50",
              tone === "danger" ? "bg-bad text-white hover:opacity-90" : "bg-accent text-accent-ink hover:bg-accent-strong",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
