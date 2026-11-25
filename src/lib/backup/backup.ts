/**
 * Versioned JSON backups, validated restore, CSV exports and data clearing.
 *
 * Restore is atomic: the backup is fully validated first, then every table
 * is cleared and refilled inside ONE IndexedDB transaction. If any write
 * fails, the transaction aborts and the existing data is left untouched.
 */
import { z } from "zod";
import { DB_SCHEMA_VERSION, getDb } from "@/lib/db/db";
import { initialExercises, initialGoals, initialProfile, initialSettings } from "@/lib/db/seed";
import { nowIso } from "@/lib/utils/ids";

export const BACKUP_FORMAT = "evolv-backup";
export const BACKUP_FORMAT_VERSION = 1;

export const TABLE_NAMES = [
  "userProfiles",
  "goalVersions",
  "dailyImports",
  "dailyNutritionSummaries",
  "foodEntries",
  "activityEntries",
  "workoutSessions",
  "workoutExercises",
  "workoutSets",
  "weightEntries",
  "bodyMeasurements",
  "exerciseLibrary",
  "applicationSettings",
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: Record<TableName, number>;
  data: Record<TableName, Record<string, unknown>[]>;
}

/* ----------------------------------------------------------------- export */

export async function createBackup(): Promise<BackupFile> {
  const db = getDb();
  const data = {} as BackupFile["data"];
  const counts = {} as BackupFile["counts"];
  await db.transaction("r", TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) {
      data[t] = await db.table(t).toArray();
      counts[t] = data[t].length;
    }
  });
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
    exportedAt: nowIso(),
    counts,
    data,
  };
}

export async function markBackupTaken(at = nowIso()) {
  await getDb().applicationSettings.update("app", { lastBackupAt: at, updatedAt: at });
}

/* ------------------------------------------------------------- validation */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-MM-dd");
const nullableNum = z.number().finite().nullable();
const base = { id: z.string().min(1), createdAt: z.string(), updatedAt: z.string() };

const schemas: Record<TableName, z.ZodTypeAny> = {
  userProfiles: z.looseObject({ ...base, id: z.literal("primary"), heightCm: nullableNum }),
  goalVersions: z.looseObject({
    ...base,
    effectiveFrom: isoDate,
    calories: z.number().positive(),
    protein: z.number().positive(),
    carbs: z.number().positive(),
    fat: z.number().positive(),
    fiber: z.number().positive(),
  }),
  dailyImports: z.looseObject({ ...base, date: isoDate, rawText: z.string(), contentHash: z.string(), status: z.enum(["active", "replaced"]) }),
  dailyNutritionSummaries: z.looseObject({ ...base, date: isoDate, mode: z.literal("reported"), totals: z.record(z.string(), nullableNum) }),
  foodEntries: z.looseObject({
    ...base,
    date: isoDate,
    mealName: z.string(),
    mealCategory: z.enum(["breakfast", "morning_snack", "lunch", "evening_snack", "dinner", "other"]),
    order: z.number(),
    calories: nullableNum,
    protein: nullableNum,
    carbs: nullableNum,
    fat: nullableNum,
    fiber: nullableNum,
    source: z.string(),
  }),
  activityEntries: z.looseObject({ ...base, date: isoDate, steps: nullableNum, moveCalories: nullableNum }),
  workoutSessions: z.looseObject({ ...base, date: isoDate, name: z.string(), type: z.string() }),
  workoutExercises: z.looseObject({ ...base, sessionId: z.string(), name: z.string() }),
  workoutSets: z.looseObject({ ...base, sessionId: z.string(), workoutExerciseId: z.string(), reps: nullableNum, weightKg: nullableNum }),
  weightEntries: z.looseObject({ ...base, date: isoDate, weightKg: z.number().positive() }),
  bodyMeasurements: z.looseObject({ ...base, date: isoDate }),
  exerciseLibrary: z.looseObject({ ...base, name: z.string().min(1), muscleGroup: z.string() }),
  applicationSettings: z.looseObject({ ...base, id: z.literal("app") }),
};

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  backup: BackupFile | null;
}

