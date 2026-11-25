import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-muted",
      accent: "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-accent-text",
      good: "bg-good-bg text-good",
      warn: "bg-warn-bg text-warn",
      bad: "bg-bad-bg text-bad",
      outline: "border border-line text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
