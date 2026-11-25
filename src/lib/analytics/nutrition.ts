import type {
  DailyNutritionSummary,
  FoodEntry,
  GoalVersion,
  ISODate,
  MealCategory,
  NutrientKey,
  NutrientValues,
} from "@/lib/db/types";
import { MEAL_CATEGORIES, NUTRIENT_KEYS } from "@/lib/db/types";
import { dateRange } from "@/lib/utils/dates";
import { goalsForDate, targetMet } from "./goals";
import { maxBy, mean, minBy } from "./stats";

export const emptyTotals = (): NutrientValues => ({ calories: null, protein: null, carbs: null, fat: null, fiber: null });

export interface DayNutrition {
  date: ISODate;
  /** At least one food entry exists, or reported totals were chosen. */
  logged: boolean;
  totals: NutrientValues;
  source: "entries" | "reported" | "none";
  entryCount: number;
  /** Entries lacking each nutrient — totals are partial when > 0. */
  missing: Record<NutrientKey, number>;
}

/** Sum a day's entries. A nutrient no entry supplies stays null (not 0). */
export function sumFood(entries: Pick<FoodEntry, NutrientKey>[]): { totals: NutrientValues; missing: Record<NutrientKey, number> } {
  const totals = emptyTotals();
  const missing = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const k of NUTRIENT_KEYS) {
    let s: number | null = null;
    for (const e of entries) {
      const v = e[k];
      if (v === null || v === undefined) missing[k]++;
      else s = (s ?? 0) + v;
    }
    totals[k] = s === null ? null : Math.round(s * 10) / 10;
  }
  return { totals, missing };
}

export function dayNutrition(date: ISODate, entries: FoodEntry[], override?: DailyNutritionSummary | null): DayNutrition {
  const { totals, missing } = sumFood(entries);
  if (override && override.mode === "reported") {
    return { date, logged: true, totals: { ...override.totals }, source: "reported", entryCount: entries.length, missing };
  }
  return {
    date,
    logged: entries.length > 0,
    totals,
    source: entries.length ? "entries" : "none",
    entryCount: entries.length,
    missing,
  };
}

/** One DayNutrition per calendar day in [start, end], including unlogged days. */
export function nutritionSeries(
  start: ISODate,
  end: ISODate,
  food: FoodEntry[],
  overrides: DailyNutritionSummary[],
): DayNutrition[] {
  const byDate = new Map<string, FoodEntry[]>();
  for (const f of food) {
    const list = byDate.get(f.date);
    if (list) list.push(f);
    else byDate.set(f.date, [f]);
  }
  const ov = new Map(overrides.map((o) => [o.date, o]));
  return dateRange(start, end).map((d) => dayNutrition(d, byDate.get(d) ?? [], ov.get(d)));
}

export interface PeriodNutrition {
  start: ISODate;
  end: ISODate;
  days: number;
  loggedDays: number;
  /** Averages over logged days only; unlogged days are not counted as zero. */
  averages: NutrientValues;
  /** Days on which each target was met, out of logged days with data for that nutrient. */
  targetMetDays: Record<NutrientKey, { met: number; of: number }>;
  highest: Record<NutrientKey, DayNutrition | null>;
  lowest: Record<NutrientKey, DayNutrition | null>;
}

export function periodNutrition(
  series: DayNutrition[],
  goals: GoalVersion[],
  calorieTolerancePct = 5,
): PeriodNutrition {
  const logged = series.filter((d) => d.logged);
  const averages = emptyTotals();
  const targetMetDays = {} as PeriodNutrition["targetMetDays"];
  const highest = {} as PeriodNutrition["highest"];
  const lowest = {} as PeriodNutrition["lowest"];
  for (const k of NUTRIENT_KEYS) {
    const m = mean(logged.map((d) => d.totals[k]));
    averages[k] = m === null ? null : Math.round(m * 10) / 10;
    let met = 0;
    let of = 0;
    for (const d of logged) {
      const g = goalsForDate(goals, d.date);
      const r = targetMet(k, d.totals[k], g ? g[k] : null, calorieTolerancePct);
      if (r !== null) {
        of++;
        if (r) met++;
      }
    }
    targetMetDays[k] = { met, of };
    highest[k] = maxBy(logged, (d) => d.totals[k]);
    lowest[k] = minBy(logged, (d) => d.totals[k]);
  }
  return {
    start: series[0]?.date ?? "",
    end: series[series.length - 1]?.date ?? "",
    days: series.length,
    loggedDays: logged.length,
    averages,
    targetMetDays,
    highest,
    lowest,
  };
}

