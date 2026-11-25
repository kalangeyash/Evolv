import type { ISODate, WorkoutExercise, WorkoutSession, WorkoutSet } from "@/lib/db/types";
import { weekKey } from "@/lib/utils/dates";

/**
 * Training volume for one set = reps × load (kg). Summing over sets gives
 * sets × reps × load. Sets without both reps and load contribute nothing and
 * are counted separately so totals are never silently inflated or invented.
 */
export function setVolume(s: Pick<WorkoutSet, "reps" | "weightKg">): number | null {
  if (s.reps === null || s.weightKg === null) return null;
  return s.reps * s.weightKg;
}

export function volumeOf(sets: Pick<WorkoutSet, "reps" | "weightKg">[]): { volume: number; countedSets: number; uncountedSets: number } {
  let volume = 0;
  let countedSets = 0;
  for (const s of sets) {
    const v = setVolume(s);
    if (v === null) continue;
    volume += v;
    countedSets++;
  }
  return { volume: Math.round(volume * 10) / 10, countedSets, uncountedSets: sets.length - countedSets };
}

export function totalReps(sets: Pick<WorkoutSet, "reps">[]): number {
  return sets.reduce((a, s) => a + (s.reps ?? 0), 0);
}

/**
 * Estimated one-rep max using the Epley formula: 1RM = w × (1 + reps / 30).
 * Only computed for 1–10 reps, where the formula is reasonably reliable.
 * A single rep returns the lifted weight itself. Always presented as an estimate.
 */
export const E1RM_FORMULA = "Epley: weight × (1 + reps ÷ 30), for sets of 1–10 reps";
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null || weightKg <= 0 || reps < 1 || reps > 10) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface ExerciseRecord {
  name: string;
  muscleGroup: string | null;
  sessions: number;
  totalSets: number;
  maxWeight: { weightKg: number; reps: number | null; date: ISODate } | null;
  maxReps: { reps: number; weightKg: number | null; date: ISODate } | null;
  bestE1RM: { value: number; weightKg: number; reps: number; date: ISODate } | null;
  /** Per-session progression: heaviest set and best estimated 1RM. */
  progression: { date: ISODate; topWeight: number | null; bestE1RM: number | null; volume: number }[];
}

export function exerciseRecords(sessions: WorkoutSession[], exercises: WorkoutExercise[], sets: WorkoutSet[]): ExerciseRecord[] {
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const setsByExercise = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const l = setsByExercise.get(s.workoutExerciseId);
    if (l) l.push(s);
    else setsByExercise.set(s.workoutExerciseId, [s]);
  }
  const byName = new Map<string, { name: string; muscleGroup: string | null; items: { date: ISODate; sets: WorkoutSet[] }[] }>();
  for (const ex of exercises) {
    const date = sessionDate.get(ex.sessionId);
    if (!date) continue;
    const key = ex.name.trim().toLowerCase();
    const g = byName.get(key) ?? { name: ex.name, muscleGroup: ex.muscleGroup, items: [] };
    g.items.push({ date, sets: setsByExercise.get(ex.id) ?? [] });
    byName.set(key, g);
  }
  return [...byName.values()]
    .map((g) => {
      const rec: ExerciseRecord = {
        name: g.name,
        muscleGroup: g.muscleGroup,
        sessions: g.items.length,
        totalSets: 0,
        maxWeight: null,
        maxReps: null,
        bestE1RM: null,
        progression: [],
      };
      const byDate = new Map<string, WorkoutSet[]>();
      for (const it of g.items) {
        rec.totalSets += it.sets.length;
        byDate.set(it.date, [...(byDate.get(it.date) ?? []), ...it.sets]);
        for (const s of it.sets) {
          if (s.weightKg !== null && (!rec.maxWeight || s.weightKg > rec.maxWeight.weightKg)) {
            rec.maxWeight = { weightKg: s.weightKg, reps: s.reps, date: it.date };
          }
          if (s.reps !== null && (!rec.maxReps || s.reps > rec.maxReps.reps)) {
            rec.maxReps = { reps: s.reps, weightKg: s.weightKg, date: it.date };
          }
          const e = estimateOneRepMax(s.weightKg, s.reps);
          if (e !== null && (!rec.bestE1RM || e > rec.bestE1RM.value)) {
            rec.bestE1RM = { value: e, weightKg: s.weightKg!, reps: s.reps!, date: it.date };
          }
        }
      }
      rec.progression = [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, ss]) => {
          const weights = ss.map((s) => s.weightKg).filter((w): w is number => w !== null);
          const e1 = ss.map((s) => estimateOneRepMax(s.weightKg, s.reps)).filter((v): v is number => v !== null);
          return {
            date,
            topWeight: weights.length ? Math.max(...weights) : null,
            bestE1RM: e1.length ? Math.max(...e1) : null,
            volume: volumeOf(ss).volume,
          };
        });
      return rec;
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** Working sets per muscle group (sets logged for exercises in that group). */
export function muscleGroupDistribution(exercises: WorkoutExercise[], sets: WorkoutSet[]): { group: string; sets: number }[] {
  const setCount = new Map<string, number>();
  for (const s of sets) setCount.set(s.workoutExerciseId, (setCount.get(s.workoutExerciseId) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const ex of exercises) {
    const g = ex.muscleGroup || "Unassigned";
    out.set(g, (out.get(g) ?? 0) + (setCount.get(ex.id) ?? 0));
  }
  return [...out.entries()].map(([group, n]) => ({ group, sets: n })).filter((x) => x.sets > 0).sort((a, b) => b.sets - a.sets);
}

/** Sessions per ISO week (Monday start), for weeks that contain at least one session. */
export function weeklyFrequency(sessions: WorkoutSession[]): { week: ISODate; sessions: number; minutes: number | null }[] {
  const m = new Map<string, { sessions: number; minutes: number | null }>();
  for (const s of sessions) {
    const k = weekKey(s.date);
    const cur = m.get(k) ?? { sessions: 0, minutes: null };
    cur.sessions++;
    if (s.durationMin !== null) cur.minutes = (cur.minutes ?? 0) + s.durationMin;
    m.set(k, cur);
  }
  return [...m.entries()].map(([week, v]) => ({ week, ...v })).sort((a, b) => a.week.localeCompare(b.week));
}
