const intFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Format a possibly-missing number. Missing values render as an em dash, never 0. */
export function fmt(
  v: number | null | undefined,
  opts: { decimals?: 0 | 1; unit?: string; signed?: boolean } = {},
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const f = opts.decimals === 1 ? oneFmt : intFmt;
  const sign = opts.signed && v > 0 ? "+" : "";
  const s = sign + f.format(opts.decimals === 1 ? v : Math.round(v));
  return opts.unit ? `${s} ${opts.unit}` : s;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

export function round(v: number, decimals = 1): number {
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalIn = cm / 2.54;
  let feet = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return round((feet * 12 + inches) * 2.54, 1);
}

export function formatHeight(cm: number | null): string {
  if (cm === null) return "—";
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″ (${Math.round(cm)} cm)`;
}

export const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning snack",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
  other: "Other",
};

export const NUTRIENT_LABELS: Record<string, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
};

export const NUTRIENT_UNITS: Record<string, string> = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fat: "g",
  fiber: "g",
};

export const MEASUREMENT_LABEL: Record<string, string> = {
  waistCm: "Waist",
  chestCm: "Chest",
  armCm: "Arm",
  thighCm: "Thigh",
  hipCm: "Hip",
  bodyFatPct: "Body fat",
};
