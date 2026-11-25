/**
 * Stage 2 — normalisation.
 *
 * Converts the RawReport's strings into typed values (numbers, ISO dates,
 * 24h times, categories). Every assumption is recorded as an Issue so the
 * preview can show it; values that cannot be read become null, never 0.
 */
import type {
  MealCategory,
  NutrientKey,
  NutrientValues,
  ReportMetadata,
  WorkoutType,
} from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import type { RawEntry, RawReport, RawWorkout } from "./parse";
import {
  WEEKDAYS,
  findWeekday,
  isMissingMarker,
  parseDateText,
  parseDistanceKm,
  parseDurationMinutes,
  parseHeightCm,
  parseNumber,
  parseTimeText,
  parseWeightKg,
  round1,
} from "./text";
import { detectBrand, inferMealCategory, inferWorkoutType, lookupEntryField, type EntryField } from "./labels";

export const PARSER_VERSION = "1.0.0";

export type IssueLevel = "error" | "warning" | "info";
export interface Issue {
  level: IssueLevel;
  message: string;
  field?: string;
}

export interface ParsedEntry extends NutrientValues {
  key: string;
  include: boolean;
  entryNumber: number | null;
  time: string | null;
  mealCategory: MealCategory;
  mealLabel: string | null;
  mealName: string;
  description: string | null;
  quantity: string | null;
  brand: string | null;
  foodScore: number | null;
  foodScoreScale: number | null;
  approximateFields: NutrientKey[];
  /** Nutrients the report did not mention at all. */
  missingFields: NutrientKey[];
  /** Nutrients the report explicitly marked as unavailable ("N/A"). */
  reportedUnavailable: NutrientKey[];
  issues: Issue[];
}

export interface ParsedActivity {
  moveCalories: number | null;
  moveGoal: number | null;
  exerciseMinutes: number | null;
  exerciseGoal: number | null;
  standHours: number | null;
  standGoal: number | null;
  steps: number | null;
  distanceKm: number | null;
}

export interface ParsedWorkout {
  key: string;
  include: boolean;
  name: string;
  type: WorkoutType;
  durationMin: number | null;
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  raw: string;
}

export interface ParsedReport {
  parserVersion: string;
  metadata: ReportMetadata;
  entries: ParsedEntry[];
  reportedTotals: NutrientValues;
  reportedTargets: NutrientValues;
  activity: ParsedActivity | null;
  workouts: ParsedWorkout[];
  energyBalanceText: string | null;
  energyBalanceKcal: number | null;
  notes: string[];
  uncertainties: string[];
  ignored: string[];
  unrecognized: string[];
  issues: Issue[];
}

export interface NormalizeOptions {
  /** Used only when the report omits the year. Defaults to the current year. */
  referenceYear?: number;
}

export const emptyNutrients = (): NutrientValues => ({
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  fiber: null,
});

/* ---------------------------------------------------------------- helpers */