/** Parse and validate a backup file's text. Never touches the database. */
export function validateBackupText(text: string): BackupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON. It may be truncated or not an EVOLV backup."], warnings, backup: null };
  }
  const head = z
    .object({
      format: z.literal(BACKUP_FORMAT),
      formatVersion: z.number().int(),
      schemaVersion: z.number().int(),
      exportedAt: z.string(),
      data: z.record(z.string(), z.array(z.unknown())),
    })
    .safeParse(json);
  if (!head.success) {
    return { ok: false, errors: ["This file is not an EVOLV backup (missing format header or data section)."], warnings, backup: null };
  }
  const b = json as BackupFile;
  if (b.formatVersion > BACKUP_FORMAT_VERSION) {
    errors.push(`This backup was made by a newer version of EVOLV (format ${b.formatVersion}). Update EVOLV before restoring it.`);
  }
  if (b.schemaVersion > DB_SCHEMA_VERSION) {
    errors.push(`This backup uses database schema ${b.schemaVersion}, newer than this app (${DB_SCHEMA_VERSION}).`);
  }
  for (const t of TABLE_NAMES) {
    const rows = b.data[t];
    if (rows === undefined) {
      errors.push(`Missing table “${t}”.`);
      continue;
    }
    const ids = new Set<string>();
    rows.forEach((row, i) => {
      const r = schemas[t].safeParse(row);
      if (!r.success) {
        if (errors.length < 25) {
          const issue = r.error.issues[0];
          errors.push(`${t} row ${i + 1}: ${issue.path.join(".") || "record"} — ${issue.message}`);
        }
        return;
      }
      const id = (row as { id: string }).id;
      if (ids.has(id)) errors.push(`${t}: duplicate id ${id}.`);
      ids.add(id);
    });
    if (b.counts && typeof b.counts[t] === "number" && b.counts[t] !== rows.length) {
      errors.push(`${t}: header says ${b.counts[t]} records but the file contains ${rows.length}. The file may be truncated.`);
    }
  }
  if (!errors.length) {
    const sessions = new Set(b.data.workoutSessions.map((s) => s.id as string));
    const exercises = new Set(b.data.workoutExercises.map((e) => e.id as string));
    for (const e of b.data.workoutExercises) {
      if (!sessions.has(e.sessionId as string)) errors.push(`Workout exercise ${e.id} refers to a missing session.`);
    }
    for (const s of b.data.workoutSets) {
      if (!exercises.has(s.workoutExerciseId as string)) errors.push(`Workout set ${s.id} refers to a missing exercise.`);
    }
    const imports = new Set(b.data.dailyImports.map((i) => i.id as string));
    const dangling = b.data.foodEntries.filter((f) => f.importId && !imports.has(f.importId as string)).length;
    if (dangling) warnings.push(`${dangling} food entr${dangling === 1 ? "y refers" : "ies refer"} to an import that is not in the backup; the entries will still be restored.`);
    if (!b.data.userProfiles.length) errors.push("The backup has no profile record.");
    if (!b.data.goalVersions.length) errors.push("The backup has no goal targets.");
    if (!b.data.applicationSettings.length) errors.push("The backup has no settings record.");
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 30), warnings, backup: errors.length ? null : b };
}

/* ---------------------------------------------------------------- restore */

/** Replace ALL data with the backup, atomically. Call only after validateBackupText succeeded. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const db = getDb();
  await db.transaction("rw", TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) await db.table(t).clear();
    for (const t of TABLE_NAMES) {
      const rows = backup.data[t];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}

/* ------------------------------------------------------------------ clear */

/**
 * Erase every record and restore default profile, targets, settings and
 * exercise library. Atomic: either everything is cleared or nothing is.
 */
