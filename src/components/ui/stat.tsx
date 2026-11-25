import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Compact labelled figure. `sub` carries context such as sample size. */
export function Stat({ label, value, unit, sub, className, accent }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {accent ? <span className="size-2 rounded-full" style={{ background: accent }} aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-1 font-display text-[24px] font-semibold leading-tight tabular">
        {value}
        {unit ? <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-0.5 text-[12px] text-faint">{sub}</p> : null}
    </div>
  );
}
