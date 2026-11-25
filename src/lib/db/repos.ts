import { getDb } from "./db";
import type {
  ActivityEntry,
  AppSettings,
  BodyMeasurement,
  ExerciseDefinition,
  FoodEntry,
  GoalTargets,
  GoalVersion,
  ISODate,
  NutrientValues,
  UserProfile,
  WeightEntry,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "./types";
import { newId, nowIso } from "@/lib/utils/ids";
import { isISODate } from "@/lib/utils/dates";

/* ----------------------------------------------------------------- helpers */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function assertDate(d: string, label = "Date") {
  if (!isISODate(d)) throw new ValidationError(`${label} must be a valid date.`);
}

function assertNonNegative(v: number | null | undefined, label: string) {
  if (v === null || v === undefined) return;
  if (!Number.isFinite(v) || v < 0) {
    throw new ValidationError(`${label} must be a non-negative number.`);
  }
}

/* ----------------------------------------------------------------- profile */

export async function getProfile(): Promise<UserProfile | undefined> {
  return getDb().userProfiles.get("primary");
}

export async function updateProfile(
  patch: Partial<Omit<UserProfile, "id" | "createdAt">>,
): Promise<void> {
  if (patch.heightCm !== undefined && patch.heightCm !== null) {
    if (patch.heightCm < 100 || patch.heightCm > 250) {
      throw new ValidationError("Height must be between 100 and 250 cm.");
    }
  }
  if (patch.dateOfBirth) assertDate(patch.dateOfBirth, "Date of birth");
  if (patch.ageYears !== undefined && patch.ageYears !== null) {
    if (patch.ageYears < 10 || patch.ageYears > 110) {
      throw new ValidationError("Age must be between 10 and 110.");
    }
  }
  await getDb().userProfiles.update("primary", { ...patch, updatedAt: nowIso() });
}

/* ------------------------------------------------------------------- goals */

export async function listGoalVersions(): Promise<GoalVersion[]> {
  return getDb().goalVersions.orderBy("effectiveFrom").toArray();
}

export function validateGoalTargets(t: GoalTargets) {
  const required: (keyof GoalTargets)[] = ["calories", "protein", "carbs", "fat", "fiber"];
  for (const k of required) {
    const v = t[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new ValidationError(`${k} target must be a positive number.`);
    }
  }
  for (const k of Object.keys(t) as (keyof GoalTargets)[]) {
    assertNonNegative(t[k] as number | null, k);
  }
}

/**
 * Save targets effective from a date. A version already starting on that
 * date is updated in place; otherwise a new version is inserted. Earlier
 * versions are untouched, so past days keep the targets that applied then.
 */
export async function saveGoalVersion(
  targets: GoalTargets,
  effectiveFrom: ISODate,
  note: string | null,
): Promise<string> {
  assertDate(effectiveFrom, "Effective date");
  validateGoalTargets(targets);
  const db = getDb();
  const now = nowIso();
  return db.transaction("rw", db.goalVersions, async () => {
    const existing = await db.goalVersions.where("effectiveFrom").equals(effectiveFrom).first();
    if (existing) {
      await db.goalVersions.update(existing.id, { ...targets, note, updatedAt: now });
      return existing.id;
    }
    const id = newId("goal");
    await db.goalVersions.add({
      ...targets,
      id,
      effectiveFrom,
      note,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  });
}

export async function deleteGoalVersion(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.goalVersions, async () => {
    const count = await db.goalVersions.count();
    if (count <= 1) {
      throw new ValidationError("At least one set of targets must remain.");
    }
    await db.goalVersions.delete(id);
  });
}

/* ---------------------------------------------------------------- settings */

export async function updateSettings(
  patch: Partial<Omit<AppSettings, "id" | "createdAt">>,
): Promise<void> {
  await getDb().applicationSettings.update("app", { ...patch, updatedAt: nowIso() });
}

/* -------------------------------------------------------------------- food */

export type FoodInput = Pick<
  FoodEntry,
  | "date"
  | "time"
  | "mealCategory"
  | "mealLabel"
  | "mealName"
  | "description"
  | "quantity"
  | "brand"
  | "foodScore"
  | "foodScoreScale"
  | "notes"
> &
  NutrientValues;

const NUTRIENT_FIELDS = ["calories", "protein", "carbs", "fat", "fiber"] as const;

function validateFood(input: Partial<FoodInput>) {
  if (input.date !== undefined) assertDate(input.date);
  if (input.mealName !== undefined && !input.mealName.trim()) {
    throw new ValidationError("Meal name is required.");
  }
  if (input.time !== undefined && input.time !== null && !/^\d{2}:\d{2}$/.test(input.time)) {
    throw new ValidationError("Time must be in HH:mm format.");
  }
  for (const k of NUTRIENT_FIELDS) assertNonNegative(input[k], k);
  if (input.calories != null && input.calories > 10000) {
    throw new ValidationError("Calories for a single entry look implausible (over 10,000 kcal).");
  }
}

export async function addFoodEntry(input: FoodInput): Promise<string> {
  validateFood(input);
  const db = getDb();
  const now = nowIso();
  const id = newId("food");
  await db.transaction("rw", db.foodEntries, async () => {
    const sameDay = await db.foodEntries.where("date").equals(input.date).toArray();
    const order = sameDay.reduce((m, e) => Math.max(m, e.order), -1) + 1;
    await db.foodEntries.add({
      ...input,
      id,
      order,
      entryNumber: null,
      approximateFields: [],
      source: "manual",
      importId: null,
      corrected: false,
      correctedFields: [],
      original: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  return id;
}

const TRACKED_FOOD_FIELDS: (keyof FoodInput)[] = [
  "date",
  "time",
  "mealCategory",
  "mealName",
  "description",
  "quantity",
  "brand",
  "foodScore",
  ...NUTRIENT_FIELDS,
];

/**
 * Update a food entry. For imported entries the first correction snapshots
 * the original values and the record is flagged as manually corrected, so
 * provenance survives edits.
 */
export async function updateFoodEntry(id: string, patch: Partial<FoodInput>): Promise<void> {
  validateFood(patch);
  const db = getDb();
  await db.transaction("rw", db.foodEntries, async () => {
    const current = await db.foodEntries.get(id);
    if (!current) throw new ValidationError("That food entry no longer exists.");
    const changed = TRACKED_FOOD_FIELDS.filter(
      (k) => k in patch && (patch as Record<string, unknown>)[k] !== (current as unknown as Record<string, unknown>)[k],
    );
    const update: Partial<FoodEntry> = { ...patch, updatedAt: nowIso() };
    if (current.source !== "manual" && changed.length) {
      update.corrected = true;
      update.correctedFields = Array.from(new Set([...current.correctedFields, ...changed]));
      if (!current.original) {
        const snapshot: Partial<FoodEntry> = {};
        for (const k of TRACKED_FOOD_FIELDS) {
          (snapshot as Record<string, unknown>)[k] = (current as unknown as Record<string, unknown>)[k];
        }
        update.original = snapshot;
      }
      // A corrected value is no longer the report's approximation.
      update.approximateFields = current.approximateFields.filter((f) => !changed.includes(f as keyof FoodInput));
    }
    await db.foodEntries.update(id, update);
  });
}

export async function deleteFoodEntry(id: string): Promise<void> {
  await getDb().foodEntries.delete(id);
}

/* ---------------------------------------------------------------- summaries */

export async function setReportedTotalsOverride(
  date: ISODate,
  totals: NutrientValues,
  importId: string | null,
) {
  const db = getDb();
  const now = nowIso();
  const existing = await db.dailyNutritionSummaries.where("date").equals(date).first();
  if (existing) {
    await db.dailyNutritionSummaries.update(existing.id, { totals, importId, updatedAt: now });
  } else {
    await db.dailyNutritionSummaries.add({
      id: newId("sum"),
      date,
      mode: "reported",
      totals,
      importId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function clearTotalsOverride(date: ISODate) {
  await getDb().dailyNutritionSummaries.where("date").equals(date).delete();
}

/* ---------------------------------------------------------------- activity */

export type ActivityInput = Pick<
  ActivityEntry,
  | "moveCalories"
  | "moveGoal"
  | "exerciseMinutes"
  | "exerciseGoal"
  | "standHours"
  | "standGoal"
  | "steps"
  | "distanceKm"
  | "notes"
>;

const ACTIVITY_FIELDS: (keyof ActivityInput)[] = [
  "moveCalories",
  "moveGoal",
  "exerciseMinutes",
  "exerciseGoal",
  "standHours",
  "standGoal",
  "steps",
  "distanceKm",
];

function validateActivity(a: Partial<ActivityInput>) {
  for (const k of ACTIVITY_FIELDS) assertNonNegative(a[k] as number | null, k);
  if (a.standHours != null && a.standHours > 24) {
    throw new ValidationError("Stand hours cannot exceed 24.");
  }
  if (a.exerciseMinutes != null && a.exerciseMinutes > 1440) {
    throw new ValidationError("Exercise minutes cannot exceed 1,440 in a day.");
  }
}

/** Create or edit the single activity record for a day (manual entry). */
export async function saveActivityForDate(date: ISODate, input: Partial<ActivityInput>) {
  assertDate(date);
  validateActivity(input);
  const db = getDb();
  const now = nowIso();
  await db.transaction("rw", db.activityEntries, async () => {
    const existing = await db.activityEntries.where("date").equals(date).first();
    if (existing) {
      const changed = ACTIVITY_FIELDS.filter((k) => k in input && input[k] !== existing[k]);
      const update: Partial<ActivityEntry> = { ...input, updatedAt: now };
      if (existing.source !== "manual" && changed.length) {
        update.corrected = true;
        update.correctedFields = Array.from(new Set([...existing.correctedFields, ...changed]));
      }
      await db.activityEntries.update(existing.id, update);
    } else {
      await db.activityEntries.add({
        id: newId("act"),
        date,
        moveCalories: null,
        moveGoal: null,
        exerciseMinutes: null,
        exerciseGoal: null,
        standHours: null,
        standGoal: null,
        steps: null,
        distanceKm: null,
        notes: null,
        ...input,
        source: "manual",
        importId: null,
        corrected: false,
        correctedFields: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

export async function deleteActivity(id: string) {
  await getDb().activityEntries.delete(id);
}

/* -------------------------------------------------------------------- body */

export async function addWeight(date: ISODate, weightKg: number, note: string | null = null, time: string | null = null) {
  assertDate(date);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) {
    throw new ValidationError("Weight must be between 25 and 350 kg.");
  }
  const now = nowIso();
  const id = newId("w");
  await getDb().weightEntries.add({
    id,
    date,
    time,
    weightKg,
    source: "manual",
    importId: null,
    note,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateWeight(id: string, patch: Partial<Pick<WeightEntry, "date" | "weightKg" | "note" | "time">>) {
  if (patch.date) assertDate(patch.date);
  if (patch.weightKg !== undefined && (patch.weightKg < 25 || patch.weightKg > 350)) {
    throw new ValidationError("Weight must be between 25 and 350 kg.");
  }
  await getDb().weightEntries.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteWeight(id: string) {
  await getDb().weightEntries.delete(id);
}

export type MeasurementInput = Omit<BodyMeasurement, "id" | "createdAt" | "updatedAt" | "source">;

function validateMeasurement(m: Partial<MeasurementInput>) {
  if (m.date) assertDate(m.date);
  for (const k of ["waistCm", "chestCm", "armCm", "thighCm", "hipCm"] as const) {
    const v = m[k];
    if (v != null && (v < 10 || v > 300)) throw new ValidationError(`${k} must be between 10 and 300 cm.`);
  }
  if (m.bodyFatPct != null && (m.bodyFatPct < 2 || m.bodyFatPct > 70)) {
    throw new ValidationError("Body fat must be between 2% and 70%.");
  }
}

export async function addMeasurement(m: MeasurementInput) {
  validateMeasurement(m);
  const values = [m.waistCm, m.chestCm, m.armCm, m.thighCm, m.hipCm, m.bodyFatPct];
  if (values.every((v) => v == null)) {
    throw new ValidationError("Enter at least one measurement.");
  }
  const now = nowIso();
  const id = newId("m");
  await getDb().bodyMeasurements.add({ ...m, id, source: "manual", createdAt: now, updatedAt: now });
  return id;
}

export async function updateMeasurement(id: string, patch: Partial<MeasurementInput>) {
  validateMeasurement(patch);
  await getDb().bodyMeasurements.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteMeasurement(id: string) {
  await getDb().bodyMeasurements.delete(id);
}

/* ---------------------------------------------------------------- workouts */

export interface SetDraft {
  reps: number | null;
  weightKg: number | null;
  restSec: number | null;
  notes: string | null;
}

export interface ExerciseDraft {
  exerciseId: string | null;
  name: string;
  muscleGroup: string | null;
  notes: string | null;
  sets: SetDraft[];
}

export type SessionDraft = Omit<WorkoutSession, "id" | "createdAt" | "updatedAt" | "source" | "importId"> & {
  exercises: ExerciseDraft[];
};

function validateSession(s: SessionDraft) {
  assertDate(s.date);
  if (!s.name.trim()) throw new ValidationError("Workout name is required.");
  for (const k of ["durationMin", "distanceKm", "calories", "avgHeartRate", "avgSpeedKmh"] as const) {
    assertNonNegative(s[k], k);
  }
  s.exercises.forEach((ex, i) => {
    if (!ex.name.trim()) throw new ValidationError(`Exercise ${i + 1} needs a name.`);
    ex.sets.forEach((set, j) => {
      assertNonNegative(set.reps, `Set ${j + 1} reps`);
      assertNonNegative(set.weightKg, `Set ${j + 1} weight`);
      if (set.reps != null && !Number.isInteger(set.reps)) {
        throw new ValidationError(`Set ${j + 1} of ${ex.name}: reps must be a whole number.`);
      }
    });
  });
}

/** Write a session with its exercises and sets atomically. Pass `id` to replace an existing one. */
export async function saveWorkoutSession(draft: SessionDraft, id?: string): Promise<string> {
  validateSession(draft);
  const db = getDb();
  const now = nowIso();
  const sessionId = id ?? newId("ws");
  await db.transaction("rw", [db.workoutSessions, db.workoutExercises, db.workoutSets], async () => {
    const { exercises, ...sessionFields } = draft;
    const existing = id ? await db.workoutSessions.get(id) : undefined;
    const session: WorkoutSession = {
      ...sessionFields,
      id: sessionId,
      source: existing?.source ?? "manual",
      importId: existing?.importId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.workoutSessions.put(session);
    if (id) {
      await db.workoutSets.where("sessionId").equals(id).delete();
      await db.workoutExercises.where("sessionId").equals(id).delete();
    }
    const exRows: WorkoutExercise[] = [];
    const setRows: WorkoutSet[] = [];
    exercises.forEach((ex, i) => {
      const exId = newId("we");
      exRows.push({
        id: exId,
        sessionId,
        exerciseId: ex.exerciseId,
        name: ex.name.trim(),
        muscleGroup: ex.muscleGroup,
        order: i,
        notes: ex.notes,
        createdAt: now,
        updatedAt: now,
      });
      ex.sets.forEach((s, j) =>
        setRows.push({
          id: newId("set"),
          sessionId,
          workoutExerciseId: exId,
          setNumber: j + 1,
          reps: s.reps,
          weightKg: s.weightKg,
          restSec: s.restSec,
          notes: s.notes,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
    await db.workoutExercises.bulkAdd(exRows);
    await db.workoutSets.bulkAdd(setRows);
  });
  return sessionId;
}

export async function deleteWorkoutSession(id: string) {
  const db = getDb();
  await db.transaction("rw", [db.workoutSessions, db.workoutExercises, db.workoutSets], async () => {
    await db.workoutSets.where("sessionId").equals(id).delete();
    await db.workoutExercises.where("sessionId").equals(id).delete();
    await db.workoutSessions.delete(id);
  });
}

export async function saveExerciseDefinition(
  def: Pick<ExerciseDefinition, "name" | "muscleGroup" | "equipment" | "category">,
  id?: string,
) {
  const name = def.name.trim();
  if (!name) throw new ValidationError("Exercise name is required.");
  const db = getDb();
  const now = nowIso();
  const clash = await db.exerciseLibrary
    .filter((e) => e.name.toLowerCase() === name.toLowerCase() && e.id !== id)
    .first();
  if (clash) throw new ValidationError(`“${name}” is already in the library.`);
  if (id) {
    await db.exerciseLibrary.update(id, { ...def, name, updatedAt: now });
    return id;
  }
  const newIdValue = newId("ex");
  await db.exerciseLibrary.add({ ...def, name, id: newIdValue, builtIn: false, createdAt: now, updatedAt: now });
  return newIdValue;
}

export async function deleteExerciseDefinition(id: string) {
  // Logged workouts keep the exercise name, so history is not lost.
  const db = getDb();
  await db.transaction("rw", [db.exerciseLibrary, db.workoutExercises], async () => {
    await db.workoutExercises.where("exerciseId").equals(id).modify({ exerciseId: null });
    await db.exerciseLibrary.delete(id);
  });
}
