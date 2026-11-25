/**
 * Stage 1 — structural parsing.
 *
 * Turns pasted report text into a RawReport: which lines are entries, totals,
 * activity, notes, etc., with values still as *strings*. No numbers are
 * interpreted here (see normalize.ts), so this stage never invents data.
 */
import type { NutrientKey } from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import {
  cleanLine,
  normalizeText,
  parseDistanceKm,
  parseDurationMinutes,
  parseTimeText,
  type CleanLine,
} from "./text";
import {
  MEAL_WORD_RE,
  WORKOUT_DETAIL_KEYS,
  WORKOUT_KEYS,
  classifySection,
  isGoalLabel,
  lookupActivityField,
  lookupEntryField,
  lookupMetaField,
  lookupNutrient,
  normKey,
  type ActivityField,
  type EntryField,
  type MetaField,
  type SectionKind,
} from "./labels";

export interface RawEntry {
  index: number;
  line: number;
  header: string | null;
  number: number | null;
  time: string | null;
  categoryLabel: string | null;
  headerRemainder: string | null;
  fields: Partial<Record<EntryField, string>>;
  extra: string[];
}

export interface RawWorkout {
  text: string;
  name: string | null;
  duration: string | null;
  distance: string | null;
  calories: string | null;
  heartRate: string | null;
}

export interface RawReport {
  meta: Partial<Record<MetaField, string>>;
  titleLines: string[];
  entries: RawEntry[];
  totals: {
    consumed: Partial<Record<NutrientKey, string>>;
    target: Partial<Record<NutrientKey, string>>;
  };
  activity: {
    value: Partial<Record<ActivityField, string>>;
    goal: Partial<Record<ActivityField, string>>;
  };
  workouts: RawWorkout[];
  energy: string[];
  notes: string[];
  uncertainties: string[];
  /** Lines in analysis sections (e.g. "meal distribution") deliberately skipped. */
  ignored: string[];
  /** Lines the parser could not place anywhere. Shown in the preview. */
  unrecognized: string[];
}

type Section = SectionKind | "analysis";

/* ------------------------------------------------------- key/value helpers */

