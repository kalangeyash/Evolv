import type { MealCategory, NutrientKey, WorkoutType } from "@/lib/db/types";

/**
 * Vocabulary the parser understands. Extending EVOLV's import format is
 * mostly a matter of adding aliases here.
 */

export type EntryField =
  | NutrientKey
  | "name"
  | "description"
  | "quantity"
  | "time"
  | "category"
  | "score"
  | "brand"
  | "notes";

/** Normalise a label for dictionary lookup: lowercase, letters only, single spaces. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUTRIENT_ALIASES: Record<NutrientKey, string[]> = {
  calories: ["calories", "calorie", "kcal", "cal", "cals", "energy", "total calories", "calories kcal", "est calories", "estimated calories"],
  protein: ["protein", "proteins", "prot", "p", "protein g", "total protein"],
  carbs: ["carbs", "carb", "carbohydrates", "carbohydrate", "c", "carbs g", "net carbs", "total carbs", "total carbohydrates"],
  fat: ["fat", "fats", "f", "total fat", "fat g", "fats g"],
  fiber: ["fiber", "fibre", "dietary fiber", "dietary fibre", "fib", "fiber g", "fibre g", "total fiber", "total fibre"],
};

const ENTRY_FIELD_ALIASES: Record<Exclude<EntryField, NutrientKey>, string[]> = {
  name: ["meal", "meal name", "name", "dish", "title", "food", "item", "items", "food item", "food name", "what", "meal title"],
  description: ["description", "details", "contents", "composition", "ingredients", "components", "what i ate", "food description", "breakdown"],
  quantity: ["quantity", "qty", "portion", "portion size", "serving", "serving size", "amount", "estimated quantity", "estimated portion", "size"],
  time: ["time", "timestamp", "logged at", "time logged", "eaten at"],
  category: ["category", "meal type", "meal category", "type"],
  score: ["food quality score", "quality score", "food score", "score", "quality", "health score", "nutrition score", "rating", "meal score"],
  brand: ["brand", "brands"],
  notes: ["note", "notes", "comment", "comments", "remark", "remarks", "tip"],
};

const fieldLookup = new Map<string, EntryField>();
for (const [k, list] of Object.entries(NUTRIENT_ALIASES)) for (const a of list) fieldLookup.set(a, k as EntryField);
for (const [k, list] of Object.entries(ENTRY_FIELD_ALIASES)) for (const a of list) fieldLookup.set(a, k as EntryField);

export function lookupEntryField(label: string): EntryField | null {
  return fieldLookup.get(normKey(label)) ?? null;
}

export function lookupNutrient(label: string): NutrientKey | null {
  const f = lookupEntryField(label.replace(/\btotals?\b|\bdaily\b|\bconsumed\b|\bintake\b/gi, ""));
  return f && (NUTRIENT_ALIASES as Record<string, string[]>)[f] ? (f as NutrientKey) : null;
}

/* --------------------------------------------------------------- activity */

export type ActivityField = "move" | "exercise" | "stand" | "steps" | "distance";

const ACTIVITY_ALIASES: Record<ActivityField, string[]> = {
  move: ["move", "move ring", "move calories", "active calories", "active energy", "active kcal", "move goal"],
  exercise: ["exercise", "exercise ring", "exercise minutes", "exercise time", "exercise goal", "active minutes"],
  stand: ["stand", "stand ring", "stand hours", "stand goal"],
  steps: ["steps", "step count", "total steps", "daily steps"],
  distance: ["distance", "walking distance", "walking running distance", "walking + running distance", "walk run distance", "total distance", "walking and running distance"],
};

const activityLookup = new Map<string, ActivityField>();
for (const [k, list] of Object.entries(ACTIVITY_ALIASES)) for (const a of list) activityLookup.set(normKey(a), k as ActivityField);

export function lookupActivityField(label: string): ActivityField | null {
  return activityLookup.get(normKey(label)) ?? null;
}

export function isGoalLabel(label: string): boolean {
  return /\b(goal|target)\b/i.test(label);
}

/* ---------------------------------------------------------------- workouts */

