import { describe, expect, it } from "vitest";
import type { ActivityEntry, BodyMeasurement, FoodEntry, GoalVersion, WeightEntry, WorkoutExercise, WorkoutSession, WorkoutSet } from "@/lib/db/types";
import { goalsForDate, macroCalories, macroConsistency, progressState, targetMet } from "./goals";
import { consecutiveBelowTarget, cumulativeIntake, dayNutrition, frequentFoods, macroEnergyShare, mealBreakdown, nutritionSeries, periodNutrition } from "./nutrition";
import { bmi, bmiCategory, dailyWeights, measurementChanges, monthlyAverages, movingAverage, weeklyAverageChange, weeklyAverages, weightTrendPerWeek } from "./body";
import { activitySeries, goalMet, ringRatio, summarizeActivity } from "./activity";
import { estimateOneRepMax, exerciseRecords, muscleGroupDistribution, totalReps, volumeOf, weeklyFrequency } from "./workouts";
import { energyBalance, formulaMaintenance, mifflinStJeor, trendMaintenance } from "./energy";
import { generateInsights } from "./insights";
import { initialProfile } from "@/lib/db/seed";
import { dateRange, shiftDate } from "@/lib/utils/dates";

const T = "2026-01-01T00:00:00.000Z";
const goal = (over: Partial<GoalVersion> = {}): GoalVersion => ({
  id: "g1", effectiveFrom: "1970-01-01", calories: 2250, protein: 155, carbs: 220, fat: 70, fiber: 32,
  steps: 10000, moveCalories: 600, exerciseMinutes: 30, standHours: 12, targetWeightKg: 82, targetWaistCm: null,
  note: null, source: "profile", createdAt: T, updatedAt: T, ...over,
});

let n = 0;
const food = (date: string, v: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `f${n++}`, date, time: "08:00", order: n, entryNumber: null, mealCategory: "breakfast", mealLabel: null, mealName: "Oats",
  description: null, quantity: null, brand: null, calories: 500, protein: 30, carbs: 60, fat: 15, fiber: 8,
  foodScore: null, foodScoreScale: null, approximateFields: [], source: "manual", importId: null, corrected: false,
  correctedFields: [], original: null, notes: null, createdAt: T, updatedAt: T, ...v,
});
const weight = (date: string, kg: number): WeightEntry => ({ id: `w${n++}`, date, time: null, weightKg: kg, source: "manual", importId: null, note: null, createdAt: T, updatedAt: T });

describe("goals", () => {
  it("picks the version in force on each date", () => {
    const v = [goal({ id: "a", effectiveFrom: "1970-01-01" }), goal({ id: "b", effectiveFrom: "2026-11-20", protein: 170 })];
    expect(goalsForDate(v, "2026-11-19")?.id).toBe("a");
    expect(goalsForDate(v, "2026-11-20")?.id).toBe("b");
    expect(goalsForDate(v, "2027-01-01")?.protein).toBe(170);
  });

  it("derives calories from macros and flags material differences", () => {
    expect(macroCalories({ protein: 155, carbs: 220, fat: 70 })).toBe(2130);
    const c = macroConsistency({ calories: 2250, protein: 155, carbs: 220, fat: 70 });
    expect(c.difference).toBe(-120);
    expect(c.material).toBe(false);
    expect(macroConsistency({ calories: 3000, protein: 155, carbs: 220, fat: 70 }).material).toBe(true);
  });

  it("applies target rules per nutrient", () => {
    expect(targetMet("protein", 150, 155)).toBe(true); // ≥95%
    expect(targetMet("protein", 140, 155)).toBe(false);
    expect(targetMet("protein", 220, 155)).toBe(true);
    expect(targetMet("calories", 2350, 2250, 5)).toBe(true);
    expect(targetMet("calories", 2400, 2250, 5)).toBe(false);
    expect(targetMet("calories", null, 2250)).toBeNull();
    expect(progressState("calories", 1757, 2250)).toBe("below");
    expect(progressState("fat", 72, 70)).toBe("within");
  });
});