const KV_RE = /^([A-Za-z][A-Za-z0-9 '\/&()+.,%#-]{0,48}?)\s*[:：=]\s*(.*)$/;

export function splitKeyValue(text: string): { key: string; value: string } | null {
  const m = KV_RE.exec(text);
  if (!m) return null;
  const key = m[1].trim();
  const value = m[2].trim();
  // "Breakfast (08:30)" — the colon belongs to a clock time, not a label.
  if (/\d$/.test(key) && /^\d/.test(value)) return null;
  if (!/[A-Za-z]{2,}|^[PCFpcf]$/.test(key)) return null;
  return { key, value };
}

/** Split "A: 1 | B: 2" (or ";"-separated) into key/value segments when every segment is one. */
function splitSegments(text: string): { key: string; value: string }[] | null {
  for (const sep of [/\s*\|\s*/, /\s*;\s*/, /\s+[•·]\s+/]) {
    const parts = text.split(sep).filter(Boolean);
    if (parts.length < 2) continue;
    const kvs = parts.map(splitKeyValue);
    if (kvs.every(Boolean)) return kvs as { key: string; value: string }[];
  }
  return null;
}

/* ---------------------------------------------------- inline nutrient scan */

const VAL = String.raw`((?:~|≈|approx\.?\s*|about\s+|around\s+|<\s*|>\s*)?\d[\d,]*(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d[\d,]*(?:\.\d+)?)?|n\/?a|—|unknown|not available)`;
const LABEL_FIRST = new RegExp(
  String.raw`(?<![A-Za-z])(calories|kcal|energy|cals?|protein|prot|carbohydrates?|carbs?|fats?|dietary\s+fib(?:er|re)|fib(?:er|re)|fib|p|c|f)\s*(?:[:=]\s*|-\s+|\s+|(?=\d|~))${VAL}\s*(kcal|cal|g|gm|grams?)?(?![A-Za-z])`,
  "gi",
);
const VALUE_FIRST_KCAL = new RegExp(String.raw`${VAL}\s*(kcal|calories|cals?)(?![A-Za-z])`, "gi");
const VALUE_FIRST_MACRO = new RegExp(
  String.raw`${VAL}\s*(?:g|gm|grams?)\s*(?:of\s+)?(protein|carbohydrates?|carbs?|fats?|fib(?:er|re))(?![A-Za-z])`,
  "gi",
);

function nutrientFromWord(w: string): NutrientKey | null {
  const t = w.toLowerCase().replace(/\s+/g, " ");
  if (/^(calories|kcal|energy|cals?)$/.test(t)) return "calories";
  if (/^(protein|prot|p)$/.test(t)) return "protein";
  if (/^(carbohydrates?|carbs?|c)$/.test(t)) return "carbs";
  if (/^(fats?|f)$/.test(t)) return "fat";
  if (/fib/.test(t)) return "fiber";
  return null;
}

/**
 * Find labelled nutrient values anywhere in a line, e.g.
 * "340 kcal | P: 19 g | C 33g | F: 13 g | Fiber 5 g".
 * Returns the values found and the line with those tokens removed.
 */
export function scanNutrients(text: string): {
  found: Partial<Record<NutrientKey, string>>;
  rest: string;
} {
  const found: Partial<Record<NutrientKey, string>> = {};
  const spans: [number, number][] = [];
  const take = (re: RegExp, keyIdx: number, valIdx: number) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const key = nutrientFromWord(m[keyIdx]);
      if (!key) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(([a, b]) => start < b && end > a)) continue;
      // Single-letter labels ("P 7g") need a unit or an explicit colon to count.
      if (/^[pcf]$/i.test(m[keyIdx]) && !/[:=]/.test(m[0]) && !m[valIdx + 1]) continue;
      // "Calories" label with a bare number that is clearly a percentage — skip.
      if (/%/.test(text.slice(end, end + 2))) continue;
      if (found[key] === undefined) found[key] = m[valIdx].trim();
      spans.push([start, end]);
    }
  };
  take(LABEL_FIRST, 1, 2);
  take(VALUE_FIRST_MACRO, 2, 1);
  take(VALUE_FIRST_KCAL, 2, 1);
  let rest = text;
  for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) {
    rest = rest.slice(0, a) + " " + rest.slice(b);
  }
  rest = rest.replace(/[|,;•·()[\]]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return { found, rest };
}

/* ------------------------------------------------------ value + goal split */

/** "642 / 600 kcal", "642 of 600", "642 kcal (goal: 600)" → value and goal strings. */
export function splitValueAndGoal(v: string): { value: string; goal: string | null } {
  let m = /^(.*?\d[\d,.]*\s*[a-z]*)\s*(?:\/|out of|of)\s*(\d[\d,.]*.*)$/i.exec(v);
  if (m && /\d/.test(m[1])) return { value: m[1].trim(), goal: m[2].trim() };
  m = /^(.*?)[\s,(]*(?:goal|target)\s*(?:[:=]|of|is)?\s*([^)]*)\)?(.*)$/i.exec(v);
  if (m && /\d/.test(m[1]) && /\d/.test(m[2])) return { value: m[1].trim(), goal: m[2].trim() };
  return { value: v.trim(), goal: null };
}

/* ---------------------------------------------------------- activity scan */

const N = String.raw`~?\s*\d[\d,]*(?:\.\d+)?(?:\s*k(?![a-z]))?`;
const SEP = String.raw`\s*(?:[:=]|[-–—]|is|of|was)?\s*`;
const GOAL = String.raw`(?:\s*(?:\/|of|out of)\s*(\d[\d,]*(?:\.\d+)?))?`;

/**
 * Find Apple Watch metrics written as free text: "Steps — 8,432",
 * "8,432 steps", "Move 520/600 kcal", "Stand 9 of 12 hrs", "6.1 km".
 * Values are returned as strings for normalisation.
 */
