/**
 * EVOLV domain types.
 *
 * Conventions
 * - `date` fields are local calendar days as "yyyy-MM-dd" strings. EVOLV is a
 *   personal journal: a meal eaten on 25 Nov in Kolkata belongs to 25 Nov,
 *   regardless of UTC. Strings sort correctly and index cleanly in IndexedDB.
 * - `createdAt` / `updatedAt` are ISO-8601 instants.
 * - Nutritional numbers are `number | null`. `null` means "not supplied" and
 *   is never treated as zero by analytics.
 */

export type ISODate = string; // yyyy-MM-dd
export type ISOTimestamp = string; // full ISO instant

/** Where a record came from. Drives provenance badges throughout the UI. */
export type RecordSource =
  | "import" // parsed from a pasted daily report
  | "manual" // entered by hand in EVOLV
  | "profile" // created from profile setup
  | "backup"; // restored from a backup file (original source is preserved where possible)

export interface Timestamps {
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/* ----------------------------------------------------------------- profile */

export type Sex = "male" | "female" | "other";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "extra";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface UserProfile extends Timestamps {
  id: "primary";
  displayName: string | null;
  dateOfBirth: ISODate | null;
  /** Used only when date of birth is absent. */
  ageYears: number | null;
  sex: Sex | null;
  heightCm: number | null;
  primaryGoal: string;
  secondaryGoals: string[];
  activityDevice: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  fitnessExperience: ExperienceLevel | null;
  activityLevel: ActivityLevel | null;
  dietaryPreferences: string | null;
  foodAllergies: string | null;
  foodRestrictions: string | null;
  workoutPreferences: string | null;
  targetTimeline: string | null;
  /** User-supplied maintenance estimate (kcal/day), overrides formula estimates. */
  maintenanceCaloriesOverride: number | null;
}

/* ------------------------------------------------------------------- goals */

export interface GoalTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  steps: number | null;
  moveCalories: number | null;
  exerciseMinutes: number | null;
  standHours: number | null;
  targetWeightKg: number | null;
  targetWaistCm: number | null;
}

/**
 * A goal version applies from `effectiveFrom` (inclusive) until the next
 * version's `effectiveFrom`. Historical analytics use the version that was
 * in force on each day, so changing targets never rewrites the past.
 */
export interface GoalVersion extends Timestamps, GoalTargets {
  id: string;
  effectiveFrom: ISODate;
  note: string | null;
  source: RecordSource;
}

/* ----------------------------------------------------------------- imports */

export type MealCategory =
  | "breakfast"
  | "morning_snack"
  | "lunch"
  | "evening_snack"
  | "dinner"
  | "other";

export const MEAL_CATEGORIES: MealCategory[] = [
  "breakfast",
  "morning_snack",
  "lunch",
  "evening_snack",
  "dinner",
  "other",
];

export const NUTRIENT_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type NutrientValues = Record<NutrientKey, number | null>;

export interface ReportMetadata {
  date: ISODate | null;
  dayOfWeek: string | null;
  timezone: string | null;
  goal: string | null;
  weightKg: number | null;
  heightCm: number | null;
}

export interface DailyImport extends Timestamps {
  id: string;
  date: ISODate;
  /** Original pasted text, kept verbatim for audit. */
  rawText: string;
  /** Hash of whitespace-normalised raw text. Identical pastes share it. */
  contentHash: string;
  /** Hash of date + entry signatures. Catches re-formatted copies of the same day. */
  fingerprint: string;
  parserVersion: string;
  metadata: ReportMetadata;
  /** Totals exactly as printed in the report (never modified). */
  reportedTotals: NutrientValues;
  reportedTargets: NutrientValues;
  /** Totals computed from parsed entries at import time (for audit). */
  calculatedTotals: NutrientValues;
  energyBalanceText: string | null;
  energyBalanceKcal: number | null;
  notes: string[];
  uncertainties: string[];
  warnings: string[];
  status: "active" | "replaced";
  replacedById: string | null;
  mode: "new" | "replace" | "merge";
}

/**
 * Per-day override that says which totals represent the day.
 * Only stored when the user chose the report's own totals over the sum of
 * entries; otherwise totals are always derived from food entries.
 */
