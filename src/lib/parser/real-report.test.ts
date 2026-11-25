/**
 * Validation against the ACTUAL 25 November 2026 Gemini report.
 *
 * The expected values below are the source figures supplied by the owner.
 * They must not be edited to make the test pass; if a value differs, the
 * parser is wrong. The report text itself is personal data, kept in the
 * git-ignored folder src/test/fixtures/private/. Without it, this suite is skipped.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReport, validateReport } from ".";
import { resetDbForTests, getDb } from "@/lib/db/db";
import { checkDuplicates, commitImport } from "@/lib/import/persist";

const dir = join(process.cwd(), "src/test/fixtures/private");
const file = ["report-2026-11-25.md", "report-2026-11-25.txt"].map((f) => join(dir, f)).find(existsSync);
const RAW = file ? readFileSync(file, "utf8") : "";

const SOURCE = {
  date: "2026-11-25",
  entries: 6,
  totals: { calories: 1757, protein: 80.5, carbs: 224.6, fat: 57.5, fiber: 16.5 },
  activity: { moveCalories: 730, moveGoal: 500, exerciseMinutes: 80, exerciseGoal: 60, standHours: 12, standGoal: 12, steps: 10509, distanceKm: 8.32 },
  workout: { name: /outdoor walk/i, type: "walking", distanceKm: 1.24 },
};

describe.skipIf(!file)("actual 25 Nov 2026 report", () => {
  const report = parseReport(RAW, { referenceYear: 2026 });
  const v = validateReport(report);

  it("extracts the date", () => {
    expect(report.metadata.date).toBe(SOURCE.date);
    expect(report.metadata.dayOfWeek).toBe("Wednesday");
  });

  it("finds all six entries, each with a name, time and category", () => {
    expect(report.entries).toHaveLength(SOURCE.entries);
    for (const e of report.entries) {
      expect(e.mealName.length).toBeGreaterThan(2);
      expect(e.time).toMatch(/^\d{2}:\d{2}$/);
      expect(e.calories).not.toBeNull();
    }
  });

  it("reads the reported daily totals exactly", () => {
    expect(report.reportedTotals).toEqual(SOURCE.totals);
  });

  it("entries add up to the reported totals", () => {
    for (const c of v.comparisons) expect([c.key, c.status]).toEqual([c.key, expect.stringMatching(/match|rounding/)]);
  });

  it("reads Apple Watch metrics", () => {
    expect(report.activity).toMatchObject(SOURCE.activity);
  });

  it("reads the workout", () => {
    const w = report.workouts.find((x) => SOURCE.workout.name.test(x.name));
    expect(w).toBeDefined();
    expect(w).toMatchObject({ type: SOURCE.workout.type, distanceKm: SOURCE.workout.distanceKm });
  });

  it("keeps the energy-balance text", () => {
    expect(report.energyBalanceText).not.toBeNull();
  });

  it("leaves no unrecognised lines and no blocking errors", () => {
    expect(v.errors).toEqual([]);
    expect(report.unrecognized).toEqual([]);
  });

  describe("persistence", () => {
    beforeEach(async () => {
      await resetDbForTests();
    });
    it("imports, persists, and detects the duplicate", async () => {
      await commitImport({ report, rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: false });
      const db = getDb();
      expect(await db.foodEntries.where("date").equals(SOURCE.date).count()).toBe(SOURCE.entries);
      expect((await db.activityEntries.where("date").equals(SOURCE.date).first())?.steps).toBe(SOURCE.activity.steps);
      const dup = await checkDuplicates(report, RAW);
      expect(dup.identical).not.toBeNull();
    });
  });
});