/**
 * Consecutive *logged* days, counting back from the most recent logged day,
 * on which the nutrient was below target. Unlogged days are skipped, not
 * counted as failures.
 */
export function consecutiveBelowTarget(
  series: DayNutrition[],
  key: NutrientKey,
  goals: GoalVersion[],
  calorieTolerancePct = 5,
): { count: number; since: ISODate | null } {
  let count = 0;
  let since: ISODate | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const d = series[i];
    if (!d.logged || d.totals[key] === null) continue;
    const g = goalsForDate(goals, d.date);
    const met = targetMet(key, d.totals[key], g ? g[key] : null, calorieTolerancePct);
    if (met === false) {
      count++;
      since = d.date;
    } else break;
  }
  return { count, since };
}

export interface MealBreakdown {
  category: MealCategory;
  entries: number;
  totals: NutrientValues;
}

export function mealBreakdown(entries: FoodEntry[]): MealBreakdown[] {
  return MEAL_CATEGORIES.map((category) => {
    const list = entries.filter((e) => e.mealCategory === category);
    return { category, entries: list.length, totals: sumFood(list).totals };
  }).filter((m) => m.entries > 0);
}

/**
 * Share of energy from each macro, computed from grams with Atwater factors
 * (4/4/9). Shares are of macro-derived energy, so they always sum to 100%;
 * this is labelled as an estimate in the UI.
 */
export function macroEnergyShare(t: NutrientValues): { protein: number; carbs: number; fat: number; derivedKcal: number } | null {
  if (t.protein === null || t.carbs === null || t.fat === null) return null;
  const p = t.protein * 4;
  const c = t.carbs * 4;
  const f = t.fat * 9;
  const total = p + c + f;
  if (total <= 0) return null;
  return { protein: (p / total) * 100, carbs: (c / total) * 100, fat: (f / total) * 100, derivedKcal: total };
}

export function averageFoodScore(entries: FoodEntry[]): number | null {
  const scores = entries
    .filter((e) => e.foodScore !== null && e.foodScoreScale)
    .map((e) => (e.foodScore! / e.foodScoreScale!) * 10);
  const m = mean(scores);
  return m === null ? null : Math.round(m * 10) / 10;
}

export interface FrequentFood {
  key: string;
  name: string;
  count: number;
  lastDate: ISODate;
  avgCalories: number | null;
  avgProtein: number | null;
  categories: MealCategory[];
}

export function frequentFoods(entries: FoodEntry[], limit = 20): FrequentFood[] {
  const groups = new Map<string, FoodEntry[]>();
  for (const e of entries) {
    const k = e.mealName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: list[list.length - 1].mealName,
      count: list.length,
      lastDate: list.reduce((m, e) => (e.date > m ? e.date : m), list[0].date),
      avgCalories: roundOrNull(mean(list.map((e) => e.calories)), 0),
      avgProtein: roundOrNull(mean(list.map((e) => e.protein)), 1),
      categories: [...new Set(list.map((e) => e.mealCategory))],
    }))
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

function roundOrNull(v: number | null, d: number) {
  if (v === null) return null;
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/** Cumulative intake through the day, for the Overview intake line. */
export interface IntakePoint {
  time: string;
  minutes: number;
  calories: number;
  protein: number;
  label: string;
  /** True once any entry up to this point lacked calories or protein, so the running sum is a lower bound. */
  partial: boolean;
}

/**
 * Cumulative intake through the day, for the Overview intake line. Entries
 * without a time cannot be placed on the clock and are excluded (the caller
 * reports how many). Missing values do not add to the running sum, and the
 * point is flagged `partial` so the chart can say so.
 */
export function cumulativeIntake(entries: FoodEntry[]): IntakePoint[] {
  const timed = entries
    .filter((e) => e.time)
    .sort((a, b) => a.time!.localeCompare(b.time!) || a.order - b.order);
  let cal = 0;
  let pro = 0;
  let partial = false;
  return timed.map((e) => {
    if (e.calories === null || e.protein === null) partial = true;
    cal += e.calories ?? 0;
    pro += e.protein ?? 0;
    const [h, m] = e.time!.split(":").map(Number);
    return { time: e.time!, minutes: h * 60 + m, calories: Math.round(cal), protein: Math.round(pro * 10) / 10, label: e.mealName, partial };
  });
}