export const WORKOUT_KEYS = ["workout", "workouts", "workout type", "training", "session", "exercise session", "activity type", "workout session"];
export const WORKOUT_DETAIL_KEYS: Record<string, "duration" | "distance" | "calories" | "heartRate" | "name"> = {
  "workout duration": "duration",
  duration: "duration",
  "workout time": "duration",
  "workout distance": "distance",
  "workout calories": "calories",
  "workout kcal": "calories",
  "workout active calories": "calories",
  "average heart rate": "heartRate",
  "avg heart rate": "heartRate",
  "avg hr": "heartRate",
  "heart rate": "heartRate",
  "workout name": "name",
};

export function inferWorkoutType(s: string): WorkoutType {
  const t = s.toLowerCase();
  if (/strength|weight|lift|gym|resistance|functional|dumbbell|barbell|push day|pull day|leg day|upper body|lower body/.test(t)) return "strength";
  if (/\brun|jog|sprint/.test(t)) return "running";
  if (/walk|hike|trek/.test(t)) return "walking";
  if (/cycl|bike|biking|ride|spin/.test(t)) return "cycling";
  if (/swim/.test(t)) return "swimming";
  if (/hiit|elliptical|row(?:er|ing)|stair|cardio|aerobic|zumba|dance|skipping|jump rope/.test(t)) return "cardio";
  if (/cricket|football|soccer|badminton|tennis|basketball|volleyball|squash|pickleball|table tennis|kabaddi|hockey/.test(t)) return "sports";
  return "other";
}

/* ------------------------------------------------------------------ meals */

const MEAL_PATTERNS: [RegExp, MealCategory][] = [
  [/\b(early\s+morning|pre[-\s]?breakfast)\b/i, "morning_snack"],
  [/\bbreakfast|brekkie|nashta\b/i, "breakfast"],
  [/\b(mid[-\s]?morning|morning)\s+(snack|bite|meal)|\bbrunch\b/i, "morning_snack"],
  [/\blunch\b/i, "lunch"],
  [/\b(evening|afternoon|tea[-\s]?time)\s*(snack|bite|tea|chai)?\b|\bhigh\s+tea\b/i, "evening_snack"],
  [/\b(dinner|supper)\b/i, "dinner"],
  [/\b(late[-\s]?night|bedtime|night\s+snack)\b/i, "other"],
  [/\b(pre|post)[-\s]?workout\b|\bsupplement|shake\b/i, "other"],
  [/\bsnack\b/i, "other"],
];

/** Labels that strongly indicate the start of a meal entry. */
export const MEAL_WORD_RE =
  /\b((?:mid[-\s]?)?morning\s+snack|(?:afternoon|evening|late[-\s]?night|night)\s+(?:snack|tea|chai)|breakfast|brunch|lunch|dinner|supper|snack|(?:pre|post)[-\s]?workout|mid[-\s]?morning|late[-\s]?night|bedtime|tea[-\s]?time|beverage|drink|supplement)\b/i;

/**
 * Map a meal label to a category. Plain "snack" is placed by time of day
 * (before noon → morning snack, from 3 pm → evening snack); this is a
 * categorisation choice, and the original label is always kept.
 */
export function inferMealCategory(label: string | null, time: string | null): MealCategory {
  if (label) {
    for (const [re, cat] of MEAL_PATTERNS) {
      if (re.test(label)) {
        if (cat === "other" && /\bsnack\b/i.test(label) && time && !/late|night|bedtime|workout/i.test(label)) {
          const h = +time.slice(0, 2);
          if (h < 12) return "morning_snack";
          if (h >= 15 && h < 21) return "evening_snack";
        }
        return cat;
      }
    }
  }
  return "other";
}

/* ----------------------------------------------------------------- brands */

