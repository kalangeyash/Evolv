/**
 * Stage 3 — validation.
 *
 * Recomputes totals from the (possibly user-edited) entries, compares them
 * with the totals printed in the report, and decides whether the report is
 * ready to import. Original reported values are never modified.
 */
import type { NutrientKey, NutrientValues } from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import type { Issue, ParsedEntry, ParsedReport } from "./normalize";
import { emptyNutrients } from "./normalize";
import { isISODate } from "@/lib/utils/dates";

export type TotalStatus =
  | "match" // identical
  | "rounding" // differs by a rounding-sized amount
  | "mismatch"
  | "not-reported" // report printed no total for this nutrient
  | "no-data"; // no entry has this nutrient

export interface TotalComparison {
  key: NutrientKey;
  calculated: number | null;
  reported: number | null;
  difference: number | null;
  status: TotalStatus;
  /** Included entries that lack this nutrient (calculated total is partial). */
  entriesMissing: number;
}

export interface ValidationResult {
  calculatedTotals: NutrientValues;
  comparisons: TotalComparison[];
  hasDiscrepancy: boolean;
  errors: Issue[];
  warnings: Issue[];
  infos: Issue[];
  canImport: boolean;
  includedEntries: number;
}

/** Tolerance below which a difference is attributed to per-entry rounding. */
export const ROUNDING_TOLERANCE: Record<NutrientKey, number> = {
  calories: 5,
  protein: 1,
  carbs: 1,
  fat: 1,
  fiber: 1,
};

export function sumEntries(entries: Pick<ParsedEntry, NutrientKey>[]): {
  totals: NutrientValues;
  missing: Record<NutrientKey, number>;
} {
  const totals = emptyNutrients();
  const missing = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } as Record<NutrientKey, number>;
  for (const k of NUTRIENT_KEYS) {
    let sum: number | null = null;
    for (const e of entries) {
      const v = e[k];
      if (v === null || v === undefined) missing[k]++;
      else sum = (sum ?? 0) + v;
    }
    totals[k] = sum === null ? null : Math.round(sum * 10) / 10;
  }
  return { totals, missing };
}

export function compareTotals(
  calculated: NutrientValues,
  reported: NutrientValues,
  missing: Record<NutrientKey, number>,
): TotalComparison[] {
  return NUTRIENT_KEYS.map((key) => {
    const c = calculated[key];
    const r = reported[key];
    let status: TotalStatus;
    let difference: number | null = null;
    if (r === null) status = "not-reported";
    else if (c === null) status = "no-data";
    else {
      difference = Math.round((c - r) * 10) / 10;
      if (difference === 0) status = "match";
      else if (Math.abs(difference) <= ROUNDING_TOLERANCE[key]) status = "rounding";
      else status = "mismatch";
    }
    return { key, calculated: c, reported: r, difference, status, entriesMissing: missing[key] };
  });
}

export function validateReport(report: ParsedReport): ValidationResult {
  const included = report.entries.filter((e) => e.include);
  const { totals, missing } = sumEntries(included);
  const comparisons = compareTotals(totals, report.reportedTotals, missing);

  const all: Issue[] = [...report.issues];
  // Re-check entry-level blocking problems against current (edited) values.
  for (const e of included) {
    const label = e.mealName || `Entry ${e.entryNumber ?? e.key}`;
    if (!e.mealName.trim()) all.push({ level: "error", message: `${label}: food name is required.` });
    if (NUTRIENT_KEYS.every((k) => e[k] === null)) {
      all.push({ level: "error", message: `${label}: no nutrition values. Enter them or exclude the entry.` });
    }
    for (const k of NUTRIENT_KEYS) {
      const v = e[k];
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        all.push({ level: "error", message: `${label}: ${k} must be a non-negative number.` });
      }
    }
    if (e.time !== null && !/^\d{2}:\d{2}$/.test(e.time)) {
      all.push({ level: "error", message: `${label}: time must be HH:mm.` });
    }
  }
  // The date can be edited in the preview, so the "no date" issue is re-evaluated here.
  const dateOk = report.metadata.date !== null && isISODate(report.metadata.date);
  const filtered = all.filter((i) => !(i.field === "date" && i.level === "error" && dateOk));
  if (!dateOk && !filtered.some((i) => i.field === "date" && i.level === "error")) {
    filtered.push({ level: "error", field: "date", message: "A valid report date is required." });
  }
  if (!included.length && !report.activity && !report.workouts.some((w) => w.include)) {
    filtered.push({ level: "error", message: "Nothing to import: no food entries, activity or workouts are included." });
  }
  for (const c of comparisons) {
    if (c.status === "mismatch") {
      filtered.push({
        level: "warning",
        message: `${c.key}: entries add up to ${c.calculated}, but the report's total is ${c.reported} (difference ${c.difference! > 0 ? "+" : ""}${c.difference}).`,
      });
    }
  }

  const errors = dedupe(filtered.filter((i) => i.level === "error"));
  return {
    calculatedTotals: totals,
    comparisons,
    hasDiscrepancy: comparisons.some((c) => c.status === "mismatch"),
    errors,
    warnings: dedupe(filtered.filter((i) => i.level === "warning")),
    infos: dedupe(filtered.filter((i) => i.level === "info")),
    canImport: errors.length === 0,
    includedEntries: included.length,
  };
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.level}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