function readNutrient(
  raw: string | undefined,
  key: NutrientKey,
  issues: Issue[],
  approx: NutrientKey[],
): number | null {
  if (raw === undefined) return null;
  if (isMissingMarker(raw)) return null;
  const n = parseNumber(raw);
  if (!n) {
    issues.push({ level: "warning", field: key, message: `Could not read ${key} value “${raw}”.` });
    return null;
  }
  let value = n.value;
  if (key === "calories" && /\bkj\b/i.test(raw) && !/kcal/i.test(raw)) {
    value = value / 4.184;
    issues.push({ level: "info", field: key, message: `Energy given in kJ (${raw}); converted to ${Math.round(value)} kcal.` });
  }
  if (n.approximate) approx.push(key);
  if (n.range) {
    issues.push({
      level: "warning",
      field: key,
      message: `${cap(key)} was given as a range (${n.range[0]}–${n.range[1]}); the midpoint ${round1(value)} is used. Edit it if you know the exact value.`,
    });
  }
  if (n.bound) {
    issues.push({
      level: "info",
      field: key,
      message: `${cap(key)} was given as “${raw.trim()}”; recorded as ${value} (the stated bound).`,
    });
  }
  return key === "calories" ? Math.round(value) : round1(value);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readScore(raw: string | undefined, issues: Issue[]): { score: number | null; scale: number | null } {
  if (!raw) return { score: null, scale: null };
  const m = /(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+)/i.exec(raw);
  if (m) {
    const score = parseFloat(m[1]);
    const scale = parseFloat(m[2]);
    if (scale > 0 && score <= scale) return { score, scale };
  }
  const n = parseNumber(raw);
  if (n && n.value <= 100) return { score: n.value, scale: n.value <= 10 ? 10 : 100 };
  issues.push({ level: "info", field: "foodScore", message: `Food score “${raw}” is not numeric, so it was not recorded.` });
  return { score: null, scale: null };
}

function tidy(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\s{2,}/g, " ").replace(/^[\s:–—\-|,]+|[\s:–—\-|,]+$/g, "").trim();
  return t || null;
}

/** "Poha with peanuts, 1 plate (~200 g)" → name + quantity. */
function splitNameQuantity(s: string): { name: string; quantity: string | null } {
  const m = /^(.*?[A-Za-z].*?),\s*((?:~|approx\.?\s*|about\s+)?(?:\d|one\b|two\b|half\b|a\s+(?:cup|bowl|plate|glass|piece|katori)).*)$/i.exec(s);
  if (m) return { name: m[1].trim(), quantity: m[2].trim() };
  return { name: s, quantity: null };
}

/* ---------------------------------------------------------------- entries */

/**
 * Pull labelled fragments out of free text such as
 * "Lite coffee 150 ml — Score: 7/10" or "Poha (Score 6/10) | Qty: 1 plate".
 * Returns the text without those fragments and the fields found.
 */
export function splitInlineFields(text: string): { rest: string; found: Partial<Record<EntryField, string>> } {
  const found: Partial<Record<EntryField, string>> = {};
  let t = text.replace(/[(\[]\s*([A-Za-z][A-Za-z ]{1,30}?)\s*[:=]?\s*(\d[^)\]]*)[)\]]/g, (whole, k: string, v: string) => {
    const f = lookupEntryField(k);
    if (f && f !== "name" && f !== "description") {
      found[f] ??= v.trim();
      return " ";
    }
    return whole;
  });
  const parts = t.split(/\s+[—–]\s+|\s+\|\s+|\s+-\s+(?=[A-Za-z][A-Za-z ]{1,30}\s*:)/);
  const keep: string[] = [];
  for (const part of parts) {
    const kv = /^([A-Za-z][A-Za-z ]{1,30}?)\s*:\s*(.+)$/.exec(part.trim());
    const f = kv ? lookupEntryField(kv[1]) : null;
    if (kv && f && f !== "name" && f !== "description") found[f] ??= kv[2].trim();
    else keep.push(part);
  }
  t = keep.join(" — ").replace(/\s{2,}/g, " ").trim();
  return { rest: t, found };
}

