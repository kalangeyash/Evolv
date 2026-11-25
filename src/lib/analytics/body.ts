import type { BodyMeasurement, ISODate, MeasurementKey, WeightEntry } from "@/lib/db/types";
import { MEASUREMENT_KEYS } from "@/lib/db/types";
import { daysBetween, monthKey, shiftDate, weekKey } from "@/lib/utils/dates";
import { mean, slope } from "./stats";

/* -------------------------------------------------------------------- BMI */

/** Body-mass index = kg / m². Null when either input is missing. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/**
 * WHO adult categories. Indian national guidance uses lower cut-offs
 * (overweight from 23, obesity from 25); both are shown so neither is
 * presented as definitive. BMI does not measure body fat.
 */
export function bmiCategory(v: number): { who: string; asianIndian: string } {
  const who = v < 18.5 ? "Underweight" : v < 25 ? "Healthy range" : v < 30 ? "Overweight" : "Obesity";
  const asianIndian = v < 18.5 ? "Underweight" : v < 23 ? "Healthy range" : v < 25 ? "Overweight" : "Obesity";
  return { who, asianIndian };
}

/* ------------------------------------------------------------------ weight */

export interface DailyWeight {
  date: ISODate;
  weightKg: number;
  readings: number;
}

/** One value per day: the mean of that day's readings. Sorted by date. */
export function dailyWeights(entries: WeightEntry[]): DailyWeight[] {
  const byDate = new Map<string, number[]>();
  for (const e of entries) {
    const l = byDate.get(e.date);
    if (l) l.push(e.weightKg);
    else byDate.set(e.date, [e.weightKg]);
  }
  return [...byDate.entries()]
    .map(([date, list]) => ({ date, weightKg: round2(list.reduce((a, b) => a + b, 0) / list.length), readings: list.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface MovingAveragePoint {
  date: ISODate;
  weightKg: number;
  average: number;
  /** Number of daily values inside the 7-day window. */
  samples: number;
}

/**
 * Trailing moving average over a calendar window (default 7 days, i.e. the
 * day itself plus the six before it). Averages whatever weigh-ins exist in
 * the window; `samples` tells the UI how much data backs each point.
 */
export function movingAverage(daily: DailyWeight[], windowDays = 7): MovingAveragePoint[] {
  return daily.map((d) => {
    const from = shiftDate(d.date, -(windowDays - 1));
    const inWindow = daily.filter((x) => x.date >= from && x.date <= d.date);
    return {
      date: d.date,
      weightKg: d.weightKg,
      average: round2(inWindow.reduce((a, b) => a + b.weightKg, 0) / inWindow.length),
      samples: inWindow.length,
    };
  });
}

export interface PeriodAverage {
  key: string;
  start: ISODate;
  average: number;
  samples: number;
}

export function weeklyAverages(daily: DailyWeight[]): PeriodAverage[] {
  return periodAverages(daily, weekKey);
}

export function monthlyAverages(daily: DailyWeight[]): PeriodAverage[] {
  return periodAverages(daily, (d) => monthKey(d));
}

function periodAverages(daily: DailyWeight[], keyFn: (d: ISODate) => string): PeriodAverage[] {
  const groups = new Map<string, DailyWeight[]>();
  for (const d of daily) {
    const k = keyFn(d.date);
    const l = groups.get(k);
    if (l) l.push(d);
    else groups.set(k, [d]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      start: list[0].date,
      average: round2(list.reduce((a, b) => a + b.weightKg, 0) / list.length),
      samples: list.length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Change in the 7-day average between the latest window and the window
 * ending seven days earlier. Requires at least two weigh-ins in each window,
 * so a single day's fluctuation is never reported as a trend.
 */
export function weeklyAverageChange(daily: DailyWeight[], asOf: ISODate): {
  current: number;
  previous: number;
  change: number;
  currentSamples: number;
  previousSamples: number;
} | null {
  const win = (end: ISODate) => daily.filter((d) => d.date > shiftDate(end, -7) && d.date <= end);
  const cur = win(asOf);
  const prev = win(shiftDate(asOf, -7));
  if (cur.length < 2 || prev.length < 2) return null;
  const c = mean(cur.map((d) => d.weightKg))!;
  const p = mean(prev.map((d) => d.weightKg))!;
  return { current: round2(c), previous: round2(p), change: round2(c - p), currentSamples: cur.length, previousSamples: prev.length };
}

/**
 * Linear trend in kg per week over a set of daily weights. Needs at least
 * four weigh-ins spanning ten or more days; otherwise returns null.
 */
export function weightTrendPerWeek(daily: DailyWeight[]): { kgPerWeek: number; samples: number; spanDays: number } | null {
  if (daily.length < 4) return null;
  const first = daily[0].date;
  const spanDays = daysBetween(first, daily[daily.length - 1].date);
  if (spanDays < 10) return null;
  const s = slope(daily.map((d) => ({ x: daysBetween(first, d.date), y: d.weightKg })));
  if (s === null) return null;
  return { kgPerWeek: round2(s * 7), samples: daily.length, spanDays };
}

/* ----------------------------------------------------------- measurements */

export interface MeasurementChange {
  key: MeasurementKey;
  first: { date: ISODate; value: number } | null;
  latest: { date: ISODate; value: number } | null;
  change: number | null;
  count: number;
}

/** First vs latest recorded value for every measurement, ignoring blanks. */
export function measurementChanges(rows: BodyMeasurement[]): MeasurementChange[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return MEASUREMENT_KEYS.map((key) => {
    const withValue = sorted.filter((r) => r[key] !== null);
    const first = withValue[0];
    const latest = withValue[withValue.length - 1];
    return {
      key,
      first: first ? { date: first.date, value: first[key]! } : null,
      latest: latest ? { date: latest.date, value: latest[key]! } : null,
      change: first && latest && first !== latest ? round2(latest[key]! - first[key]!) : null,
      count: withValue.length,
    };
  });
}

export function measurementSeries(rows: BodyMeasurement[], key: MeasurementKey): { date: ISODate; value: number }[] {
  return rows
    .filter((r) => r[key] !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, value: r[key]! }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
