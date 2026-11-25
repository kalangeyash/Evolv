import { cn } from "@/lib/utils/cn";

/**
 * EVOLV mark: three rising strata forming a V — progress stacked over time.
 */
export function EvolvMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M8.5 9.5 16 23l7.5-13.5" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 9.5h6.8" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

export function EvolvWordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <EvolvMark />
      {!collapsed ? <span className="font-display text-[19px] font-bold tracking-[0.06em] text-text">EVOLV</span> : null}
    </span>
  );
}
