import type { ActivityLevel, ISODate, Sex, UserProfile } from "@/lib/db/types";
import { ageOn, daysBetween } from "@/lib/utils/dates";
import type { DayNutrition } from "./nutrition";
import type { DailyWeight } from "./body";
import { mean } from "./stats";

/**
 * Energy-balance estimates.
 *
 * Apple Watch "Move" calories are ACTIVE energy only. They are not total
 * daily energy expenditure (TDEE), so EVOLV never computes a deficit as
 * intake − Move calories.
 */

export type Confidence = "user" | "calculated" | "estimated" | "insufficient";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  user: "User provided",
  calculated: "Calculated",
  estimated: "Estimated",
  insufficient: "Insufficient data",
};

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: "Sedentary (little or no exercise)" },
  light: { factor: 1.375, label: "Lightly active (1–3 days/week)" },
  moderate: { factor: 1.55, label: "Moderately active (3–5 days/week)" },
  very: { factor: 1.725, label: "Very active (6–7 days/week)" },
  extra: { factor: 1.9, label: "Extra active (physical job + training)" },
};

/** Mifflin–St Jeor resting energy (kcal/day). Requires sex male/female. */
export function mifflinStJeor(weightKg: number, heightCm: number, ageYears: number, sex: Sex): number | null {
  if (sex !== "male" && sex !== "female") return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export interface MaintenanceEstimate {
  kcal: number | null;
  confidence: Confidence;
  method: string;
  assumptions: string[];
  missingInputs: string[];
}

export function profileAge(p: UserProfile, on: ISODate): number | null {
  if (p.dateOfBirth) return ageOn(p.dateOfBirth, on);
  return p.ageYears;
}

/** Maintenance from the user's own figure, else Mifflin–St Jeor × activity factor. */
export function formulaMaintenance(p: UserProfile, weightKg: number | null, on: ISODate): MaintenanceEstimate {
  if (p.maintenanceCaloriesOverride) {
    return {
      kcal: p.maintenanceCaloriesOverride,
      confidence: "user",
      method: "Your own maintenance estimate (Profile).",
      assumptions: [],
      missingInputs: [],
    };
  }
  const age = profileAge(p, on);
  const missing: string[] = [];
  if (weightKg === null) missing.push("a recent weight");
  if (!p.heightCm) missing.push("height");
  if (age === null) missing.push("age or date of birth");
  if (p.sex !== "male" && p.sex !== "female") missing.push("sex (male/female, used by the formula)");
  if (!p.activityLevel) missing.push("daily activity level");
  if (missing.length) {
    return { kcal: null, confidence: "insufficient", method: "Mifflin–St Jeor × activity factor", assumptions: [], missingInputs: missing };
  }
  const bmr = mifflinStJeor(weightKg!, p.heightCm!, age!, p.sex!)!;
  const f = ACTIVITY_FACTORS[p.activityLevel!];
  return {
    kcal: Math.round(bmr * f.factor),
    confidence: "estimated",
    method: "Mifflin–St Jeor resting energy × activity factor",
    assumptions: [
      `Resting energy ${bmr} kcal from weight ${weightKg} kg, height ${p.heightCm} cm, age ${age}.`,
      `Activity factor ${f.factor} (${f.label}).`,
      "Population formulas typically err by ±10% or more for an individual.",
    ],
    missingInputs: [],
  };
}

/**
 * Maintenance inferred from your own data: average intake minus the energy
 * equivalent of the weight trend (≈7,700 kcal per kg, a common approximation).
 * Needs ≥14 days, ≥10 logged intake days, and ≥2 weigh-ins in each of the
 * first and last weeks of the window.
 */
export const KCAL_PER_KG = 7700;
export function trendMaintenance(days: DayNutrition[], weights: DailyWeight[]): MaintenanceEstimate & { avgIntake: number | null; weightChangeKg: number | null } {
  const fail = (missing: string[]) => ({
    kcal: null,
    confidence: "insufficient" as const,
    method: "Intake vs weight trend",
    assumptions: [],
    missingInputs: missing,
    avgIntake: null,
    weightChangeKg: null,
  });
  if (days.length < 14) return fail(["at least 14 days in the selected range"]);
  const logged = days.filter((d) => d.logged && d.totals.calories !== null && d.missing.calories === 0);
  const start = days[0].date;
  const end = days[days.length - 1].date;
  const span = daysBetween(start, end) + 1;
  const inRange = weights.filter((w) => w.date >= start && w.date <= end);
  const firstWeek = inRange.filter((w) => daysBetween(start, w.date) < 7);
  const lastWeek = inRange.filter((w) => daysBetween(w.date, end) < 7);
  const missing: string[] = [];
  if (logged.length < 10) missing.push(`complete calorie logs on at least 10 days (have ${logged.length})`);
  if (firstWeek.length < 2 || lastWeek.length < 2) missing.push("at least two weigh-ins in both the first and last week of the range");
  if (missing.length) return fail(missing);
  const avgIntake = mean(logged.map((d) => d.totals.calories))!;
  const change = mean(lastWeek.map((w) => w.weightKg))! - mean(firstWeek.map((w) => w.weightKg))!;
  const elapsed = Math.max(7, span - 7); // distance between the centres of the two weekly windows
  const kcal = Math.round(avgIntake - (change * KCAL_PER_KG) / elapsed);
  return {
    kcal,
    confidence: "estimated",
    method: "Average intake minus energy equivalent of weight trend",
    assumptions: [
      `Average logged intake ${Math.round(avgIntake)} kcal over ${logged.length} days.`,
      `Weekly-average weight changed ${change >= 0 ? "+" : ""}${change.toFixed(2)} kg over about ${elapsed} days.`,
      `Assumes ~${KCAL_PER_KG.toLocaleString("en-IN")} kcal per kg of body-weight change and that unlogged days resemble logged ones.`,
      "Water, glycogen and gut content shift scale weight, so short windows are noisy.",
    ],
    missingInputs: [],
    avgIntake: Math.round(avgIntake),
    weightChangeKg: Math.round(change * 100) / 100,
  };
}

export interface EnergyBalance {
  intake: number | null;
  maintenance: number | null;
  balance: number | null;
  confidence: Confidence;
  reason: string | null;
}

/** intake − maintenance. Negative = estimated deficit. Never computed with missing inputs. */
export function energyBalance(day: DayNutrition | null, m: MaintenanceEstimate): EnergyBalance {
  if (!day || !day.logged || day.totals.calories === null) {
    return { intake: null, maintenance: m.kcal, balance: null, confidence: "insufficient", reason: "No calorie intake logged for this day." };
  }
  if (day.missing.calories > 0 && day.source === "entries") {
    return {
      intake: day.totals.calories,
      maintenance: m.kcal,
      balance: null,
      confidence: "insufficient",
      reason: `${day.missing.calories} entr${day.missing.calories === 1 ? "y is" : "ies are"} missing calories, so intake is incomplete.`,
    };
  }
  if (m.kcal === null) {
    return { intake: day.totals.calories, maintenance: null, balance: null, confidence: "insufficient", reason: `Maintenance unknown: needs ${m.missingInputs.join(", ")}.` };
  }
  return {
    intake: day.totals.calories,
    maintenance: m.kcal,
    balance: Math.round(day.totals.calories - m.kcal),
    confidence: m.confidence === "user" ? "user" : "estimated",
    reason: null,
  };
}