/** Common Indian (and India-available) food brands, for the optional brand field. */
export const KNOWN_BRANDS = [
  "Amul", "Saffola", "MuscleBlaze", "Haldiram's", "Haldiram", "MTR", "Britannia", "Parle", "Mother Dairy",
  "Epigamia", "Yoga Bar", "Kellogg's", "Quaker", "Nestle", "Nestlé", "Maggi", "Tata", "Aashirvaad", "Fortune",
  "Patanjali", "Bikano", "Behrouz", "Domino's", "McDonald's", "Subway", "Starbucks", "Chai Point", "Sunfeast",
  "Yippee", "Licious", "Milky Mist", "Akshayakalpa", "Country Delight", "Optimum Nutrition", "Myprotein",
  "Nakpro", "AS-IT-IS", "The Whole Truth", "Super You", "Paper Boat", "Raw Pressery", "Lay's", "Kurkure",
  "Bournvita", "Horlicks", "Complan", "Real", "Tropicana", "Kissan", "Nandini", "Heritage", "Gowardhan",
  "Go Cheese", "Britannia NutriChoice", "Kwality Walls", "Baskin Robbins", "KFC", "Burger King", "Pizza Hut",
  "Wow! Momo", "Theobroma", "Haldirams", "Bingo", "Act II", "Too Yumm", "Unibic", "Dabur", "iD Fresh",
  "Ching's", "Knorr", "Del Monte", "Veeba", "Pintola", "Alpino", "Sundrop", "True Elements", "Kapiva",
  "Avvatar", "GNC", "Bigmuscles", "Fast&Up", "RiteBite", "Max Protein", "Hershey's", "Cadbury", "Mondelez",
];

export function detectBrand(...texts: (string | null | undefined)[]): string | null {
  const hay = texts.filter(Boolean).join(" ");
  if (!hay) return null;
  // Longest names first so "Britannia NutriChoice" wins over "Britannia".
  const sorted = [...KNOWN_BRANDS].sort((a, b) => b.length - a.length);
  for (const b of sorted) {
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Za-z])${esc}(?![A-Za-z])`, "i").test(hay)) {
      return b === "Haldirams" || b === "Haldiram" ? "Haldiram's" : b === "Nestle" ? "Nestlé" : b;
    }
  }
  return null;
}

/* --------------------------------------------------------------- sections */

export type SectionKind =
  | "meta"
  | "entries"
  | "totals"
  | "activity"
  | "workouts"
  | "energy"
  | "notes"
  | "uncertainty"
  | "unknown";

const SECTION_PATTERNS: [RegExp, SectionKind][] = [
  [/\b(uncertaint\w*|assumptions?|caveats?|limitations?|disclaimers?|confidence)\b/i, "uncertainty"],
  [/\b(energy balance|calorie balance|caloric balance|net calories|deficit|surplus|tdee|expenditure)\b/i, "energy"],
  [/\b(apple watch|activity|fitness rings?|rings|movement|steps summary)\b/i, "activity"],
  [/\b(workouts?|training log|exercise sessions?|training)\b/i, "workouts"],
  [/\b(daily totals?|totals?|nutrition summary|macro summary|daily summary|day summary|macros? (?:vs|versus) targets?|summary|target progress)\b/i, "totals"],
  [/\b(food log|food journal|meal log|meals?|food entries|intake log|what i ate|food diary|entries)\b/i, "entries"],
  [/\b(notes?|observations?|recommendations?|insights?|tips|suggestions?|takeaways?|feedback|analysis|coach)\b/i, "notes"],
  [/\b(report details|profile|metadata|overview|day info|details)\b/i, "meta"],
];

export function classifySection(title: string): SectionKind {
  for (const [re, kind] of SECTION_PATTERNS) if (re.test(title)) return kind;
  return "unknown";
}

/* --------------------------------------------------------------- metadata */

export type MetaField = "date" | "day" | "timezone" | "goal" | "weight" | "height";

const META_ALIASES: Record<MetaField, string[]> = {
  date: ["date", "report date", "journal date", "log date", "day date", "for date"],
  day: ["day", "day of week", "weekday", "day of the week"],
  timezone: ["timezone", "time zone", "tz", "zone"],
  goal: ["goal", "fitness goal", "primary goal", "objective", "current goal", "goals"],
  weight: ["weight", "body weight", "bodyweight", "current weight", "today s weight", "todays weight", "morning weight", "weight today"],
  height: ["height", "body height"],
};

const metaLookup = new Map<string, MetaField>();
for (const [k, list] of Object.entries(META_ALIASES)) for (const a of list) metaLookup.set(normKey(a), k as MetaField);

export function lookupMetaField(label: string): MetaField | null {
  return metaLookup.get(normKey(label)) ?? null;
}