describe("nutrition", () => {
  it("sums days without treating missing values as zero", () => {
    const d = dayNutrition("2026-11-25", [food("2026-11-25"), food("2026-11-25", { fiber: null, protein: 20 })]);
    expect(d.totals).toEqual({ calories: 1000, protein: 50, carbs: 120, fat: 30, fiber: 8 });
    expect(d.missing.fiber).toBe(1);
    expect(dayNutrition("2026-11-25", [food("2026-11-25", { fiber: null })]).totals.fiber).toBeNull();
    expect(dayNutrition("2026-11-26", []).logged).toBe(false);
  });

  it("averages weekly and monthly over logged days only", () => {
    const entries = [food("2026-11-02", { calories: 2000, protein: 160 }), food("2026-11-04", { calories: 1800, protein: 120 })];
    const s = nutritionSeries("2026-11-02", "2026-11-08", entries, []);
    expect(s).toHaveLength(7);
    const p = periodNutrition(s, [goal()]);
    expect(p.loggedDays).toBe(2);
    expect(p.averages.calories).toBe(1900);
    expect(p.averages.protein).toBe(140);
    expect(p.targetMetDays.protein).toEqual({ met: 1, of: 2 });
    expect(p.highest.protein?.date).toBe("2026-11-02");
    expect(p.lowest.protein?.date).toBe("2026-11-04");
    const month = periodNutrition(nutritionSeries("2026-11-01", "2026-11-30", entries, []), [goal()]);
    expect(month.days).toBe(30);
    expect(month.averages.calories).toBe(1900);
  });

  it("counts consecutive logged days below target, skipping gaps", () => {
    const entries = ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-06"].map((d, i) => food(d, { fiber: i === 0 ? 40 : 10 }));
    const s = nutritionSeries("2026-11-01", "2026-11-07", entries, []);
    expect(consecutiveBelowTarget(s, "fiber", [goal()])).toEqual({ count: 3, since: "2026-11-02" });
  });

  it("breaks down meals, macro energy share and frequent foods", () => {
    const es = [food("2026-11-01"), food("2026-11-01", { mealCategory: "dinner", mealName: "Dal", protein: 20 }), food("2026-11-02")];
    const mb = mealBreakdown(es);
    expect(mb.map((m) => m.category)).toEqual(["breakfast", "dinner"]);
    expect(mb[0].totals.protein).toBe(60);
    const share = macroEnergyShare({ calories: 2130, protein: 155, carbs: 220, fat: 70, fiber: null })!;
    expect(Math.round(share.protein)).toBe(29);
    expect(Math.round(share.protein + share.carbs + share.fat)).toBe(100);
    expect(frequentFoods(es)[0]).toMatchObject({ name: "Oats", count: 2 });
  });

  it("builds a cumulative intake line and flags partial sums", () => {
    const pts = cumulativeIntake([food("d", { time: "13:00", calories: null }), food("d", { time: "08:00" }), food("d", { time: null })]);
    expect(pts.map((p) => [p.time, p.calories, p.partial])).toEqual([["08:00", 500, false], ["13:00", 500, true]]);
  });
});

describe("body", () => {
  it("computes BMI and categories", () => {
    expect(bmi(90, 182.9)).toBe(26.9);
    expect(bmiCategory(26.9)).toEqual({ who: "Overweight", asianIndian: "Obesity" });
    expect(bmi(null, 180)).toBeNull();
  });

  it("averages same-day readings and computes a 7-day moving average", () => {
    const d = dailyWeights([weight("2026-11-01", 90), weight("2026-11-01", 91), weight("2026-11-03", 89), weight("2026-11-09", 88)]);
    expect(d.map((x) => x.weightKg)).toEqual([90.5, 89, 88]);
    const ma = movingAverage(d);
    expect(ma[1]).toMatchObject({ average: 89.75, samples: 2 });
    expect(ma[2]).toMatchObject({ average: 88.5, samples: 2 }); // 03 and 09 are inside 03–09
  });

  it("weekly change needs two readings per window", () => {
    const d = dailyWeights([weight("2026-11-03", 90), weight("2026-11-05", 89.8), weight("2026-11-10", 89.6), weight("2026-11-12", 89.2)]);
    expect(weeklyAverageChange(d, "2026-11-12")).toMatchObject({ current: 89.4, previous: 89.9, change: -0.5 });
    expect(weeklyAverageChange(d.slice(0, 3), "2026-11-12")).toBeNull();
  });

  it("weekly/monthly averages and trend slope", () => {
    const d = dailyWeights(dateRange("2026-11-01", "2026-11-28").map((date, i) => weight(date, 90 - i * 0.05)));
    expect(weeklyAverages(d)).toHaveLength(5);
    expect(monthlyAverages(d)).toEqual([expect.objectContaining({ key: "2026-11", samples: 28 })]);
    expect(weightTrendPerWeek(d)?.kgPerWeek).toBe(-0.35);
    expect(weightTrendPerWeek(d.slice(0, 3))).toBeNull();
  });

  it("compares measurements first vs latest, ignoring blanks", () => {
    const m = (date: string, waist: number | null, arm: number | null): BodyMeasurement => ({
      id: date, date, waistCm: waist, chestCm: null, armCm: arm, thighCm: null, hipCm: null, bodyFatPct: null, source: "manual", note: null, createdAt: T, updatedAt: T,
    });
    const c = measurementChanges([m("2026-11-20", 94, 36), m("2026-11-01", 96, null), m("2026-11-10", null, 35.5)]);
    expect(c.find((x) => x.key === "waistCm")).toMatchObject({ change: -2, count: 2 });
    expect(c.find((x) => x.key === "armCm")).toMatchObject({ change: 0.5 });
    expect(c.find((x) => x.key === "chestCm")).toMatchObject({ change: null, count: 0 });
  });
});

