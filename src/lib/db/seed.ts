import type {
  AppSettings,
  ExerciseDefinition,
  GoalVersion,
  UserProfile,
} from "./types";
import { newId } from "@/lib/utils/ids";

/**
 * Initial data supplied by the owner in the EVOLV brief.
 * Nothing here is invented: unspecified profile fields stay null.
 */

/** 6 ft = 72 in = 182.88 cm; stored to one decimal. */
export const INITIAL_HEIGHT_CM = 182.9;
export const INITIAL_WEIGHT_KG = 90;

/** Goal versions starting here apply to any backdated day before the first change. */
export const EPOCH_DATE = "1970-01-01";

export function initialProfile(now: string): UserProfile {
  return {
    id: "primary",
    displayName: null,
    dateOfBirth: null,
    ageYears: null,
    sex: null,
    heightCm: INITIAL_HEIGHT_CM,
    primaryGoal: "Body recomposition",
    secondaryGoals: [
      "Fat loss",
      "Muscle gain",
      "Improved strength",
      "Improved cardiovascular fitness",
      "Better nutrition consistency",
      "Sustainable lifestyle habits",
    ],
    activityDevice: "Apple Watch",
    country: "India",
    timezone: "Asia/Kolkata",
    currency: "INR",
    fitnessExperience: null,
    activityLevel: null,
    dietaryPreferences: null,
    foodAllergies: null,
    foodRestrictions: null,
    workoutPreferences: null,
    targetTimeline: null,
    maintenanceCaloriesOverride: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function initialGoals(now: string): GoalVersion {
  return {
    id: newId("goal"),
    effectiveFrom: EPOCH_DATE,
    calories: 2250,
    protein: 155,
    carbs: 220,
    fat: 70,
    fiber: 32,
    // Activity targets were not specified in the brief; they come from the
    // Apple Watch goals inside each imported report, or can be set manually.
    steps: null,
    moveCalories: null,
    exerciseMinutes: null,
    standHours: null,
    targetWeightKg: null,
    targetWaistCm: null,
    note: "Initial working targets (editable; not a medical prescription).",
    source: "profile",
    createdAt: now,
    updatedAt: now,
  };
}

export function initialSettings(now: string): AppSettings {
  return {
    id: "app",
    theme: "dark",
    dashboardWidgets: [
      { id: "intakeLine", visible: true },
      { id: "nutrition", visible: true },
      { id: "activity", visible: true },
      { id: "weight", visible: true },
      { id: "meals", visible: true },
      { id: "insights", visible: true },
    ],
    dashboardRangeDays: 7,
    lastBackupAt: null,
    backupReminderDays: 7,
    calorieTolerancePct: 5,
    createdAt: now,
    updatedAt: now,
  };
}

type LibrarySeed = Pick<
  ExerciseDefinition,
  "name" | "muscleGroup" | "equipment" | "category"
>;

export const DEFAULT_EXERCISES: LibrarySeed[] = [
  { name: "Bench press", muscleGroup: "Chest", equipment: "Barbell", category: "compound" },
  { name: "Squat", muscleGroup: "Legs", equipment: "Barbell", category: "compound" },
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell", category: "compound" },
  { name: "Shoulder press", muscleGroup: "Shoulders", equipment: "Dumbbell", category: "compound" },
  { name: "Lat pulldown", muscleGroup: "Back", equipment: "Cable", category: "compound" },
  { name: "Barbell row", muscleGroup: "Back", equipment: "Barbell", category: "compound" },
  { name: "Bicep curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "isolation" },
  { name: "Tricep pushdown", muscleGroup: "Arms", equipment: "Cable", category: "isolation" },
  { name: "Leg press", muscleGroup: "Legs", equipment: "Machine", category: "compound" },
  { name: "Lunges", muscleGroup: "Legs", equipment: "Dumbbell", category: "compound" },
  { name: "Pull-ups", muscleGroup: "Back", equipment: "Bodyweight", category: "bodyweight" },
  { name: "Push-ups", muscleGroup: "Chest", equipment: "Bodyweight", category: "bodyweight" },
];

export function initialExercises(now: string): ExerciseDefinition[] {
  return DEFAULT_EXERCISES.map((e) => ({
    ...e,
    id: newId("ex"),
    builtIn: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Full body",
  "Cardio",
  "Other",
];
