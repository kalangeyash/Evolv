import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/db";
import { loadFixture } from "@/test/fixtures";
import { parseReport } from "@/lib/parser";
import { commitImport } from "@/lib/import/persist";
import { addMeasurement, saveWorkoutSession } from "@/lib/db/repos";
import { clearAllData, createBackup, foodCsv, restoreBackup, toCsv, validateBackupText, workoutCsv } from "./backup";

const RAW = loadFixture("report-2026-11-25.md");

async function seed() {
  await commitImport({ report: parseReport(RAW, { referenceYear: 2026 }), rawText: RAW, mode: "new", totalsChoice: "calculated", recordWeight: true });
  await addMeasurement({ date: "2026-11-25", waistCm: 96, chestCm: null, armCm: 36, thighCm: null, hipCm: null, bodyFatPct: null, note: null });
  await saveWorkoutSession({
    date: "2026-11-24", startTime: null, name: "Push", type: "strength", durationMin: 55, distanceKm: null, calories: null, avgHeartRate: null, avgSpeedKmh: null, notes: null,
    exercises: [{ exerciseId: null, name: "Bench press", muscleGroup: "Chest", notes: null, sets: [{ reps: 8, weightKg: 60, restSec: null, notes: null }, { reps: 6, weightKg: 65, restSec: null, notes: null }] }],
  });
}

beforeEach(async () => {
  await resetDbForTests();
});

describe("backup round trip", () => {
  it("exports and restores every table exactly", async () => {
    await seed();
    const backup = await createBackup();
    expect(backup.counts.foodEntries).toBe(6);
    expect(backup.data.dailyImports[0].rawText).toBe(RAW);
    const text = JSON.stringify(backup);

    await clearAllData();
    expect(await getDb().foodEntries.count()).toBe(0);
    expect(await getDb().goalVersions.count()).toBe(1);

    const v = validateBackupText(text);
    expect(v.ok).toBe(true);
    await restoreBackup(v.backup!);
    const again = await createBackup();
    expect(again.data).toEqual(backup.data);
  });

  it("rejects corrupted JSON without touching data", async () => {
    await seed();
    const text = JSON.stringify(await createBackup());
    const v = validateBackupText(text.slice(0, text.length - 40));
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/not valid JSON/);
    expect(await getDb().foodEntries.count()).toBe(6);
  });

  it("rejects backups with invalid records or count mismatches", async () => {
    await seed();
    const b = await createBackup();
    const bad = structuredClone(b);
    (bad.data.foodEntries[0] as Record<string, unknown>).date = "25/11/2026";
    expect(validateBackupText(JSON.stringify(bad)).errors.join(" ")).toMatch(/foodEntries row 1: date/);
    const truncated = structuredClone(b);
    truncated.data.foodEntries.pop();
    expect(validateBackupText(JSON.stringify(truncated)).errors.join(" ")).toMatch(/header says 6/);
    const orphan = structuredClone(b);
    orphan.data.workoutExercises = [];
    orphan.counts.workoutExercises = 0;
    expect(validateBackupText(JSON.stringify(orphan)).errors.join(" ")).toMatch(/missing exercise/);
    expect(validateBackupText('{"hello":1}').errors[0]).toMatch(/not an EVOLV backup/);
  });

  it("leaves existing data intact when a restore fails part-way", async () => {
    await seed();
    const good = await createBackup();
    const broken = structuredClone(good);
    // Two rows with the same primary key make bulkAdd fail inside the transaction.
    broken.data.weightEntries.push({ ...broken.data.weightEntries[0] });
    await expect(restoreBackup(broken)).rejects.toThrow();
    expect(await getDb().foodEntries.count()).toBe(6);
    expect(await getDb().workoutSets.count()).toBe(2);
  });
});

describe("CSV", () => {
  it("escapes quotes, commas, newlines and formula prefixes", () => {
    const csv = toCsv(["a", "b"], [['He said "hi", ok', "=SUM(A1)"], ["line\nbreak", -5]]);
    expect(csv).toBe('a,b\r\n"He said ""hi"", ok",\'=SUM(A1)\r\n"line\nbreak",-5\r\n');
  });

  it("exports food and workouts", async () => {
    await seed();
    const food = await foodCsv();
    expect(food.split("\r\n")).toHaveLength(8); // header + 6 rows + trailing empty
    expect(food).toContain("Masala Oats with Boiled Eggs");
    const w = await workoutCsv();
    expect(w).toContain("Bench press,Chest,1,8,60,480");
    expect(w).toContain("Outdoor Walk,walking");
  });
});