describe("activity", () => {
  const act = (date: string, v: Partial<ActivityEntry>): ActivityEntry => ({
    id: date, date, moveCalories: null, moveGoal: null, exerciseMinutes: null, exerciseGoal: null, standHours: null, standGoal: null,
    steps: null, distanceKm: null, source: "import", importId: null, corrected: false, correctedFields: [], notes: null, createdAt: T, updatedAt: T, ...v,
  });
  it("computes ring ratios beyond 100% and goal completion", () => {
    expect(ringRatio(642, 600)).toBeCloseTo(1.07);
    expect(goalMet(11, 12)).toBe(false);
    expect(goalMet(5, null)).toBeNull();
  });
  it("summarises steps, distance and minutes over days with data", () => {
    const days = activitySeries("2026-11-01", "2026-11-07", [
      act("2026-11-01", { steps: 10000, distanceKm: 7, exerciseMinutes: 40, exerciseGoal: 30, moveCalories: 500, moveGoal: 600 }),
      act("2026-11-03", { steps: 6000, distanceKm: 4.2, exerciseMinutes: 20 }),
    ], [goal()]);
    const s = summarizeActivity(days);
    expect(s).toMatchObject({ daysWithData: 2, days: 7, avgSteps: 8000, totalDistanceKm: 11.2, totalExerciseMin: 60 });
    expect(s.exerciseGoalMet).toEqual({ met: 1, of: 2 }); // day 2 falls back to goal version (30)
    expect(s.moveGoalMet).toEqual({ met: 0, of: 1 });
    expect(s.stepGoalMet).toEqual({ met: 1, of: 2 });
  });
});

describe("workouts", () => {
  const session = (id: string, date: string): WorkoutSession => ({ id, date, startTime: null, name: "Push", type: "strength", durationMin: 60, distanceKm: null, calories: null, avgHeartRate: null, avgSpeedKmh: null, notes: null, source: "manual", importId: null, createdAt: T, updatedAt: T });
  const ex = (id: string, sessionId: string, name = "Bench press"): WorkoutExercise => ({ id, sessionId, exerciseId: null, name, muscleGroup: "Chest", order: 0, notes: null, createdAt: T, updatedAt: T });
  const set = (exId: string, sessionId: string, reps: number | null, w: number | null): WorkoutSet => ({ id: `s${n++}`, sessionId, workoutExerciseId: exId, setNumber: 1, reps, weightKg: w, restSec: null, notes: null, createdAt: T, updatedAt: T });

  it("computes volume as reps × load, skipping incomplete sets", () => {
    expect(volumeOf([{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 10, weightKg: null }])).toEqual({ volume: 960, countedSets: 2, uncountedSets: 1 });
    expect(totalReps([{ reps: 8 }, { reps: null }, { reps: 5 }])).toBe(13);
  });

  it("estimates 1RM with Epley within 1–10 reps only", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(60, 8)).toBe(76);
    expect(estimateOneRepMax(60, 12)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
  });

  it("tracks personal records and progression", () => {
    const sessions = [session("a", "2026-11-01"), session("b", "2026-11-08")];
    const exercises = [ex("ea", "a"), ex("eb", "b")];
    const sets = [set("ea", "a", 8, 60), set("ea", "a", 12, 50), set("eb", "b", 5, 70)];
    const [rec] = exerciseRecords(sessions, exercises, sets);
    expect(rec.maxWeight).toEqual({ weightKg: 70, reps: 5, date: "2026-11-08" });
    expect(rec.maxReps).toEqual({ reps: 12, weightKg: 50, date: "2026-11-01" });
    expect(rec.bestE1RM).toMatchObject({ value: 81.7, weightKg: 70, reps: 5 });
    expect(rec.progression.map((p) => p.topWeight)).toEqual([60, 70]);
    expect(muscleGroupDistribution(exercises, sets)).toEqual([{ group: "Chest", sets: 3 }]);
    expect(weeklyFrequency(sessions)).toHaveLength(2);
  });
});

