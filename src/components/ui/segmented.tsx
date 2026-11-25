"use client";
import { cn } from "@/lib/utils/cn";

/** Single-choice pill group (ranges, units). Uses radio semantics. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("scrollbar-thin inline-flex max-w-full gap-1 overflow-x-auto rounded-[10px] border border-line bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 shrink-0 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors",
            o.value === value ? "bg-surface-3 text-text" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