export function scanActivity(text: string): {
  value: Partial<Record<ActivityField, string>>;
  goal: Partial<Record<ActivityField, string>>;
} {
  const t = text.replace(/\*\*|__/g, "");
  const value: Partial<Record<ActivityField, string>> = {};
  const goal: Partial<Record<ActivityField, string>> = {};
  let m = new RegExp(String.raw`\b(?:steps?|step count|total steps)${SEP}(${N})(?!\s*(?:min|kcal|km|%))`, "i").exec(t) ?? null;
  if (m) value.steps = m[1];
  else if ((m = new RegExp(String.raw`(${N})\s*steps\b`, "i").exec(t))) value.steps = m[1];
  if ((m = new RegExp(String.raw`\b(?:move(?: calories)?|active (?:calories|energy))${SEP}(${N})${GOAL}\s*(?:kcal|cal|calories)?`, "i").exec(t))) {
    value.move = m[1];
    if (m[2]) goal.move = m[2];
  }
  if ((m = new RegExp(String.raw`\bexercise(?: minutes| time)?${SEP}(\d+)${GOAL}\s*(?:min|mins|minutes)\b`, "i").exec(t))) {
    value.exercise = m[1];
    if (m[2]) goal.exercise = m[2];
  }
  if ((m = new RegExp(String.raw`\bstand(?: hours)?${SEP}(\d+)${GOAL}\s*(?:hr|hrs|hours|h)?\b`, "i").exec(t))) {
    value.stand = m[1];
    if (m[2]) goal.stand = m[2];
  }
  const hasKeyword = Object.keys(value).length > 0 || /\bdistance\b/i.test(t);
  if (hasKeyword && (m = /(\d+(?:\.\d+)?)\s*(km|kms|mi|miles)\b/i.exec(t))) value.distance = `${m[1]} ${m[2]}`;
  return { value, goal };
}

const ACTIVITY_SUMMARY_KEY = /^(apple watch|watch|activity|activity summary|daily activity|watch data|apple watch data|rings|fitness)$/;

/* ------------------------------------------------------------ entry header */

