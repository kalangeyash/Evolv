import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  ActivityEntry,
  AppSettings,
  BodyMeasurement,
  DailyImport,
  DailyNutritionSummary,
  ExerciseDefinition,
  FoodEntry,
  GoalVersion,
  UserProfile,
  WeightEntry,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "./types";
import {
  INITIAL_WEIGHT_KG,
  initialExercises,
  initialGoals,
  initialProfile,
  initialSettings,
} from "./seed";
import { newId, nowIso } from "@/lib/utils/ids";
import { todayISO } from "@/lib/utils/dates";

export const DB_NAME = "evolv";

/**
 * Current schema version. Bump this and add a `this.version(n)` block with an
 * `upgrade()` function for every structural change — never edit an old
 * version block, because existing installs replay them in order.
 */
export const DB_SCHEMA_VERSION = 1;

export class EvolvDB extends Dexie {
  userProfiles!: EntityTable<UserProfile, "id">;
  goalVersions!: EntityTable<GoalVersion, "id">;
  dailyImports!: EntityTable<DailyImport, "id">;
  dailyNutritionSummaries!: EntityTable<DailyNutritionSummary, "id">;
  foodEntries!: EntityTable<FoodEntry, "id">;
  activityEntries!: EntityTable<ActivityEntry, "id">;
  workoutSessions!: EntityTable<WorkoutSession, "id">;
  workoutExercises!: EntityTable<WorkoutExercise, "id">;
  workoutSets!: EntityTable<WorkoutSet, "id">;
  weightEntries!: EntityTable<WeightEntry, "id">;
  bodyMeasurements!: EntityTable<BodyMeasurement, "id">;
  exerciseLibrary!: EntityTable<ExerciseDefinition, "id">;
  applicationSettings!: EntityTable<AppSettings, "id">;

  constructor(name = DB_NAME) {
    super(name);

    // v1 — initial schema. Only indexed fields are listed.
    this.version(1).stores({
      userProfiles: "id",
      goalVersions: "id, effectiveFrom",
      dailyImports: "id, date, contentHash, fingerprint, status",
      dailyNutritionSummaries: "id, &date",
      foodEntries: "id, date, [date+order], mealCategory, importId, mealName",
      activityEntries: "id, &date, importId",
      workoutSessions: "id, date, type, importId",
      workoutExercises: "id, sessionId, exerciseId, name",
      workoutSets: "id, sessionId, workoutExerciseId",
      weightEntries: "id, date, importId",
      bodyMeasurements: "id, date",
      exerciseLibrary: "id, &name, muscleGroup",
      applicationSettings: "id",
    });

    // Runs exactly once, when the database is first created.
    this.on("populate", (tx) => {
      const now = nowIso();
      tx.table("userProfiles").add(initialProfile(now));
      tx.table("goalVersions").add(initialGoals(now));
      tx.table("applicationSettings").add(initialSettings(now));
      tx.table("exerciseLibrary").bulkAdd(initialExercises(now));
      // The brief states a current weight of 90 kg; record it as a weigh-in
      // on the day EVOLV is first opened, labelled as coming from the profile.
      tx.table("weightEntries").add({
        id: newId("w"),
        date: todayISO(),
        time: null,
        weightKg: INITIAL_WEIGHT_KG,
        source: "profile",
        importId: null,
        note: "Starting weight from profile setup",
        createdAt: now,
        updatedAt: now,
      } satisfies WeightEntry);
    });
  }

  /** Every table, for backup/restore/clear operations. */
  get allTables(): Table[] {
    return this.tables;
  }
}

let instance: EvolvDB | null = null;

/** Lazily created singleton so nothing touches IndexedDB during static prerender. */
export function getDb(): EvolvDB {
  if (!instance) instance = new EvolvDB();
  return instance;
}

/** Test helper: point the singleton at a fresh database. */
export async function resetDbForTests(name = `evolv-test-${Math.random()}`) {
  if (instance) {
    instance.close();
  }
  instance = new EvolvDB(name);
  await instance.open();
  return instance;
}

/**
 * Ask the browser to treat EVOLV's storage as persistent so it is not evicted
 * under storage pressure. Returns whether persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return null;
  }
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Map low-level storage errors to a message the user can act on. */
export function describeDbError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const inner = (err as { inner?: { name?: string } })?.inner?.name ?? "";
  if (name === "QuotaExceededError" || inner === "QuotaExceededError") {
    return "The browser has run out of storage space for EVOLV. Export a backup, free up disk space, then try again.";
  }
  if (name === "ConstraintError" || inner === "ConstraintError") {
    return "This would create a duplicate record, so nothing was saved.";
  }
  if (name === "DatabaseClosedError" || name === "MissingAPIError") {
    return "Local storage is unavailable. Private browsing modes can block IndexedDB; open EVOLV in a normal window.";
  }
  const msg = (err as Error)?.message;
  return msg ? `Saving failed: ${msg}` : "Saving failed for an unknown reason. Nothing was changed.";
}
