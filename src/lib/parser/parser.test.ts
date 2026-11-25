import { describe, expect, it } from "vitest";
import { loadFixture } from "@/test/fixtures";
import { parseReport, validateReport, contentHash, reportFingerprint } from ".";
import { parseDateText, parseNumber, parseTimeText, parseDurationMinutes, parseDistanceKm, parseHeightCm } from "./text";
import { scanNutrients, splitValueAndGoal } from "./parse";
import { inferMealCategory, detectBrand } from "./labels";

const OPTS = { referenceYear: 2026 };

describe("sample report — 25 November 2026", () => {
  const report = parseReport(loadFixture("report-2026-11-25.md"), OPTS);
  const v = validateReport(report);

  it("reads report metadata", () => {
    expect(report.metadata).toEqual({
      date: "2026-11-25",
      dayOfWeek: "Wednesday",
      timezone: "Asia/Kolkata (IST)",
      goal: "Body Recomposition",
      weightKg: 90,
      heightCm: 183,
    });
  });

  it("finds all six food entries in order", () => {
    expect(report.entries).toHaveLength(6);
    expect(report.entries.map((e) => e.entryNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(report.entries.map((e) => e.mealName)).toEqual([
      "Masala Oats with Boiled Eggs",
      "Buttermilk & Apple",
      "Phulka, Dal Tadka & Paneer Bhurji",
      "Roasted Chana & Masala Chai",
      "Whey Protein Shake",
      "Chicken Tikka with Mixed Veg Sabzi",
    ]);
  });

  it("reads timestamps and meal categories", () => {
    expect(report.entries.map((e) => e.time)).toEqual(["08:10", "11:00", "13:45", "17:15", "19:30", "21:15"]);
    expect(report.entries.map((e) => e.mealCategory)).toEqual([
      "breakfast",
      "morning_snack",
      "lunch",
      "evening_snack",
      "other",
      "dinner",
    ]);
    expect(report.entries[4].mealLabel).toBe("Post-Workout");
    expect(report.entries[1].mealLabel).toBe("Morning Snack");
    expect(report.entries[3].mealLabel).toBe("Evening Snack");
  });

  it("reads nutrition values for every entry", () => {
    const pick = (i: number) => {
      const e = report.entries[i];
      return [e.calories, e.protein, e.carbs, e.fat, e.fiber];
    };
    expect(pick(0)).toEqual([345, 19.5, 34, 13.5, 4.5]);
    expect(pick(1)).toEqual([135, 4, 27, 1.5, 4.5]);
    expect(pick(2)).toEqual([610, 32, 62, 26, 11]);
    expect(pick(3)).toEqual([210, 9, 30, 6, 5]);
    expect(pick(4)).toEqual([120, 24, 3, 1.5, 0]);
    expect(pick(5)).toEqual([337, 38, 22, 11, 6]);
  });

  it("keeps approximate markers, quantities, descriptions, scores and brands", () => {
    expect(report.entries[0].approximateFields).toEqual(["calories"]);
    expect(report.entries[2].approximateFields.sort()).toEqual(["calories", "fat", "protein"]);
    expect(report.entries[0].quantity).toBe("50 g oats (dry) + 2 large eggs");
    expect(report.entries[0].description).toContain("Saffola Masala Oats");
    expect(report.entries[0].foodScore).toBe(7.5);
    expect(report.entries[0].foodScoreScale).toBe(10);
    expect(report.entries[0].brand).toBe("Saffola");
    expect(report.entries[1].brand).toBe("Amul");
    expect(report.entries[4].brand).toBe("MuscleBlaze");
  });

  it("extracts reported daily totals and targets", () => {
    expect(report.reportedTotals).toEqual({ calories: 1757, protein: 126.5, carbs: 178, fat: 59.5, fiber: 31 });
    expect(report.reportedTargets).toEqual({ calories: 2250, protein: 155, carbs: 220, fat: 70, fiber: 32 });
  });

  it("recalculates totals and finds no discrepancy", () => {
    expect(v.calculatedTotals).toEqual(report.reportedTotals);
    expect(v.comparisons.every((c) => c.status === "match")).toBe(true);
    expect(v.hasDiscrepancy).toBe(false);
    expect(v.canImport).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("extracts Apple Watch activity with goals", () => {
    expect(report.activity).toEqual({
      moveCalories: 642,
      moveGoal: 600,
      exerciseMinutes: 48,
      exerciseGoal: 30,
      standHours: 11,
      standGoal: 12,
      steps: 10284,
      distanceKm: 7.6,
    });
  });

  it("extracts the workout", () => {
    expect(report.workouts).toHaveLength(1);
    expect(report.workouts[0]).toMatchObject({
      name: "Outdoor Walk",
      type: "walking",
      distanceKm: 4.2,
      durationMin: 46,
      calories: 228,
    });
  });

  it("keeps energy balance text, notes and uncertainty", () => {
    expect(report.energyBalanceText).toContain("estimated deficit");
    expect(report.energyBalanceKcal).toBe(-850);
    expect(report.notes).toHaveLength(2);
    expect(report.uncertainties).toHaveLength(2);
    expect(report.unrecognized).toEqual([]);
  });
});

describe("plain-text layout with inline macros", () => {
  const report = parseReport(loadFixture("report-plain.txt"), OPTS);
  const v = validateReport(report);

  it("reads DD/MM/YYYY dates and metadata", () => {
    expect(report.metadata.date).toBe("2026-11-26");
    expect(report.metadata.dayOfWeek).toBe("Thursday");
    expect(report.metadata.weightKg).toBe(89.6);
  });

  it("parses numbered entries with header names and quantities", () => {
    expect(report.entries).toHaveLength(4);
    expect(report.entries[0]).toMatchObject({
      mealName: "Poha with peanuts",
      quantity: "1 plate (~200 g)",
      time: "08:30",
      mealCategory: "breakfast",
      calories: 320,
      foodScore: 6,
    });
    expect(report.entries[1]).toMatchObject({ calories: 480, protein: 15, carbs: 85, fat: 9, fiber: 13 });
    expect(report.entries[2].mealCategory).toBe("evening_snack");
    expect(report.entries[3]).toMatchObject({ calories: 520, protein: 28, carbs: 44, fat: 25, fiber: 6 });
  });

  it("treats N/A as missing, never zero", () => {
    expect(report.entries[2].fiber).toBeNull();
    expect(report.entries[2].reportedUnavailable).toEqual(["fiber"]);
    const fiber = v.comparisons.find((c) => c.key === "fiber")!;
    expect(fiber.entriesMissing).toBe(1);
    expect(fiber.calculated).toBe(22);
  });

  it("flags a calorie discrepancy without changing the reported total", () => {
    const cal = v.comparisons.find((c) => c.key === "calories")!;
    expect(cal).toMatchObject({ calculated: 1430, reported: 1410, difference: 20, status: "mismatch" });
    expect(report.reportedTotals.calories).toBe(1410);
    expect(v.hasDiscrepancy).toBe(true);
    expect(v.canImport).toBe(true);
  });

  it("reads activity written as value (goal N) and N of M", () => {
    expect(report.activity).toMatchObject({
      moveCalories: 410,
      moveGoal: 600,
      exerciseMinutes: 22,
      exerciseGoal: 30,
      standHours: 9,
      standGoal: 12,
      steps: 6120,
      distanceKm: 4.4,
    });
  });
});

describe("markdown table layout", () => {
  const report = parseReport(loadFixture("report-table.md"), OPTS);

  it("reads one entry per table row and the total row", () => {
    expect(report.metadata.date).toBe("2026-11-27");
    expect(report.entries).toHaveLength(3);
    expect(report.entries[1]).toMatchObject({
      mealName: "Chicken biryani (Behrouz)",
      time: "13:30",
      mealCategory: "lunch",
      calories: 720,
      brand: "Behrouz",
    });
    expect(report.reportedTotals.calories).toBe(1380);
    expect(validateReport(report).hasDiscrepancy).toBe(false);
    expect(report.activity).toBeNull();
  });
});

describe("robustness", () => {
  it("does not invent values for missing nutrients", () => {
    const r = parseReport("Date: 1 Dec 2026\n\nBreakfast (8 AM): Aloo paratha with curd\nCalories: 450 kcal\n", OPTS);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ calories: 450, protein: null, carbs: null, fat: null, fiber: null });
    expect(r.entries[0].missingFields).toEqual(["protein", "carbs", "fat", "fiber"]);
    expect(r.entries[0].mealName).toBe("Aloo paratha with curd");
  });

  it("flags entries with no readable nutrition instead of guessing", () => {
    const r = parseReport("Date: 1 Dec 2026\n### Lunch — 1 PM\nMeal: Thali\nCalories: ???\n", OPTS);
    expect(r.entries[0].calories).toBeNull();
    const v = validateReport(r);
    expect(v.canImport).toBe(false);
    expect(v.errors.some((e) => /no nutrition values/i.test(e.message))).toBe(true);
    // Excluding the entry leaves nothing to import.
    r.entries[0].include = false;
    expect(validateReport(r).canImport).toBe(false);
  });

  it("requires a date", () => {
    const r = parseReport("### Breakfast — 8 AM\nMeal: Poha\nCalories: 300 kcal\n", OPTS);
    expect(r.metadata.date).toBeNull();
    expect(validateReport(r).canImport).toBe(false);
    r.metadata.date = "2026-12-01";
    expect(validateReport(r).canImport).toBe(true);
  });

  it("handles reports without activity or weight", () => {
    const r = parseReport("Date: 2 Dec 2026\n1) Lunch (1:00 PM) – Curd rice\nCalories: 300 | Protein: 9 g\n", OPTS);
    expect(r.activity).toBeNull();
    expect(r.metadata.weightKg).toBeNull();
    expect(r.entries[0]).toMatchObject({ calories: 300, protein: 9 });
  });

  it("uses midpoint for ranges and flags it", () => {
    const r = parseReport("Date: 2 Dec 2026\n### Dinner — 9 PM\nMeal: Dosa\nCalories: 340-360 kcal\n", OPTS);
    expect(r.entries[0].calories).toBe(350);
    expect(r.entries[0].approximateFields).toContain("calories");
    expect(r.entries[0].issues.some((i) => /range/.test(i.message))).toBe(true);
  });

  it("warns when macros disagree with calories", () => {
    const r = parseReport("Date: 2 Dec 2026\n### Lunch — 1 PM\nMeal: Rajma\nCalories: 200 kcal | Protein: 15 g | Carbs: 85 g | Fat: 9 g\n", OPTS);
    expect(r.entries[0].issues.some((i) => /Macros imply/.test(i.message))).toBe(true);
  });

  it("warns when the stated weekday contradicts the date", () => {
    const r = parseReport("Date: Monday, 25 November 2026\n### Lunch — 1 PM\nMeal: Rice\nCalories: 200 kcal\n", OPTS);
    expect(r.issues.some((i) => /is a Wednesday/.test(i.message))).toBe(true);
  });

  it("does not create entries from notes that mention meals", () => {
    const r = parseReport(
      "Date: 2 Dec 2026\n### Breakfast — 8 AM\nMeal: Eggs\nCalories: 150 kcal\n\n## Notes\n1. Add curd at lunch to boost protein\n2. Dinner was late (10:30 PM)\n",
      OPTS,
    );
    expect(r.entries).toHaveLength(1);
    expect(r.notes).toHaveLength(2);
  });

  it("parses a report with an additional meal category", () => {
    const r = parseReport("Date: 2 Dec 2026\n### Late-night snack — 11:30 PM\nMeal: Banana\nCalories: 105 kcal\n", OPTS);
    expect(r.entries[0]).toMatchObject({ mealCategory: "other", mealLabel: "Late-night snack", time: "23:30" });
  });
});

describe("inline fields in names", () => {
  it("moves an inline score out of the food name", () => {
    const r = parseReport("Date: 26 Nov 2026\n### 1. Breakfast — 12:18 PM\nLite coffee 150 ml 2.5g sugar cow milk — Score: 7/10\nCalories: 85 kcal | Protein: 4 g | Carbs: 9 g | Fat: 3.5 g | Fiber: 0 g\n", OPTS);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ mealName: "Lite coffee 150 ml 2.5g sugar cow milk", foodScore: 7, foodScoreScale: 10, calories: 85, fat: 3.5 });
  });

  it("handles scores in the header, in brackets, and other inline fields", () => {
    const a = parseReport("Date: 26 Nov 2026\n### Entry 2 — 1:00 PM | Lunch | Rajma chawal | Score: 8/10\nCalories: 480 kcal\n", OPTS);
    expect(a.entries[0]).toMatchObject({ mealName: "Rajma chawal", foodScore: 8 });
    const b = parseReport("Date: 26 Nov 2026\n1) Dinner (8 PM) – Dal khichdi (Score 6/10) | Qty: 1.5 cups\nCalories: 380 kcal\n", OPTS);
    expect(b.entries[0]).toMatchObject({ mealName: "Dal khichdi", foodScore: 6, quantity: "1.5 cups" });
  });
});

