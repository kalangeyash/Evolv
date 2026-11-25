"use client";
import type { FoodEntry } from "@/lib/db/types";
import { MEAL_LABELS, fmt } from "@/lib/utils/format";
import { formatTime12 } from "@/lib/utils/dates";
import { SourceBadge } from "@/components/ui/feedback";
import { NUTRIENT_COLOR } from "./nutrient-progress";

export function sortEntries(entries: FoodEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time) || a.order - b.order;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return a.order - b.order;
  });
}

/** Mini stacked bar of macro energy, so each meal's composition is visible at a glance. */
function MacroBar({ e }: { e: FoodEntry }) {
  const parts = [
    { k: "protein", kcal: (e.protein ?? 0) * 4 },
    { k: "carbs", kcal: (e.carbs ?? 0) * 4 },
    { k: "fat", kcal: (e.fat ?? 0) * 9 },
  ] as const;
  const total = parts.reduce((a, p) => a + p.kcal, 0);
  if (!total) return null;
  return (
    <div className="flex h-1.5 w-24 gap-[2px] overflow-hidden rounded-full" aria-hidden>
      {parts.map((p) => (p.kcal ? <span key={p.k} style={{ width: `${(p.kcal / total) * 100}%`, background: NUTRIENT_COLOR[p.k] }} /> : null))}
    </div>
  );
}

export function MealTimeline({ entries, onSelect }: { entries: FoodEntry[]; onSelect: (e: FoodEntry) => void }) {
  const sorted = sortEntries(entries);
  return (
    <ol className="relative">
      {sorted.map((e, i) => (
        <li key={e.id} className="relative pl-[72px]">
          <span className="tabular absolute left-0 top-3.5 w-[60px] text-right text-[12px] text-muted">{formatTime12(e.time)}</span>
          <span className="absolute left-[66px] top-0 h-full w-px bg-line" aria-hidden style={i === sorted.length - 1 ? { height: "1.5rem" } : undefined} />
          <span className="absolute left-[63px] top-[19px] size-[7px] rounded-full bg-text/70 ring-4 ring-surface" aria-hidden />
          <button
            type="button"
            onClick={() => onSelect(e)}
            className="group ml-3 w-[calc(100%-0.75rem)] rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-text">{e.mealName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span>{e.mealLabel ?? MEAL_LABELS[e.mealCategory]}</span>
                  {e.quantity ? <span className="truncate">{e.quantity}</span> : null}
                  {e.corrected || e.source === "manual" ? <SourceBadge source={e.source} corrected={e.corrected} /> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-semibold">
                  {fmt(e.calories)} <span className="text-[12px] font-normal text-muted">kcal</span>
                </p>
                <p className="tabular text-[12px] text-muted">{fmt(e.protein, { decimals: 1 })} g protein</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11.5px] text-faint">
              <MacroBar e={e} />
              <span className="tabular flex gap-3">
                <span>Carbs {fmt(e.carbs, { decimals: 1 })} g</span>
                <span>Fat {fmt(e.fat, { decimals: 1 })} g</span>
                <span>Fiber {fmt(e.fiber, { decimals: 1 })} g</span>
              </span>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}
