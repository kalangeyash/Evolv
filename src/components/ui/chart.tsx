"use client";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Shared tooltip body for Recharts. Values use text colours; a swatch carries identity. */
export function ChartTooltip({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string | null; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }[];
  labelFormatter?: (l: string | number, p?: Record<string, unknown>) => React.ReactNode;
  valueFormatter?: (v: number | string | null | undefined, name?: string) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      {label !== undefined ? <p className="mb-1 font-medium text-text">{labelFormatter ? labelFormatter(label, payload[0]?.payload) : label}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular font-medium text-text">{valueFormatter ? valueFormatter(p.value, p.name) : (p.value ?? "—")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Wrapper that keeps a fixed chart height and avoids SSR layout issues. */
export function ChartFrame({ height = 220, children, className, label }: { height?: number; children: React.ReactNode; className?: string; label?: string }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <div className={cn("w-full", className)} style={{ height }} role={label ? "img" : undefined} aria-label={label}>
      {mounted ? children : null}
    </div>
  );
}

/** Read a CSS custom property (for SVG attributes that cannot take var()). */
export function cssVar(name: string): string {
  return `var(${name})`;
}
