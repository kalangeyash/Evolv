import type { GoalVersion, ISODate, NutrientKey } from "@/lib/db/types";

/**
 * The goal version in force on a date: the latest version whose
 * effectiveFrom is on or before the date. Dates before every version use the
 * earliest one. `versions` need not be sorted.
 */
export function goalsForDate(versions: GoalVersion[], date: ISODate): GoalVersion | null {
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let current = sorted[0];
  for (const v of sorted) {
    if (v.effectiveFrom <= date) current = v;
    else break;
  }
  return current;
}

/** Energy implied by macro targets: protein × 4 + carbs × 4 + fat × 9 (Atwater factors). */
export function macroCalories(t: { protein: number; carbs: number; fat: number }): number {
  return t.protein * 4 + t.carbs * 4 + t.fat * 9;
}

export interface MacroConsistency {
  derived: number;
  target: number;
  difference: number;
  differencePct: number;
  /** True when the macro-derived energy differs from the calorie target by more than 10%. */
  material: boolean;
}

export function macroConsistency(t: { calories: number; protein: number; carbs: number; fat: number }): MacroConsistency {
  const derived = macroCalories(t);
  const difference = derived - t.calories;
  const differencePct = t.calories ? (difference / t.calories) * 100 : 0;
  return { derived, target: t.calories, difference, differencePct, material: Math.abs(differencePct) > 10 };
}

/**
 * Whether a day's intake "met" a nutrient target. These rules are shown in
 * the Goals screen so the definition is never hidden:
 * - calories: within ±tolerance% of target
 * - protein, fiber: at least 95% of target (more is fine)
 * - carbs, fat: within ±10% of target
 */
export function targetMet(key: NutrientKey, consumed: number | null, target: number | null, calorieTolerancePct = 5): boolean | null {
  if (consumed === null || target === null || target <= 0) return null;
  const ratio = consumed / target;
  switch (key) {
    case "calories":
      return Math.abs(ratio - 1) * 100 <= calorieTolerancePct;
    case "protein":
    case "fiber":
      return ratio >= 0.95;
    default:
      return Math.abs(ratio - 1) <= 0.1;
  }
}

export type ProgressState = "below" | "within" | "above" | "unknown";

export function progressState(key: NutrientKey, consumed: number | null, target: number | null, calorieTolerancePct = 5): ProgressState {
  if (consumed === null || target === null || target <= 0) return "unknown";
  const ratio = consumed / target;
  const band = key === "calories" ? calorieTolerancePct / 100 : key === "protein" || key === "fiber" ? 0.05 : 0.1;
  if (key === "protein" || key === "fiber") return ratio >= 1 - band ? (ratio > 1 + 0.1 ? "above" : "within") : "below";
  if (ratio < 1 - band) return "below";
  if (ratio > 1 + band) return "above";
  return "within";
}