export async function clearAllData(): Promise<void> {
  const db = getDb();
  const now = nowIso();
  await db.transaction("rw", TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) await db.table(t).clear();
    await db.userProfiles.add(initialProfile(now));
    await db.goalVersions.add(initialGoals(now));
    await db.applicationSettings.add(initialSettings(now));
    await db.exerciseLibrary.bulkAdd(initialExercises(now));
  });
}

/* -------------------------------------------------------------------- CSV */

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export async function foodCsv(): Promise<string> {
  const rows = await getDb().foodEntries.orderBy("[date+order]").toArray();
  return toCsv(
    ["date", "time", "meal_category", "meal_label", "meal_name", "description", "quantity", "brand", "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "food_score", "food_score_scale", "approximate_fields", "source", "corrected", "corrected_fields"],
    rows.map((e) => [e.date, e.time, e.mealCategory, e.mealLabel, e.mealName, e.description, e.quantity, e.brand, e.calories, e.protein, e.carbs, e.fat, e.fiber, e.foodScore, e.foodScoreScale, e.approximateFields, e.source, e.corrected, e.correctedFields]),
  );
}

export async function weightCsv(): Promise<string> {
  const rows = await getDb().weightEntries.orderBy("date").toArray();
  return toCsv(["date", "time", "weight_kg", "source", "note"], rows.map((w) => [w.date, w.time, w.weightKg, w.source, w.note]));
}

export async function measurementsCsv(): Promise<string> {
  const rows = await getDb().bodyMeasurements.orderBy("date").toArray();
  return toCsv(
    ["date", "waist_cm", "chest_cm", "arm_cm", "thigh_cm", "hip_cm", "body_fat_pct", "source", "note"],
    rows.map((m) => [m.date, m.waistCm, m.chestCm, m.armCm, m.thighCm, m.hipCm, m.bodyFatPct, m.source, m.note]),
  );
}

export async function activityCsv(): Promise<string> {
  const rows = await getDb().activityEntries.orderBy("date").toArray();
  return toCsv(
    ["date", "move_kcal", "move_goal", "exercise_min", "exercise_goal", "stand_hours", "stand_goal", "steps", "distance_km", "source", "corrected", "corrected_fields"],
    rows.map((a) => [a.date, a.moveCalories, a.moveGoal, a.exerciseMinutes, a.exerciseGoal, a.standHours, a.standGoal, a.steps, a.distanceKm, a.source, a.corrected, a.correctedFields]),
  );
}

export async function workoutCsv(): Promise<string> {
  const db = getDb();
  const [sessions, exercises, sets] = await Promise.all([
    db.workoutSessions.orderBy("date").toArray(),
    db.workoutExercises.toArray(),
    db.workoutSets.toArray(),
  ]);
  const rows: unknown[][] = [];
  for (const s of sessions) {
    const exs = exercises.filter((e) => e.sessionId === s.id).sort((a, b) => a.order - b.order);
    const sessionCols = [s.date, s.name, s.type, s.durationMin, s.distanceKm, s.calories, s.avgHeartRate, s.source];
    if (!exs.length) {
      rows.push([...sessionCols, "", "", "", "", "", ""]);
      continue;
    }
    for (const ex of exs) {
      const ss = sets.filter((x) => x.workoutExerciseId === ex.id).sort((a, b) => a.setNumber - b.setNumber);
      if (!ss.length) rows.push([...sessionCols, ex.name, ex.muscleGroup, "", "", "", ""]);
      for (const set of ss) {
        rows.push([...sessionCols, ex.name, ex.muscleGroup, set.setNumber, set.reps, set.weightKg, set.reps !== null && set.weightKg !== null ? set.reps * set.weightKg : ""]);
      }
    }
  }
  return toCsv(
    ["date", "workout", "type", "duration_min", "distance_km", "calories_kcal", "avg_hr_bpm", "source", "exercise", "muscle_group", "set", "reps", "weight_kg", "volume_kg"],
    rows,
  );
}

/* --------------------------------------------------------------- download */

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
