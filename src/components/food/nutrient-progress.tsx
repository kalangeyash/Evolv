"use client";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import type { NutrientKey, NutrientValues } from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import { progressState } from "@/lib/analytics/goals";
import { ProgressBar } from "@/components/ui/progress";
import { NUTRIENT_LABELS, NUTRIENT_UNITS, fmt } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const NUTRIENT_COLOR: Record<NutrientKey, string> = {
  calories: "var(--c-calories)",
  protein: "var(--c-protein)",
  carbs: "var(--c-carbs)",
  fat: "var(--c-fat)",
  fiber: "var(--c-fiber)",
};

function StateLabel({ k, consumed, target, tolerance }: { k: NutrientKey; consumed: number | null; target: number | null; tolerance: number }) {
  const s = progressState(k, consumed, target, tolerance);
  if (s === "unknown") return <span className="text-faint">No data</span>;
  if (k === "protein" || k === "fiber") {
    return s === "below" ? (
      <span className="text-muted">In progress</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-good">
        <Check className="size-3.5" aria-hidden /> Target met
      </span>
    );
  }
  if (s === "within")
    return (
      <span className="inline-flex items-center gap-1 text-good">
        <Check className="size-3.5" aria-hidden /> Within range
      </span>
    );
  return s === "below" ? (
    <span className="inline-flex items-center gap-1 text-muted">
      <ArrowDown className="size-3.5" aria-hidden /> Below target
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn">
      <ArrowUp className="size-3.5" aria-hidden /> Above target
    </span>
  );
}

/**
 * Consumed / target / remaining / % for each nutrient. Missing totals show
 * "—" and partial totals are labelled, never presented as complete.
 */
export function NutrientProgressList({
  totals,
  targets,
  missing,
  tolerance,
  keys = NUTRIENT_KEYS as unknown as NutrientKey[],
  compact,
}: {
  totals: NutrientValues;
  targets: Record<NutrientKey, number> | null;
  missing?: Record<NutrientKey, number>;
  tolerance: number;
  keys?: NutrientKey[];
  compact?: boolean;
}) {
  return (
    <ul className={cn("grid gap-x-8", compact ? "gap-y-3" : "gap-y-4 sm:grid-cols-2")}>
      {keys.map((k) => {
        const c = totals[k];
        const t = targets ? targets[k] : null;
        const remaining = c !== null && t !== null ? t - c : null;
        const p = c !== null && t ? (c / t) * 100 : null;
        const unit = NUTRIENT_UNITS[k];
        const partial = (missing?.[k] ?? 0) > 0 && c !== null;
        return (
          <li key={k}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                <span className="size-2 rounded-full" style={{ background: NUTRIENT_COLOR[k] }} aria-hidden />
                {NUTRIENT_LABELS[k]}
              </span>
              <span className="tabular text-[13.5px]">
                <span className="font-semibold text-text">{fmt(c, { decimals: k === "calories" ? 0 : 1 })}</span>
                <span className="text-muted"> / {fmt(t)} {unit}</span>
              </span>
            </div>
            <ProgressBar value={c} target={t} color={NUTRIENT_COLOR[k]} label={`${NUTRIENT_LABELS[k]} progress`} />
            <div className="mt-1.5 flex items-center justify-between text-[12px]">
              <StateLabel k={k} consumed={c} target={t} tolerance={tolerance} />
              <span className="tabular text-muted">
                {remaining !== null ? (remaining >= 0 ? `${fmt(remaining, { decimals: k === "calories" ? 0 : 1 })} ${unit} left, ` : `${fmt(-remaining, { decimals: k === "calories" ? 0 : 1 })} ${unit} over, `) : ""}
                {p !== null ? `${Math.round(p)}%` : "—"}
              </span>
            </div>
            {partial ? <p className="mt-0.5 text-[11.5px] text-warn">Partial: {missing![k]} entr{missing![k] === 1 ? "y has" : "ies have"} no {NUTRIENT_LABELS[k].toLowerCase()} value</p> : null}
            {k === "calories" && t ? (
              <p className="mt-0.5 text-[11.5px] text-faint">
                Target range {fmt(t * (1 - tolerance / 100))}–{fmt(t * (1 + tolerance / 100))} kcal
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