function normalizeEntry(raw: RawEntry, i: number): ParsedEntry {
  const issues: Issue[] = [];
  const approx: NutrientKey[] = [];
  // Work on a copy; inline fragments in names/descriptions fill missing fields.
  const f: Partial<Record<EntryField, string>> = { ...raw.fields };
  const absorb = (text: string | null | undefined): string | null => {
    if (!text) return text ?? null;
    const { rest, found } = splitInlineFields(text);
    for (const [k, v] of Object.entries(found)) f[k as EntryField] ??= v;
    return rest || null;
  };
  if (f.name) f.name = absorb(f.name) ?? undefined;
  if (f.description) f.description = absorb(f.description) ?? undefined;
  raw = { ...raw, headerRemainder: absorb(raw.headerRemainder), extra: raw.extra.map((x) => absorb(x) ?? "").filter(Boolean) };

  const time = raw.time ?? (f.time ? parseTimeText(f.time) : null);
  if (f.time && !time) issues.push({ level: "warning", field: "time", message: `Could not read time “${f.time}”.` });

  const label = tidy(raw.categoryLabel ?? f.category ?? null);
  const mealCategory = inferMealCategory(label, time);

  let name = tidy(f.name);
  let quantity = tidy(f.quantity);
  let description = tidy(f.description);
  const extras = raw.extra.map(tidy).filter((x): x is string => !!x);

  if (!name && raw.headerRemainder) {
    const split = splitNameQuantity(raw.headerRemainder);
    name = tidy(split.name);
    if (!quantity && split.quantity) quantity = split.quantity;
  } else if (name && raw.headerRemainder && !description) {
    description = tidy(raw.headerRemainder);
  }
  if (!name && extras.length) name = extras.shift() ?? null;
  if (!name && description) {
    name = description.split(/[,;]/)[0].trim();
  }
  if (extras.length) {
    const joined = extras.join("; ");
    description = description ? `${description}; ${joined}` : joined;
  }
  if (!name && label) {
    name = label;
    issues.push({ level: "warning", field: "mealName", message: "No food name was given; the meal label is used as the name." });
  }

  const values = emptyNutrients();
  const missing: NutrientKey[] = [];
  const unavailable: NutrientKey[] = [];
  for (const k of NUTRIENT_KEYS) {
    const rawVal = f[k];
    if (rawVal === undefined) missing.push(k);
    else if (isMissingMarker(rawVal)) unavailable.push(k);
    values[k] = readNutrient(rawVal, k, issues, approx);
  }

  const { score, scale } = readScore(f.score, issues);

  if (!name) issues.push({ level: "error", field: "mealName", message: "This entry has no food name. Add one or exclude the entry." });
  if (NUTRIENT_KEYS.every((k) => values[k] === null)) {
    issues.push({ level: "error", field: "calories", message: "No nutrition values could be read for this entry. Enter them or exclude the entry." });
  } else if (values.calories === null) {
    issues.push({ level: "warning", field: "calories", message: "Calories are missing; daily calorie totals will be incomplete until you add them." });
  }
  const missingMacros = [...missing, ...unavailable].filter((k) => k !== "calories");
  if (missingMacros.length && values.calories !== null) {
    issues.push({
      level: "info",
      message: `Not supplied: ${missingMacros.join(", ")}. These stay blank (not zero).`,
    });
  }
  if (!time) issues.push({ level: "info", field: "time", message: "No time given; the entry keeps its position in the report." });

  // Consistency check between stated calories and macro-derived energy.
  if (values.calories !== null && values.protein !== null && values.carbs !== null && values.fat !== null) {
    const implied = values.protein * 4 + values.carbs * 4 + values.fat * 9;
    const diff = Math.abs(implied - values.calories);
    if (diff > Math.max(60, values.calories * 0.25)) {
      issues.push({
        level: "warning",
        message: `Macros imply about ${Math.round(implied)} kcal, but the entry lists ${values.calories} kcal. Check the values.`,
      });
    }
  }

  return {
    key: `e${i}`,
    include: true,
    entryNumber: raw.number,
    time,
    mealCategory,
    mealLabel: label,
    mealName: name ?? "",
    description,
    quantity,
    brand: detectBrand(name, description, quantity),
    ...values,
    foodScore: score,
    foodScoreScale: scale,
    approximateFields: approx,
    missingFields: missing,
    reportedUnavailable: unavailable,
    issues,
  };
}

/* --------------------------------------------------------------- activity */