const ENTRY_LABEL_RE = /^(?:entry|meal|food(?:\s+entry)?|item|log)\s*(?:#|no\.?|number)?\s*(\d{1,2})\b[\s:.)\]–—|-]*/i;
const NUMBERED_RE = /^#?(\d{1,2})\s*[).:\]]\s*(?:[-–—]\s*)?/;
const LEADING_MEAL_RE = new RegExp(String.raw`^\(?\s*${MEAL_WORD_RE.source}`, "i");

function headerLike(cl: CleanLine): boolean {
  return cl.heading > 0 || cl.boldOnly;
}

/** Decide whether a line opens a new food entry, and pull apart its header. */
function detectEntryHeader(cl: CleanLine, section: Section): Omit<RawEntry, "index" | "line" | "fields" | "extra"> | null {
  const text = cl.text;
  if (!text || section === "totals" || section === "activity" || section === "workouts" || section === "energy" || section === "uncertainty" || section === "analysis") {
    return null;
  }
  // Notes often contain numbered advice mentioning meals; never treat them as entries.
  if (section === "notes") return null;

  let number: number | null = null;
  let rest = text;
  let strong = false;

  let m = ENTRY_LABEL_RE.exec(text);
  if (m) {
    number = +m[1];
    rest = text.slice(m[0].length);
    strong = true;
  } else if ((m = NUMBERED_RE.exec(text))) {
    const after = text.slice(m[0].length);
    if (LEADING_MEAL_RE.test(after) || parseTimeText(after.slice(0, 30))) {
      number = +m[1];
      rest = after;
      strong = true;
    }
  }

  const time = parseTimeText(rest);
  const mealMatch = MEAL_WORD_RE.exec(rest);

  if (!strong) {
    const kv = splitKeyValue(text);
    // "Breakfast (8:10 AM): Poha …" / "### Breakfast — 8:10 AM"
    const startsWithMeal = LEADING_MEAL_RE.test(text);
    if (headerLike(cl) && mealMatch) strong = true;
    else if (startsWithMeal && (time || (kv && lookupEntryField(kv.key) === null && kv.value.length > 0))) strong = true;
    if (!strong) return null;
  }

  // Pull out the category label and leave the meal name candidate.
  let categoryLabel: string | null = null;
  let remainder = rest;
  if (mealMatch) {
    categoryLabel = mealMatch[0]
      .replace(/\s+/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
    remainder = remainder.replace(mealMatch[0], " ");
  }
  remainder = remainder
    .replace(/\b\d{1,2}[:.]\d{2}\s*[ap]\.?\s*m\b\.?/gi, " ")
    .replace(/\b\d{1,2}\s*[ap]\.?\s*m\b\.?/gi, " ")
    .replace(/(^|[^\d.])([01]?\d|2[0-3]):([0-5]\d)(\s*(?:hrs?|h)\b)?/g, "$1 ")
    .replace(/\(\s*(?:at|~|approx\.?)?\s*\)/g, " ")
    .replace(/\b(?:at|@)\s*(?=[|,–—:-]|$)/gi, " ")
    .replace(/(\s*\|\s*)+/g, " | ")
    .replace(/^[\s|:–—\-,.()]+|[\s|:–—\-,.(]+$/g, "")
    .replace(/^\)\s*/, "")
    .trim();

  return {
    header: text,
    number,
    time,
    categoryLabel,
    headerRemainder: remainder || null,
  };
}

/* ------------------------------------------------------------------ tables */

type ColRole =
  | { kind: "nutrient"; key: NutrientKey }
  | { kind: "time" | "meal" | "food" | "description" | "quantity" | "score" | "number" | "metric" | "consumed" | "target" | "remaining" | "percent" | "unknown" };

function colRole(header: string): ColRole {
  const h = normKey(header);
  const raw = header.toLowerCase();
  if (/^(#|no|sr|s no|entry|n)$/.test(h) || raw.trim() === "#") return { kind: "number" };
  if (/remaining|left|balance/.test(h)) return { kind: "remaining" };
  if (/%|percent|progress|completion/.test(raw)) return { kind: "percent" };
  if (/^(target|goal|daily target|target value|goal value)$/.test(h)) return { kind: "target" };
  if (/^(consumed|intake|actual|total|today|value|amount|achieved|logged|eaten|result|current)$/.test(h)) return { kind: "consumed" };
  if (/^(nutrient|metric|macro|macros|parameter|measure|category|item name|stat|ring)$/.test(h)) return { kind: "metric" };
  const n = lookupNutrient(header);
  if (n) return { kind: "nutrient", key: n };
  if (/^(time|timestamp|when)$/.test(h)) return { kind: "time" };
  if (/^(meal|meal type|meal category|slot|occasion)$/.test(h)) return { kind: "meal" };
  if (/^(food|item|items|dish|food item|food name|meal name|what|name)$/.test(h)) return { kind: "food" };
  if (/^(description|details|contents|components)$/.test(h)) return { kind: "description" };
  if (/^(qty|quantity|portion|serving|amount g|size)$/.test(h)) return { kind: "quantity" };
  if (/score|quality|rating/.test(h)) return { kind: "score" };
  return { kind: "unknown" };
}

function splitRow(row: string): string[] {
  const t = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => cleanLine(c).text.trim());
}

/* ------------------------------------------------------------------- main */

export function parseReportStructure(input: string): RawReport {
  const report: RawReport = {
    meta: {},
    titleLines: [],
    entries: [],
    totals: { consumed: {}, target: {} },
    activity: { value: {}, goal: {} },
    workouts: [],
    energy: [],
    notes: [],
    uncertainties: [],
    ignored: [],
    unrecognized: [],
  };

  const lines = normalizeText(input).split("\n");
  let section: Section = "meta";
  let entry: RawEntry | null = null;
  let seenContent = 0;

  const closeEntry = () => {
    entry = null;
  };

  const newEntry = (h: Omit<RawEntry, "index" | "line" | "fields" | "extra">, line: number): RawEntry => {
    const e: RawEntry = { ...h, index: report.entries.length, line, fields: {}, extra: [] };
    report.entries.push(e);
    return e;
  };

  const lastWorkout = (): RawWorkout => {
    if (!report.workouts.length) {
      report.workouts.push({ text: "", name: null, duration: null, distance: null, calories: null, heartRate: null });
    }
    return report.workouts[report.workouts.length - 1];
  };

  const setTotal = (key: NutrientKey, value: string, label: string) => {
    if (/remaining|left|%|percent/i.test(label)) return;
    if (isGoalLabel(label)) {
      report.totals.target[key] ??= value;
      return;
    }
    const { value: v, goal } = splitValueAndGoal(value);
    report.totals.consumed[key] ??= v;
    if (goal) report.totals.target[key] ??= goal;
  };

  const setActivity = (field: ActivityField, label: string, value: string) => {
    if (isGoalLabel(label)) {
      report.activity.goal[field] ??= value;
      return;
    }
    const { value: v, goal } = splitValueAndGoal(value);
    report.activity.value[field] ??= v;
    if (goal) report.activity.goal[field] ??= goal;
  };

  /** Handle one key/value pair. Returns false when nothing claimed it. */
  const handleKV = (key: string, value: string, wholeLine: string): boolean => {
    const k = normKey(key);

    // Totals anywhere: "Total Calories: 1,757" / "Daily Total: 1,757 kcal | P 126 g"
    if (/^(?:daily |grand |day )?totals?\b/.test(k) || section === "totals") {
      const n = lookupNutrient(key);
      if (n) {
        setTotal(n, value, key);
        return true;
      }
      if (/^(?:daily |grand |day )?totals?$/.test(k)) {
        const { found } = scanNutrients(value);
        for (const [nk, v] of Object.entries(found)) setTotal(nk as NutrientKey, v!, key);
        return Object.keys(found).length > 0;
      }
    }

    // Activity data never belongs to a food entry: close the entry and record it.
    if (entry && !lookupEntryField(key)) {
      const afKey = lookupActivityField(key.replace(/\b(goal|target)\b/gi, "").trim() || key);
      if (afKey || ACTIVITY_SUMMARY_KEY.test(k)) closeEntry();
    }
    if (ACTIVITY_SUMMARY_KEY.test(k) && section !== "notes") {
      const sa = scanActivity(value);
      if (Object.keys(sa.value).length) {
        for (const [f2, v] of Object.entries(sa.value)) report.activity.value[f2 as ActivityField] ??= v;
        for (const [f2, v] of Object.entries(sa.goal)) report.activity.goal[f2 as ActivityField] ??= v;
        return true;
      }
    }

    if (entry) {
      const f = lookupEntryField(key);
      if (f) {
        if (NUTRIENT_KEYS.includes(f as NutrientKey)) {
          entry.fields[f] ??= value;
        } else if (f === "name" && entry.fields.name) {
          entry.fields.description = entry.fields.description ? `${entry.fields.description}; ${value}` : value;
        } else if (f === "description" && entry.fields.description) {
          entry.fields.description += `; ${value}`;
        } else {
          entry.fields[f] ??= value;
        }
        return true;
      }
    }

    if (section !== "activity" && section !== "totals" && !entry) {
      const meta = lookupMetaField(key);
      if (meta) {
        report.meta[meta] ??= value;
        return true;
      }
    }

    // Workout details.
    if (!entry || section === "activity" || section === "workouts") {
      if (WORKOUT_KEYS.includes(k)) {
        report.workouts.push({ text: value, name: null, duration: null, distance: null, calories: null, heartRate: null });
        return true;
      }
      const wd = WORKOUT_DETAIL_KEYS[k];
      if (wd && (section === "workouts" || k.startsWith("workout") || section === "activity")) {
        const w = lastWorkout();
        if (wd === "name") w.name ??= value;
        else if (wd === "duration") w.duration ??= value;
        else if (wd === "distance") w.distance ??= value;
        else if (wd === "calories") w.calories ??= value;
        else w.heartRate ??= value;
        return true;
      }
      const af = lookupActivityField(key.replace(/\b(goal|target)\b/gi, "").trim() || key);
      if (af && section !== "notes" && section !== "totals" && section !== "energy" && section !== "uncertainty") {
        setActivity(af, key, value);
        return true;
      }
      // "Outdoor Walk: 4.2 km, 46 min" inside an activity/workouts section.
      if ((section === "workouts" || section === "activity") && (parseDurationMinutes(value) !== null || parseDistanceKm(value) !== null)) {
        report.workouts.push({ text: value, name: key, duration: null, distance: null, calories: null, heartRate: null });
        return true;
      }
    }

    if (/energy balance|calorie balance|net calories|deficit|surplus|tdee|expenditure/.test(k)) {
      report.energy.push(wholeLine);
      return true;
    }
    if (!entry && /^(notes?|remarks?|comments?|observations?)$/.test(k)) {
      if (value) report.notes.push(value);
      return true;
    }
    if (!entry && /uncertaint|assumption|caveat|confidence/.test(k)) {
      if (value) report.uncertainties.push(value);
      return true;
    }
    return false;
  };

  /** Interpret a block of markdown table rows. */
  const handleTable = (rows: string[]) => {
    const data = rows.filter((r) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(r.trim()));
    if (!data.length) return;
    const header = splitRow(data[0]);
    const roles = header.map(colRole);
    const body = data.slice(1).map(splitRow);
    const nutrientCols = roles.filter((r) => r.kind === "nutrient").length;
    const has = (kind: string) => roles.some((r) => r.kind === kind);

    if (section === "analysis" || section === "notes") {
      report.ignored.push(...data);
      return;
    }

    // Entries table: one row per food, nutrient columns across.
    if (nutrientCols >= 2) {
      closeEntry();
      for (const cells of body) {
        if (cells.every((c) => !c)) continue;
        const rowLabel = cells.find((c) => c) ?? "";
        if (/^(daily\s+|grand\s+)?totals?\b|^sum\b/i.test(rowLabel)) {
          roles.forEach((r, i) => {
            if (r.kind === "nutrient" && cells[i]) report.totals.consumed[r.key] ??= cells[i];
          });
          continue;
        }
        if (/^(targets?|goals?)\b/i.test(rowLabel)) {
          roles.forEach((r, i) => {
            if (r.kind === "nutrient" && cells[i]) report.totals.target[r.key] ??= cells[i];
          });
          continue;
        }
        if (/^remaining\b/i.test(rowLabel)) continue;
        const e = newEntry({ header: null, number: null, time: null, categoryLabel: null, headerRemainder: null }, -1);
        roles.forEach((r, i) => {
          const c = cells[i];
          if (!c) return;
          switch (r.kind) {
            case "nutrient":
              e.fields[r.key] = c;
              break;
            case "number":
              if (/^\d+$/.test(c)) e.number = +c;
              break;
            case "time":
              e.time = parseTimeText(c);
              if (!e.time) e.fields.time = c;
              break;
            case "meal":
              e.categoryLabel = c;
              if (!e.time) e.time = parseTimeText(c);
              break;
            case "food":
              e.fields.name = c;
              break;
            case "description":
              e.fields.description = c;
              break;
            case "quantity":
              e.fields.quantity = c;
              break;
            case "score":
              e.fields.score = c;
              break;
            default:
              break;
          }
        });
        if (!e.fields.name && e.categoryLabel) {
          // "Breakfast – Poha" in a single meal column
          const parts = e.categoryLabel.split(/\s+[-–—:]\s+/);
          if (parts.length > 1) {
            e.categoryLabel = parts[0];
            e.fields.name = parts.slice(1).join(" – ");
          }
        }
      }
      return;
    }

    // Metric tables: "| Nutrient | Consumed | Target |" or "| Ring | Value | Goal |"
    const metricIdx = roles.findIndex((r) => r.kind === "metric");
    const labelIdx = metricIdx >= 0 ? metricIdx : 0;
    const consumedIdx = roles.findIndex((r) => r.kind === "consumed");
    const targetIdx = roles.findIndex((r) => r.kind === "target");
    if (header.length >= 2) {
      const valueIdx = consumedIdx >= 0 ? consumedIdx : labelIdx === 0 ? 1 : 0;
      const processRow = (cells: string[], isHeader: boolean) => {
        const label = cells[labelIdx] ?? "";
        const value = cells[valueIdx] ?? "";
        const goal = targetIdx >= 0 ? cells[targetIdx] ?? "" : "";
        if (!label) return;
        const n = lookupNutrient(label);
        const af = lookupActivityField(label.replace(/\b(goal|target)\b/gi, "").trim() || label);
        if (n && (section === "totals" || /total/i.test(label) || has("target") || has("consumed"))) {
          if (value) setTotal(n, value, label);
          if (goal) report.totals.target[n] ??= goal;
          return;
        }
        if (af && !entry) {
          if (value) setActivity(af, label, value);
          if (goal) report.activity.goal[af] ??= goal;
          return;
        }
        if (isHeader) return;
        if (!handleKV(label, value, `${label}: ${value}`)) {
          report.unrecognized.push(cells.filter(Boolean).join(" | "));
        }
      };
      processRow(header, true);
      for (const cells of body) processRow(cells, false);
      return;
    }
    report.unrecognized.push(...data);
  };

  /* ---- line loop ---- */
  let tableBuf: string[] = [];
  const flushTable = () => {
    if (tableBuf.length) handleTable(tableBuf);
    tableBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cl = cleanLine(rawLine);

    if (cl.isTableRow) {
      tableBuf.push(rawLine.trim());
      continue;
    }
    flushTable();

    if (!cl.text || cl.isRule) continue;
    seenContent++;
    if (seenContent <= 6) report.titleLines.push(cl.text);

    // 1. New food entry?
    const eh = detectEntryHeader(cl, section);
    if (eh) {
      if (section !== "entries" && section !== "unknown" && section !== "meta") section = "entries";
      if (section === "meta") section = "entries";
      entry = newEntry(eh, i);
      // Inline nutrients on the header line itself.
      const { found, rest } = scanNutrients(eh.headerRemainder ?? "");
      if (Object.keys(found).length) {
        Object.assign(entry.fields, found);
        entry.headerRemainder = rest || null;
      }
      continue;
    }

    // 2. Section heading?
    const kvForHeading = splitKeyValue(cl.text);
    const looksLikeHeading =
      cl.heading > 0 ||
      cl.boldOnly ||
      (!kvForHeading && cl.text.length <= 60 && /^[A-Z0-9 &'()\/+:.,-]+$/.test(cl.text) && /[A-Z]{3,}/.test(cl.text)) ||
      (/:$/.test(cl.text) && cl.text.length <= 50 && !/\d/.test(cl.text)) ||
      // Plain one-to-four word titles such as "Activity" or "Notes".
      (!kvForHeading && cl.text.length <= 40 && !/\d/.test(cl.text) && cl.text.split(/\s+/).length <= 4 && classifySection(cl.text) !== "unknown");
    if (looksLikeHeading && !(kvForHeading && kvForHeading.value)) {
      const title = cl.text.replace(/:$/, "");
      const kind = /\b(distribution|by meal|per meal|meal timing|meal split|macro split|breakdown|score card|scorecard)\b/i.test(title)
        ? "analysis"
        : classifySection(title);
      closeEntry();
      if (kind !== "unknown") {
        section = kind;
        // A title such as "Daily Nutrition Journal — 25 Nov 2026" also carries the date.
        continue;
      }
      if (cl.heading > 0 || cl.boldOnly) {
        section = "unknown";
        continue;
      }
    }

    // 3. "TOTAL: …" lines close any open entry.
    if (/^(?:daily\s+|grand\s+|day\s+)?totals?\b/i.test(cl.text)) {
      closeEntry();
      const kv = splitKeyValue(cl.text);
      let handled = false;
      if (kv) handled = handleKV(kv.key, kv.value, cl.text);
      if (!handled) {
        const { found } = scanNutrients(cl.text.replace(/^(?:daily\s+|grand\s+|day\s+)?totals?\s*[:\-–—]?\s*/i, ""));
        for (const [nk, v] of Object.entries(found)) setTotal(nk as NutrientKey, v!, "total");
        handled = Object.keys(found).length > 0;
      }
      if (handled) continue;
    }

    // 4. Section-specific free text.
    if (!entry) {
      if (section === "energy") {
        report.energy.push(cl.text);
        continue;
      }
      if (section === "uncertainty") {
        report.uncertainties.push(cl.text);
        continue;
      }
      if (section === "analysis") {
        report.ignored.push(cl.text);
        continue;
      }
    }

    // 5. Key/value lines (possibly several per line).
    const segments = splitSegments(cl.text);
    if (segments) {
      // A line of labelled nutrients ("Calories: 320 | Protein: 7 g") within an entry.
      let any = false;
      const leftovers: string[] = [];
      for (const s of segments) {
        if (handleKV(s.key, s.value, `${s.key}: ${s.value}`)) any = true;
        else leftovers.push(`${s.key}: ${s.value}`);
      }
      if (any) {
        if (leftovers.length) (entry ? entry.extra : report.unrecognized).push(...leftovers);
        continue;
      }
    }

    const kv = kvForHeading;
    if (kv) {
      // An entry field whose value also carries more nutrients.
      if (entry && lookupNutrient(kv.key)) {
        const { found } = scanNutrients(cl.text);
        if (Object.keys(found).length > 1) {
          for (const [nk, v] of Object.entries(found)) entry.fields[nk as NutrientKey] ??= v;
          continue;
        }
      }
      if (handleKV(kv.key, kv.value, cl.text)) continue;
    }

    // 6a. Free-text activity ("8,432 steps", "Move 520/600 kcal | Stand 9/12 hr").
    {
      const inActivity = section === "activity" || section === "workouts";
      const sa = scanActivity(cl.text);
      const strong = sa.value.steps !== undefined || sa.value.move !== undefined || sa.value.stand !== undefined;
      if ((inActivity && Object.keys(sa.value).length) || (strong && section !== "notes" && section !== "energy")) {
        closeEntry();
        for (const [f2, v] of Object.entries(sa.value)) report.activity.value[f2 as ActivityField] ??= v;
        for (const [f2, v] of Object.entries(sa.goal)) report.activity.goal[f2 as ActivityField] ??= v;
        continue;
      }
    }

    // 6b. Inline nutrient runs inside an entry ("340 kcal | P 19 g | C 33 g").
    if (entry) {
      const { found, rest } = scanNutrients(cl.text);
      if (Object.keys(found).length) {
        for (const [nk, v] of Object.entries(found)) entry.fields[nk as NutrientKey] ??= v;
        if (rest && /[A-Za-z]{3,}/.test(rest)) entry.extra.push(rest);
        continue;
      }
      entry.extra.push(cl.text);
      continue;
    }

    // 7. Everything else, by section.
    if (section === "notes") {
      report.notes.push(cl.text);
      continue;
    }
    if (section === "workouts" || section === "activity") {
      if (parseDurationMinutes(cl.text) !== null || parseDistanceKm(cl.text) !== null) {
        report.workouts.push({ text: cl.text, name: null, duration: null, distance: null, calories: null, heartRate: null });
        continue;
      }
    }
    if (section === "totals") {
      const { found } = scanNutrients(cl.text);
      if (Object.keys(found).length) {
        for (const [nk, v] of Object.entries(found)) setTotal(nk as NutrientKey, v!, cl.text);
        continue;
      }
    }
    if (seenContent <= 6 && (section === "meta" || section === "unknown")) continue; // title lines
    report.unrecognized.push(cl.text);
  }
  flushTable();
  return report;
}
