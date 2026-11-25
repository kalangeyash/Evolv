import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/db";
import { loadFixture } from "@/test/fixtures";
import { parseReport } from "@/lib/parser";
import { checkDuplicates, commitImport, deleteImport, ImportBlockedError } from "./persist";
import { addFoodEntry, updateFoodEntry, deleteFoodEntry } from "@/lib/db/repos";
import { dayNutrition } from "@/lib/analytics/nutrition";

const RAW = loadFixture("report-2026-11-25.md");
const parse = (t = RAW) => parseReport(t, { referenceYear: 2026 });

beforeEach(async () => {
  await resetDbForTests();
  // The seeded starting weight is dated "today"; remove it so tests do not depend on the clock.
  await getDb().weightEntries.filter((w) => w.source === "profile").delete();
});

describe("database bootstrap", () => {
  it("seeds profile, targets, settings, library and starting weight", async () => {
    const db = await resetDbForTests();
    const profile = await db.userProfiles.get("primary");
    expect(profile).toMatchObject({ heightCm: 182.9, primaryGoal: "Body recomposition", timezone: "Asia/Kolkata", sex: null, dateOfBirth: null });
    const goals = await db.goalVersions.toArray();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ calories: 2250, protein: 155, carbs: 220, fat: 70, fiber: 32 });
    expect(await db.exerciseLibrary.count()).toBe(12);
    const w = await db.weightEntries.toArray();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ weightKg: 90, source: "profile" });
  });
});