function num(raw: string | undefined, kind: "int" | "dec" = "dec"): number | null {
  if (raw === undefined || isMissingMarker(raw)) return null;
  const k = /(\d+(?:\.\d+)?)\s*k\b/i.exec(raw);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const n = parseNumber(raw);
  if (!n) return null;
  return kind === "int" ? Math.round(n.value) : round1(n.value);
}

function minutes(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  return parseDurationMinutes(raw) ?? num(raw);
}

function km(raw: string | undefined, issues: Issue[]): number | null {
  if (raw === undefined || isMissingMarker(raw)) return null;
  const d = parseDistanceKm(raw);
  if (d !== null) return d;
  const n = num(raw);
  if (n !== null) issues.push({ level: "info", field: "distanceKm", message: `Distance “${raw}” has no unit; read as kilometres.` });
  return n;
}

function normalizeActivity(raw: RawReport, issues: Issue[]): ParsedActivity | null {
  const v = raw.activity.value;
  const g = raw.activity.goal;
  if (!Object.keys(v).length && !Object.keys(g).length) return null;
  const a: ParsedActivity = {
    moveCalories: num(v.move, "int"),
    moveGoal: num(g.move, "int"),
    exerciseMinutes: minutes(v.exercise),
    exerciseGoal: minutes(g.exercise),
    standHours: num(v.stand),
    standGoal: num(g.stand),
    steps: num(v.steps, "int"),
    distanceKm: km(v.distance, issues),
  };
  if (a.standHours !== null && a.standHours > 24) {
    issues.push({ level: "warning", field: "standHours", message: `Stand hours (${a.standHours}) exceed 24; check the value.` });
  }
  return a;
}

