"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn("scrollbar-thin inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[12px] border border-line bg-surface p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "h-8 shrink-0 rounded-[8px] px-3 text-[13px] font-medium text-muted transition-colors hover:text-text data-[state=active]:bg-surface-3 data-[state=active]:text-text",
        className,
      )}
      {...props}
    />
  );
}