describe("commitImport", () => {
  it("saves entries, activity, workout, weight and the raw report", async () => {
    const r = await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: true });
    expect(r.added).toEqual({ food: 6, workouts: 1, activity: true, weight: true });
    const db = getDb();
    const food = await db.foodEntries.where("date").equals("2026-11-25").toArray();
    expect(food).toHaveLength(6);
    expect(food.every((f) => f.source === "import" && f.importId === r.importId)).toBe(true);
    const imp = await db.dailyImports.get(r.importId);
    expect(imp?.rawText).toBe(RAW);
    expect(imp?.reportedTotals.calories).toBe(1757);
    const act = await db.activityEntries.where("date").equals("2026-11-25").first();
    expect(act).toMatchObject({ steps: 10284, moveCalories: 642, moveGoal: 600, source: "import" });
    const day = dayNutrition("2026-11-25", food, null);
    expect(day.totals).toEqual({ calories: 1757, protein: 126.5, carbs: 178, fat: 59.5, fiber: 31 });
  });

  it("detects identical and same-date duplicates", async () => {
    await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false });
    const dup = await checkDuplicates(parse(), RAW);
    expect(dup.identical).not.toBeNull();
    expect(dup.sameDate).toHaveLength(1);
    const reformatted = RAW.replace(/\*\*/g, "");
    const dup2 = await checkDuplicates(parse(reformatted), reformatted);
    expect(dup2.identical).toBeNull();
    expect(dup2.sameContent).not.toBeNull();
  });

  it("refuses a second 'new' import for the same date without confirmation", async () => {
    await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false });
    await expect(
      commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false }),
    ).rejects.toBeInstanceOf(ImportBlockedError);
    expect(await getDb().foodEntries.count()).toBe(6);
  });

  it("merge adds only new entries and never duplicates", async () => {
    await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false });
    const extra = RAW.replace("## 📊 Daily Totals", "### Entry 7 — 10:30 PM | Late-night snack\n**Meal:** Banana\n- **Calories:** 105 kcal\n\n## 📊 Daily Totals");
    const r = await commitImport({ report: parse(extra), rawText: extra, mode: "merge", totalsChoice: "calculated", recordWeight: false });
    expect(r.added.food).toBe(1);
    expect(r.skipped.food).toBe(6);
    expect(r.skipped.workouts).toBe(1);
    expect(await getDb().foodEntries.count()).toBe(7);
  });

  it("replace retires the old import, keeps its raw text, and preserves manual entries", async () => {
    const first = await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: true });
    await addFoodEntry({
      date: "2026-11-25", time: "23:00", mealCategory: "other", mealLabel: null, mealName: "Green tea", description: null,
      quantity: null, brand: null, foodScore: null, foodScoreScale: null, notes: null,
      calories: 2, protein: 0, carbs: 0, fat: 0, fiber: 0,
    });
    const edited = RAW.replace("- **Calories:** 337 kcal", "- **Calories:** 400 kcal");
    const r = await commitImport({ report: parse(edited), rawText: edited, mode: "replace", totalsChoice: "calculated", recordWeight: true });
    expect(r.replacedImports).toBe(1);
    expect(r.removedFood).toBe(6);
    const db = getDb();
    const old = await db.dailyImports.get(first.importId);
    expect(old).toMatchObject({ status: "replaced", replacedById: r.importId, rawText: RAW });
    const food = await db.foodEntries.where("date").equals("2026-11-25").toArray();
    expect(food).toHaveLength(7);
    expect(food.find((f) => f.mealName === "Green tea")?.source).toBe("manual");
    expect(food.find((f) => f.entryNumber === 6)?.calories).toBe(400);
    expect(await db.activityEntries.count()).toBe(1);
    expect(await db.workoutSessions.count()).toBe(1);
    expect((await db.weightEntries.where("date").equals("2026-11-25").toArray()).length).toBe(1);
  });

  it("stores reported totals when chosen, without altering entries", async () => {
    const plain = loadFixture("report-plain.txt");
    await commitImport({ report: parse(plain), rawText: plain, mode: "new", totalsChoice: "reported", recordWeight: false });
    const db = getDb();
    const sum = await db.dailyNutritionSummaries.where("date").equals("2026-11-26").first();
    expect(sum?.totals.calories).toBe(1410);
    const food = await db.foodEntries.where("date").equals("2026-11-26").toArray();
    expect(dayNutrition("2026-11-26", food, sum).totals.calories).toBe(1410);
    expect(dayNutrition("2026-11-26", food, null).totals.calories).toBe(1430);
  });

  it("is atomic: a failure mid-transaction leaves no partial records", async () => {
    const db = getDb();
    // Force the final write (the import record) to fail on a duplicate primary key.
    const report = parse();
    const before = await db.foodEntries.count();
    const orig = db.dailyImports.add.bind(db.dailyImports);
    (db.dailyImports as unknown as { add: unknown }).add = () => Promise.reject(Object.assign(new Error("boom"), { name: "QuotaExceededError" }));
    await expect(commitImport({ report, rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: true })).rejects.toThrow();
    (db.dailyImports as unknown as { add: unknown }).add = orig;
    expect(await db.foodEntries.count()).toBe(before);
    expect(await db.activityEntries.count()).toBe(0);
    expect(await db.workoutSessions.count()).toBe(0);
    expect(await db.weightEntries.count()).toBe(0);
  });

  it("blocks reports that fail validation", async () => {
    const r = parse("### Breakfast — 8 AM\nMeal: Poha\nCalories: 300 kcal\n");
    await expect(commitImport({ report: r, rawText: "x", mode: "new", totalsChoice: "calculated", recordWeight: false })).rejects.toBeInstanceOf(ImportBlockedError);
  });

  it("deleteImport removes everything it created", async () => {
    const r = await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: true });
    await deleteImport(r.importId);
    const db = getDb();
    expect(await db.foodEntries.count()).toBe(0);
    expect(await db.activityEntries.count()).toBe(0);
    expect(await db.workoutSessions.count()).toBe(0);
    expect(await db.dailyImports.count()).toBe(0);
  });
});

describe("food entry editing", () => {
  it("marks imported entries as corrected and keeps the original values", async () => {
    await commitImport({ report: parse(), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false });
    const db = getDb();
    const entry = (await db.foodEntries.toArray()).find((f) => f.entryNumber === 1)!;
    await updateFoodEntry(entry.id, { calories: 360, mealCategory: "breakfast" });
    const after = await db.foodEntries.get(entry.id);
    expect(after).toMatchObject({ calories: 360, corrected: true, correctedFields: ["calories"] });
    expect(after?.original?.calories).toBe(345);
    expect(after?.approximateFields).toEqual([]);
    // Correction flows through to daily totals.
    const food = await db.foodEntries.where("date").equals("2026-11-25").toArray();
    expect(dayNutrition("2026-11-25", food, null).totals.calories).toBe(1772);
    await deleteFoodEntry(entry.id);
    expect(await db.foodEntries.count()).toBe(5);
  });

  it("rejects invalid manual values", async () => {
    await expect(
      addFoodEntry({
        date: "2026-11-25", time: "8am", mealCategory: "other", mealLabel: null, mealName: "Tea", description: null,
        quantity: null, brand: null, foodScore: null, foodScoreScale: null, notes: null,
        calories: 10, protein: null, carbs: null, fat: null, fiber: null,
      }),
    ).rejects.toThrow(/HH:mm/);
  });
});
