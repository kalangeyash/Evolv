import type { ActivityEntry, GoalVersion, ISODate } from "@/lib/db/types";
import { dateRange } from "@/lib/utils/dates";
import { goalsForDate } from "./goals";
import { mean, sum } from "./stats";

/** value / goal, unclamped (1.4 = 140%). Null if either is missing. */
export function ringRatio(value: number | null, goal: number | null): number | null {
  if (value === null || goal === null || goal <= 0) return null;
  return value / goal;
}

export function goalMet(value: number | null, goal: number | null): boolean | null {
  const r = ringRatio(value, goal);
  return r === null ? null : r >= 1;
}

/**
 * Effective ring goals for a day: the goal stored with the day's activity
 * record (from the Apple Watch report) wins; otherwise the goal version
 * in force on that day.
 */
export function effectiveActivityGoals(a: ActivityEntry | null | undefined, g: GoalVersion | null) {
  return {
    move: a?.moveGoal ?? g?.moveCalories ?? null,
    exercise: a?.exerciseGoal ?? g?.exerciseMinutes ?? null,
    stand: a?.standGoal ?? g?.standHours ?? null,
    steps: g?.steps ?? null,
  };
}

export interface ActivityDay {
  date: ISODate;
  entry: ActivityEntry | null;
  goals: ReturnType<typeof effectiveActivityGoals>;
}

export function activitySeries(start: ISODate, end: ISODate, entries: ActivityEntry[], goals: GoalVersion[]): ActivityDay[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return dateRange(start, end).map((date) => {
    const entry = byDate.get(date) ?? null;
    return { date, entry, goals: effectiveActivityGoals(entry, goalsForDate(goals, date)) };
  });
}

export interface ActivitySummary {
  daysWithData: number;
  days: number;
  avgSteps: number | null;
  avgMove: number | null;
  avgExercise: number | null;
  avgStand: number | null;
  totalDistanceKm: number | null;
  totalExerciseMin: number | null;
  moveGoalMet: { met: number; of: number };
  exerciseGoalMet: { met: number; of: number };
  standGoalMet: { met: number; of: number };
  stepGoalMet: { met: number; of: number };
}

function countMet(days: ActivityDay[], v: (d: ActivityDay) => number | null, g: (d: ActivityDay) => number | null) {
  let met = 0;
  let of = 0;
  for (const d of days) {
    const r = goalMet(v(d), g(d));
    if (r !== null) {
      of++;
      if (r) met++;
    }
  }
  return { met, of };
}

/** Averages use only days that have an activity record; missing days are not zeros. */
export function summarizeActivity(days: ActivityDay[]): ActivitySummary {
  const withData = days.filter((d) => d.entry);
  const e = (f: (a: ActivityEntry) => number | null) => withData.map((d) => f(d.entry!));
  const r1 = (v: number | null, dp = 0) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
  return {
    daysWithData: withData.length,
    days: days.length,
    avgSteps: r1(mean(e((a) => a.steps))),
    avgMove: r1(mean(e((a) => a.moveCalories))),
    avgExercise: r1(mean(e((a) => a.exerciseMinutes))),
    avgStand: r1(mean(e((a) => a.standHours)), 1),
    totalDistanceKm: r1(sum(e((a) => a.distanceKm)), 1),
    totalExerciseMin: r1(sum(e((a) => a.exerciseMinutes))),
    moveGoalMet: countMet(withData, (d) => d.entry!.moveCalories, (d) => d.goals.move),
    exerciseGoalMet: countMet(withData, (d) => d.entry!.exerciseMinutes, (d) => d.goals.exercise),
    standGoalMet: countMet(withData, (d) => d.entry!.standHours, (d) => d.goals.stand),
    stepGoalMet: countMet(withData, (d) => d.entry!.steps, (d) => d.goals.steps),
  };
}