describe("text primitives", () => {
  it("parses numbers", () => {
    expect(parseNumber("1,757 kcal")).toMatchObject({ value: 1757, approximate: false });
    expect(parseNumber("~345")).toMatchObject({ value: 345, approximate: true });
    expect(parseNumber("approx. 12.5 g")).toMatchObject({ value: 12.5, approximate: true });
    expect(parseNumber("<1 g")).toMatchObject({ value: 1, bound: "lt", approximate: true });
    expect(parseNumber("N/A")).toBeNull();
    expect(parseNumber("—")).toBeNull();
  });

  it("parses dates", () => {
    expect(parseDateText("Wednesday, November 25, 2026")?.iso).toBe("2026-11-25");
    expect(parseDateText("25th Nov 2026")?.iso).toBe("2026-11-25");
    expect(parseDateText("2026-11-25")?.iso).toBe("2026-11-25");
    expect(parseDateText("25/11/2026")?.iso).toBe("2026-11-25");
    expect(parseDateText("11/25/2026")?.iso).toBe("2026-11-25");
    expect(parseDateText("03/04/2026")?.notes[0]).toMatch(/ambiguous/);
    expect(parseDateText("Nov 25", 2026)?.notes[0]).toMatch(/assumed 2026/);
    expect(parseDateText("31/02/2026")).toBeNull();
  });

  it("parses times", () => {
    expect(parseTimeText("8:10 AM")).toBe("08:10");
    expect(parseTimeText("8.10pm")).toBe("20:10");
    expect(parseTimeText("12 AM")).toBe("00:00");
    expect(parseTimeText("12:30 pm")).toBe("12:30");
    expect(parseTimeText("20:45")).toBe("20:45");
    expect(parseTimeText("2045 hrs")).toBe("20:45");
    expect(parseTimeText("noon")).toBe("12:00");
    expect(parseTimeText("4.2 km")).toBeNull();
  });

  it("parses durations, distances and heights", () => {
    expect(parseDurationMinutes("46 min")).toBe(46);
    expect(parseDurationMinutes("1 h 5 min")).toBe(65);
    expect(parseDurationMinutes("1:05:30")).toBe(65.5);
    expect(parseDistanceKm("2 mi")).toBe(3.22);
    expect(parseDistanceKm("800 m")).toBe(0.8);
    expect(parseHeightCm(`6'0"`)).toBe(182.9);
    expect(parseHeightCm("6 ft")).toBe(182.9);
    expect(parseHeightCm(`6'0" (183 cm)`)).toBe(183);
  });

  it("scans inline nutrients", () => {
    expect(scanNutrients("340 kcal | P: 19 g | C 33g | F: 13 g | Fiber 5 g").found).toEqual({
      calories: "340",
      protein: "19",
      carbs: "33",
      fat: "13",
      fiber: "5",
    });
    expect(scanNutrients("12 g protein, 4g fibre").found).toEqual({ protein: "12", fiber: "4" });
    expect(scanNutrients("Poha with peanuts, 1 plate").found).toEqual({});
  });

  it("splits values and goals", () => {
    expect(splitValueAndGoal("642 / 600 kcal")).toEqual({ value: "642", goal: "600 kcal" });
    expect(splitValueAndGoal("410 kcal (goal 600)")).toEqual({ value: "410 kcal", goal: "600" });
    expect(splitValueAndGoal("9 of 12")).toEqual({ value: "9", goal: "12" });
  });

  it("infers categories and brands", () => {
    expect(inferMealCategory("Snack", "10:30")).toBe("morning_snack");
    expect(inferMealCategory("Snack", "17:00")).toBe("evening_snack");
    expect(inferMealCategory("Mid-morning snack", null)).toBe("morning_snack");
    expect(inferMealCategory("Supper", null)).toBe("dinner");
    expect(detectBrand("Haldirams bhujia")).toBe("Haldiram's");
    expect(detectBrand("homemade dal")).toBeNull();
  });
});

describe("fingerprints", () => {
  it("ignores whitespace and case for content hash", () => {
    expect(contentHash("Date: 1\n  Poha")).toBe(contentHash("date: 1 poha"));
  });

  it("matches reformatted copies of the same day", () => {
    const a = parseReport(loadFixture("report-2026-11-25.md"), OPTS);
    const b = parseReport(loadFixture("report-2026-11-25.md").replace(/\*\*/g, ""), OPTS);
    expect(contentHash(loadFixture("report-2026-11-25.md"))).not.toBe(contentHash(loadFixture("report-2026-11-25.md").replace(/\*\*/g, "")));
    expect(reportFingerprint("2026-11-25", a.entries)).toBe(reportFingerprint("2026-11-25", b.entries));
  });
});