function normalizeWorkout(w: RawWorkout, i: number): ParsedWorkout {
  const text = [w.name, w.text].filter(Boolean).join(" — ");
  const name =
    tidy(w.name) ??
    tidy(w.text.split(/\s+[—–-]\s+|[:,·|(]/)[0].replace(/\d.*$/, "")) ??
    "Workout";
  const calMatch = /(\d[\d,]*)\s*(?:kcal|cal|calories)\b/i.exec(w.calories ?? w.text);
  const hrMatch = /(\d{2,3})\s*bpm/i.exec(w.heartRate ?? w.text);
  return {
    key: `w${i}`,
    include: true,
    name,
    type: inferWorkoutType(text),
    durationMin: parseDurationMinutes(w.duration ?? w.text) ?? (w.duration ? num(w.duration) : null),
    distanceKm: parseDistanceKm(w.distance ?? w.text),
    calories: calMatch ? Math.round(parseFloat(calMatch[1].replace(/,/g, ""))) : w.calories ? num(w.calories, "int") : null,
    avgHeartRate: hrMatch ? +hrMatch[1] : w.heartRate ? num(w.heartRate, "int") : null,
    raw: text,
  };
}

/* ----------------------------------------------------------------- energy */

export function extractEnergyBalance(lines: string[]): number | null {
  for (const line of lines) {
    const t = line.replace(/−/g, "-");
    let m = /(deficit|surplus)[^\d]{0,40}?(\d[\d,]*)(?:\s*(?:-|–|to)\s*(\d[\d,]*))?\s*kcal/i.exec(t);
    if (!m) {
      const m2 = /(\d[\d,]*)(?:\s*(?:-|–|to)\s*(\d[\d,]*))?\s*kcal\s*(?:\w+\s+){0,2}(deficit|surplus)/i.exec(t);
      if (m2) m = [m2[0], m2[3], m2[1], m2[2]] as unknown as RegExpExecArray;
    }
    if (m) {
      const a = parseFloat(m[2].replace(/,/g, ""));
      const b = m[3] ? parseFloat(m[3].replace(/,/g, "")) : a;
      const v = Math.round((a + b) / 2);
      return /deficit/i.test(m[1]) ? -v : v;
    }
    const b = /balance[^\d+-]{0,20}([+-]\s*\d[\d,]*)\s*kcal/i.exec(t);
    if (b) return parseInt(b[1].replace(/[\s,]/g, ""), 10);
  }
  return null;
}

/* ------------------------------------------------------------------- main */

export function normalizeReport(raw: RawReport, opts: NormalizeOptions = {}): ParsedReport {
  const issues: Issue[] = [];
  const year = opts.referenceYear ?? new Date().getFullYear();

  // ---- metadata
  const titleText = raw.titleLines.join(" ");
  const dateSource = raw.meta.date ?? titleText;
  const pd = (raw.meta.date && parseDateText(raw.meta.date, year)) || parseDateText(titleText, year);
  if (!pd) {
    issues.push({ level: "error", field: "date", message: "No report date was found. Set the date before importing." });
  } else {
    for (const n of pd.notes) issues.push({ level: "warning", field: "date", message: n });
  }
  const statedDay = findWeekday(raw.meta.day ?? "") ?? findWeekday(dateSource);
  let dayOfWeek: string | null = statedDay;
  if (pd) {
    const [y, m, d] = pd.iso.split("-").map(Number);
    const actual = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    if (statedDay && statedDay !== actual) {
      issues.push({
        level: "warning",
        field: "date",
        message: `The report says ${statedDay}, but ${pd.iso} is a ${actual}. Check the date.`,
      });
    }
    dayOfWeek = actual;
  }
  let timezone = tidy(raw.meta.timezone);
  if (!timezone && /\bIST\b|Asia\/Kolkata/i.test(titleText)) timezone = "Asia/Kolkata";

  const metadata: ReportMetadata = {
    date: pd?.iso ?? null,
    dayOfWeek,
    timezone,
    goal: tidy(raw.meta.goal),
    weightKg: raw.meta.weight ? parseWeightKg(raw.meta.weight) : null,
    heightCm: raw.meta.height ? parseHeightCm(raw.meta.height) : null,
  };
  if (raw.meta.weight && metadata.weightKg === null) {
    issues.push({ level: "warning", field: "weight", message: `Could not read body weight “${raw.meta.weight}”.` });
  }

  // ---- entries
  const entries = raw.entries.map(normalizeEntry);
  if (!entries.length) {
    issues.push({ level: raw.activity && Object.keys(raw.activity.value).length ? "warning" : "error", message: "No food entries were found in this report." });
  }
  // Duplicate entry numbers usually mean two meals were merged or mis-split.
  const nums = entries.map((e) => e.entryNumber).filter((n): n is number => n !== null);
  if (new Set(nums).size !== nums.length) {
    issues.push({ level: "warning", message: "Some entry numbers appear more than once. Review the entries list." });
  }

  // ---- totals and targets (exactly as reported)
  const totalIssues: Issue[] = [];
  const reportedTotals = emptyNutrients();
  const reportedTargets = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    reportedTotals[k] = readNutrient(raw.totals.consumed[k], k, totalIssues, []);
    reportedTargets[k] = readNutrient(raw.totals.target[k], k, totalIssues, []);
  }
  issues.push(...totalIssues.filter((i) => i.level !== "info"));

  const activity = normalizeActivity(raw, issues);
  const workouts = raw.workouts.filter((w) => w.text || w.name || w.duration).map(normalizeWorkout);

  if (raw.unrecognized.length) {
    issues.push({
      level: "info",
      message: `${raw.unrecognized.length} line(s) were not recognised and were not imported. They are listed below the preview.`,
    });
  }

  return {
    parserVersion: PARSER_VERSION,
    metadata,
    entries,
    reportedTotals,
    reportedTargets,
    activity,
    workouts,
    energyBalanceText: raw.energy.length ? raw.energy.join("\n") : null,
    energyBalanceKcal: extractEnergyBalance(raw.energy),
    notes: raw.notes,
    uncertainties: raw.uncertainties,
    ignored: raw.ignored,
    unrecognized: raw.unrecognized,
    issues,
  };
}
