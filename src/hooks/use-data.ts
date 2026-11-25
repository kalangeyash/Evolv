"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/db";
import type { ISODate } from "@/lib/db/types";

/**
 * Live IndexedDB queries. Each hook re-renders when the underlying tables
 * change, so edits anywhere flow through every screen. `undefined` means
 * "still loading" and must be distinguished from empty results.
 */

export const useProfile = () => useLiveQuery(() => getDb().userProfiles.get("primary"), []);
export const useSettings = () => useLiveQuery(() => getDb().applicationSettings.get("app"), []);
export const useGoals = () => useLiveQuery(() => getDb().goalVersions.orderBy("effectiveFrom").toArray(), []);

export const useFoodForDate = (date: ISODate) =>
  useLiveQuery(() => getDb().foodEntries.where("[date+order]").between([date, -Infinity], [date, Infinity]).toArray(), [date]);

export const useFoodRange = (start: ISODate, end: ISODate) =>
  useLiveQuery(() => getDb().foodEntries.where("date").between(start, end, true, true).toArray(), [start, end]);

export const useAllFood = () => useLiveQuery(() => getDb().foodEntries.toArray(), []);

export const useOverridesRange = (start: ISODate, end: ISODate) =>
  useLiveQuery(() => getDb().dailyNutritionSummaries.where("date").between(start, end, true, true).toArray(), [start, end]);

export const useOverrideForDate = (date: ISODate) =>
  useLiveQuery(async () => (await getDb().dailyNutritionSummaries.where("date").equals(date).first()) ?? null, [date]);

export const useActivityRange = (start: ISODate, end: ISODate) =>
  useLiveQuery(() => getDb().activityEntries.where("date").between(start, end, true, true).toArray(), [start, end]);

export const useActivityForDate = (date: ISODate) =>
  useLiveQuery(async () => (await getDb().activityEntries.where("date").equals(date).first()) ?? null, [date]);

export const useWeights = () => useLiveQuery(() => getDb().weightEntries.orderBy("date").toArray(), []);
export const useMeasurements = () => useLiveQuery(() => getDb().bodyMeasurements.orderBy("date").toArray(), []);

export const useWorkoutData = () =>
  useLiveQuery(async () => {
    const db = getDb();
    const [sessions, exercises, sets] = await Promise.all([
      db.workoutSessions.orderBy("date").toArray(),
      db.workoutExercises.toArray(),
      db.workoutSets.toArray(),
    ]);
    return { sessions, exercises, sets };
  }, []);

export const useExerciseLibrary = () => useLiveQuery(() => getDb().exerciseLibrary.orderBy("name").toArray(), []);

export const useImports = () => useLiveQuery(() => getDb().dailyImports.orderBy("date").reverse().toArray(), []);
export const useImportsForDate = (date: ISODate) =>
  useLiveQuery(() => getDb().dailyImports.where("date").equals(date).toArray(), [date]);