describe("energy", () => {
  it("uses Mifflin–St Jeor only with complete inputs", () => {
    expect(mifflinStJeor(90, 183, 30, "male")).toBe(1899);
    expect(mifflinStJeor(90, 183, 30, "other")).toBeNull();
    const p = initialProfile(T);
    const m = formulaMaintenance(p, 90, "2026-11-25");
    expect(m.confidence).toBe("insufficient");
    expect(m.missingInputs).toEqual(expect.arrayContaining(["age or date of birth", "daily activity level"]));
    const full = formulaMaintenance({ ...p, ageYears: 30, sex: "male", activityLevel: "moderate" }, 90, "2026-11-25");
    // 10×90 + 6.25×182.9 − 5×30 + 5 = 1898 kcal resting; × 1.55 moderate = 2942
    expect(full).toMatchObject({ kcal: 2942, confidence: "estimated" });
    expect(formulaMaintenance({ ...p, maintenanceCaloriesOverride: 2600 }, null, "2026-11-25")).toMatchObject({ kcal: 2600, confidence: "user" });
  });

  it("never computes a balance from incomplete data", () => {
    const day = dayNutrition("d", [food("d", { calories: 1757 })]);
    expect(energyBalance(day, { kcal: null, confidence: "insufficient", method: "", assumptions: [], missingInputs: ["age"] }).balance).toBeNull();
    expect(energyBalance(day, { kcal: 2600, confidence: "user", method: "", assumptions: [], missingInputs: [] }).balance).toBe(-843);
    const partial = dayNutrition("d", [food("d"), food("d", { calories: null })]);
    expect(energyBalance(partial, { kcal: 2600, confidence: "user", method: "", assumptions: [], missingInputs: [] }).balance).toBeNull();
  });

  it("infers maintenance from intake and weight trend when data suffices", () => {
    const dates = dateRange("2026-11-01", "2026-11-28");
    const series = nutritionSeries("2026-11-01", "2026-11-28", dates.map((d) => food(d, { calories: 2200 })), []);
    const weights = dailyWeights(dates.filter((_, i) => i % 2 === 0).map((d, i) => weight(d, 90 - i * 0.05)));
    const t = trendMaintenance(series, weights);
    expect(t.confidence).toBe("estimated");
    expect(t.kcal).toBeGreaterThan(2200);
    expect(trendMaintenance(series.slice(0, 10), weights).confidence).toBe("insufficient");
  });
});

describe("insights", () => {
  it("requires enough data and cites evidence", () => {
    const today = "2026-11-28";
    const dates = dateRange(shiftDate(today, -55), today);
    const empty = generateInsights({ today, nutrition: nutritionSeries(dates[0], today, [], []), food: [], goals: [goal()], activity: [], weights: [], measurements: [], sessions: [], exercises: [], sets: [], calorieTolerancePct: 5 });
    expect(empty).toEqual([]);

    const recent = dates.slice(-10);
    const fd = recent.map((d) => food(d, { protein: 90, fiber: 12, calories: 2200 }));
    const ins = generateInsights({ today, nutrition: nutritionSeries(dates[0], today, fd, []), food: fd, goals: [goal()], activity: [], weights: [], measurements: [], sessions: [], exercises: [], sets: [], calorieTolerancePct: 5 });
    const protein = ins.find((i) => i.id === "protein-below")!;
    expect(protein.observation).toBe("Protein reached at least 95% of target on 0 of 10 logged days.");
    expect(protein.evidence).toContain("90 g/day");
    expect(ins.some((i) => i.id === "fiber-low")).toBe(true);
    expect(ins.some((i) => i.id === "calories-vs-target")).toBe(false); // 2200 is within 10%
  });
});