export interface DailyNutritionSummary extends Timestamps {
  id: string;
  date: ISODate;
  mode: "reported";
  totals: NutrientValues;
  importId: string | null;
}

/* -------------------------------------------------------------------- food */

export interface FoodEntry extends Timestamps, NutrientValues {
  id: string;
  date: ISODate;
  /** "HH:mm" 24h local time, or null when not supplied. */
  time: string | null;
  /** Position within the report / day, used when time is missing. */
  order: number;
  entryNumber: number | null;
  mealCategory: MealCategory;
  /** Original meal label, e.g. "Post-workout". */
  mealLabel: string | null;
  mealName: string;
  description: string | null;
  quantity: string | null;
  brand: string | null;
  foodScore: number | null;
  foodScoreScale: number | null;
  /** Nutrient fields that the report marked as approximate (~, approx, ranges). */
  approximateFields: string[];
  source: RecordSource;
  importId: string | null;
  /** True once a user edited an imported record. */
  corrected: boolean;
  correctedFields: string[];
  /** Snapshot of values as first recorded, kept when a record is corrected. */
  original: Partial<FoodEntry> | null;
  notes: string | null;
}

/* ---------------------------------------------------------------- activity */

export interface ActivityEntry extends Timestamps {
  id: string;
  date: ISODate;
  moveCalories: number | null;
  moveGoal: number | null;
  exerciseMinutes: number | null;
  exerciseGoal: number | null;
  standHours: number | null;
  standGoal: number | null;
  steps: number | null;
  distanceKm: number | null;
  source: RecordSource;
  importId: string | null;
  corrected: boolean;
  correctedFields: string[];
  notes: string | null;
}

/* ---------------------------------------------------------------- workouts */

export type WorkoutType =
  | "strength"
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "cardio"
  | "sports"
  | "other";

export const WORKOUT_TYPES: WorkoutType[] = [
  "strength",
  "walking",
  "running",
  "cycling",
  "swimming",
  "cardio",
  "sports",
  "other",
];

export interface WorkoutSession extends Timestamps {
  id: string;
  date: ISODate;
  startTime: string | null;
  name: string;
  type: WorkoutType;
  durationMin: number | null;
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  avgSpeedKmh: number | null;
  notes: string | null;
  source: RecordSource;
  importId: string | null;
}

export interface WorkoutExercise extends Timestamps {
  id: string;
  sessionId: string;
  exerciseId: string | null;
  name: string;
  muscleGroup: string | null;
  order: number;
  notes: string | null;
}

export interface WorkoutSet extends Timestamps {
  id: string;
  sessionId: string;
  workoutExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  restSec: number | null;
  notes: string | null;
}

export interface ExerciseDefinition extends Timestamps {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  category: "compound" | "isolation" | "bodyweight" | "cardio" | "other";
  builtIn: boolean;
}

/* -------------------------------------------------------------------- body */

export interface WeightEntry extends Timestamps {
  id: string;
  date: ISODate;
  time: string | null;
  weightKg: number;
  source: RecordSource;
  importId: string | null;
  note: string | null;
}

export const MEASUREMENT_KEYS = [
  "waistCm",
  "chestCm",
  "armCm",
  "thighCm",
  "hipCm",
  "bodyFatPct",
] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export interface BodyMeasurement
  extends Timestamps,
    Record<MeasurementKey, number | null> {
  id: string;
  date: ISODate;
  source: RecordSource;
  note: string | null;
}

/* ---------------------------------------------------------------- settings */

export type DashboardWidgetId =
  | "intakeLine"
  | "nutrition"
  | "activity"
  | "weight"
  | "meals"
  | "insights";

export interface DashboardWidget {
  id: DashboardWidgetId;
  visible: boolean;
}

export interface AppSettings extends Timestamps {
  id: "app";
  theme: "dark" | "light" | "system";
  dashboardWidgets: DashboardWidget[];
  dashboardRangeDays: 7 | 14 | 30;
  lastBackupAt: ISOTimestamp | null;
  backupReminderDays: number;
  /** Calorie "within target" band, as a percentage either side of target. */
  calorieTolerancePct: number;
}
