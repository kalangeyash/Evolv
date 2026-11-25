/**
 * Stage 4 — persistence.
 *
 * Writes a reviewed ParsedReport to IndexedDB inside ONE transaction.
 * If anything throws, Dexie aborts the transaction and nothing is saved.
 */
import { getDb } from "@/lib/db/db";
import type {
  ActivityEntry,
  DailyImport,
  FoodEntry,
  ISODate,
  WeightEntry,
  WorkoutSession,
} from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import {
  contentHash,
  entrySignature,
  reportFingerprint,
  validateReport,
  type ParsedReport,
} from "@/lib/parser";
import { newId, nowIso } from "@/lib/utils/ids";
import { normalizeFoodName } from "@/lib/parser/fingerprint";

export type ImportMode = "new" | "replace" | "merge";

export interface DuplicateCheck {
  /** An active import with byte-identical (whitespace-insensitive) text. */
  identical: DailyImport | null;
  /** An active import whose date + entries match, even if formatted differently. */
  sameContent: DailyImport | null;
  /** Active imports for the same date. */
  sameDate: DailyImport[];
  /** Food entries already stored for the date (any source). */
  existingFoodCount: number;
  existingManualFoodCount: number;
  existingActivity: ActivityEntry | null;
  existingWeight: WeightEntry | null;
}

export async function checkDuplicates(report: ParsedReport, rawText: string): Promise<DuplicateCheck> {
  const db = getDb();
  const hash = contentHash(rawText);
  const date = report.metadata.date;
  const included = report.entries.filter((e) => e.include);
  const fp = date ? reportFingerprint(date, included) : null;

  const identical = (await db.dailyImports.where("contentHash").equals(hash).filter((i) => i.status === "active").first()) ?? null;
  const sameContent = fp
    ? (await db.dailyImports.where("fingerprint").equals(fp).filter((i) => i.status === "active").first()) ?? null
    : null;
  const sameDate = date
    ? await db.dailyImports.where("date").equals(date).filter((i) => i.status === "active").toArray()
    : [];
  const food = date ? await db.foodEntries.where("date").equals(date).toArray() : [];
  const existingActivity = date ? (await db.activityEntries.where("date").equals(date).first()) ?? null : null;
  const existingWeight = date ? (await db.weightEntries.where("date").equals(date).first()) ?? null : null;
  return {
    identical,
    sameContent,
    sameDate,
    existingFoodCount: food.length,
    existingManualFoodCount: food.filter((f) => f.source === "manual").length,
    existingActivity,
    existingWeight,
  };
}

export interface CommitOptions {
  report: ParsedReport;
  rawText: string;
  mode: ImportMode;
  /** Which totals represent the day when they differ. */
  totalsChoice: "calculated" | "reported";
  /** Record the report's body weight as a weigh-in for the date. */
  recordWeight: boolean;
}

export interface CommitResult {
  importId: string;
  date: ISODate;
  added: { food: number; workouts: number; activity: boolean; weight: boolean };
  skipped: { food: number; workouts: number; activityFields: string[] };
  replacedImports: number;
  removedFood: number;
}

export class ImportBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportBlockedError";
  }
}

/**
 * Persist a reviewed report.
 *
 * - new: there is no active import for the date. Adds everything.
 * - replace: marks earlier imports for the date as replaced (raw text kept),
 *   removes the food, workouts, activity and weight they created, then adds
 *   the new data. Manually entered records are never removed.
 * - merge: keeps everything and adds only entries not already present
 *   (matched by time + name + calories); activity fills blank fields only.
 */
export async function commitImport(opts: CommitOptions): Promise<CommitResult> {
  const { report, rawText, mode, totalsChoice, recordWeight } = opts;
  const validation = validateReport(report);
  if (!validation.canImport) {
    throw new ImportBlockedError(validation.errors.map((e) => e.message).join(" "));
  }
  const date = report.metadata.date!;
  const db = getDb();
  const now = nowIso();
  const importId = newId("imp");
  const included = report.entries.filter((e) => e.include);
  const workouts = report.workouts.filter((w) => w.include);

  const result: CommitResult = {
    importId,
    date,
    added: { food: 0, workouts: 0, activity: false, weight: false },
    skipped: { food: 0, workouts: 0, activityFields: [] },
    replacedImports: 0,
    removedFood: 0,
  };

  await db.transaction(
    "rw",
    [
      db.dailyImports,
      db.dailyNutritionSummaries,
      db.foodEntries,
      db.activityEntries,
      db.workoutSessions,
      db.workoutExercises,
      db.workoutSets,
      db.weightEntries,
    ],
    async () => {
      const activeSameDate = await db.dailyImports
        .where("date")
        .equals(date)
        .filter((i) => i.status === "active")
        .toArray();

      if (mode === "new" && activeSameDate.length) {
        throw new ImportBlockedError(
          "A report for this date was already imported. Choose replace or merge.",
        );
      }

      /* ---------- replace: retire previous imports for the date ---------- */
      if (mode === "replace") {
        for (const prev of activeSameDate) {
          await db.dailyImports.update(prev.id, { status: "replaced", replacedById: importId, updatedAt: now });
          result.removedFood += await db.foodEntries.where("importId").equals(prev.id).delete();
          const sessions = await db.workoutSessions.where("importId").equals(prev.id).toArray();
          for (const s of sessions) {
            await db.workoutSets.where("sessionId").equals(s.id).delete();
            await db.workoutExercises.where("sessionId").equals(s.id).delete();
            await db.workoutSessions.delete(s.id);
          }
          await db.weightEntries.where("importId").equals(prev.id).delete();
          await db.activityEntries.where("importId").equals(prev.id).delete();
        }
        result.replacedImports = activeSameDate.length;
        await db.dailyNutritionSummaries.where("date").equals(date).delete();
      }

      /* ---------------------------- food ---------------------------- */
      const existingFood = await db.foodEntries.where("date").equals(date).toArray();
      const existingSigs = new Set(
        existingFood.map((f) => entrySignature({ time: f.time, mealName: f.mealName, calories: f.calories })),
      );
      const existingNames = new Set(existingFood.map((f) => `${f.time ?? ""}|${normalizeFoodName(f.mealName)}`));
      let order = existingFood.reduce((m, f) => Math.max(m, f.order), -1) + 1;
      const foodRows: FoodEntry[] = [];
      for (const e of included) {
        if (mode === "merge") {
          const sig = entrySignature(e);
          if (existingSigs.has(sig) || existingNames.has(`${e.time ?? ""}|${normalizeFoodName(e.mealName)}`)) {
            result.skipped.food++;
            continue;
          }
        }
        foodRows.push({
          id: newId("food"),
          date,
          time: e.time,
          order: order++,
          entryNumber: e.entryNumber,
          mealCategory: e.mealCategory,
          mealLabel: e.mealLabel,
          mealName: e.mealName.trim(),
          description: e.description,
          quantity: e.quantity,
          brand: e.brand,
          calories: e.calories,
          protein: e.protein,
          carbs: e.carbs,
          fat: e.fat,
          fiber: e.fiber,
          foodScore: e.foodScore,
          foodScoreScale: e.foodScoreScale,
          approximateFields: e.approximateFields,
          source: "import",
          importId,
          corrected: false,
          correctedFields: [],
          original: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      await db.foodEntries.bulkAdd(foodRows);
      result.added.food = foodRows.length;

      /* --------------------------- totals --------------------------- */
      if (totalsChoice === "reported" && NUTRIENT_KEYS.some((k) => report.reportedTotals[k] !== null)) {
        await db.dailyNutritionSummaries.where("date").equals(date).delete();
        await db.dailyNutritionSummaries.add({
          id: newId("sum"),
          date,
          mode: "reported",
          totals: { ...report.reportedTotals },
          importId,
          createdAt: now,
          updatedAt: now,
        });
      }

      /* -------------------------- activity -------------------------- */
      if (report.activity) {
        const a = report.activity;
        const existing = await db.activityEntries.where("date").equals(date).first();
        if (!existing) {
          await db.activityEntries.add({
            id: newId("act"),
            date,
            ...a,
            source: "import",
            importId,
            corrected: false,
            correctedFields: [],
            notes: null,
            createdAt: now,
            updatedAt: now,
          });
          result.added.activity = true;
        } else {
          // Fill blank fields only; never overwrite values already stored.
          const patch: Partial<ActivityEntry> = {};
          for (const [k, v] of Object.entries(a) as [keyof typeof a, number | null][]) {
            if (v === null) continue;
            if (existing[k] === null) (patch as Record<string, number>)[k] = v;
            else if (existing[k] !== v) result.skipped.activityFields.push(k);
          }
          if (Object.keys(patch).length) {
            await db.activityEntries.update(existing.id, { ...patch, updatedAt: now });
            result.added.activity = true;
          }
        }
      }

      /* -------------------------- workouts -------------------------- */
      const existingSessions = await db.workoutSessions.where("date").equals(date).toArray();
      for (const w of workouts) {
        if (mode === "merge" && existingSessions.some((s) => s.type === w.type && s.durationMin === w.durationMin && s.distanceKm === w.distanceKm)) {
          result.skipped.workouts++;
          continue;
        }
        const session: WorkoutSession = {
          id: newId("ws"),
          date,
          startTime: null,
          name: w.name,
          type: w.type,
          durationMin: w.durationMin,
          distanceKm: w.distanceKm,
          calories: w.calories,
          avgHeartRate: w.avgHeartRate,
          avgSpeedKmh: w.durationMin && w.distanceKm ? Math.round((w.distanceKm / (w.durationMin / 60)) * 10) / 10 : null,
          notes: null,
          source: "import",
          importId,
          createdAt: now,
          updatedAt: now,
        };
        await db.workoutSessions.add(session);
        result.added.workouts++;
      }

      /* --------------------------- weight --------------------------- */
      if (recordWeight && report.metadata.weightKg !== null) {
        const existing = await db.weightEntries.where("date").equals(date).first();
        if (!existing) {
          await db.weightEntries.add({
            id: newId("w"),
            date,
            time: null,
            weightKg: report.metadata.weightKg,
            source: "import",
            importId,
            note: "From imported daily report",
            createdAt: now,
            updatedAt: now,
          });
          result.added.weight = true;
        }
      }

      /* ------------------------ import record ----------------------- */
      const v = validateReport(report);
      await db.dailyImports.add({
        id: importId,
        date,
        rawText,
        contentHash: contentHash(rawText),
        fingerprint: reportFingerprint(date, included),
        parserVersion: report.parserVersion,
        metadata: { ...report.metadata },
        reportedTotals: { ...report.reportedTotals },
        reportedTargets: { ...report.reportedTargets },
        calculatedTotals: v.calculatedTotals,
        energyBalanceText: report.energyBalanceText,
        energyBalanceKcal: report.energyBalanceKcal,
        notes: report.notes,
        uncertainties: report.uncertainties,
        warnings: v.warnings.map((w) => w.message),
        status: "active",
        replacedById: null,
        mode,
        createdAt: now,
        updatedAt: now,
      });
    },
  );

  return result;
}

/**
 * Remove an import and everything it created. Manually corrected entries from
 * that import are removed too, since they belong to it; manual entries are not.
 */
export async function deleteImport(importId: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.dailyImports, db.foodEntries, db.activityEntries, db.workoutSessions, db.workoutExercises, db.workoutSets, db.weightEntries, db.dailyNutritionSummaries],
    async () => {
      await db.foodEntries.where("importId").equals(importId).delete();
      await db.activityEntries.where("importId").equals(importId).delete();
      await db.weightEntries.where("importId").equals(importId).delete();
      const sessions = await db.workoutSessions.where("importId").equals(importId).toArray();
      for (const s of sessions) {
        await db.workoutSets.where("sessionId").equals(s.id).delete();
        await db.workoutExercises.where("sessionId").equals(s.id).delete();
        await db.workoutSessions.delete(s.id);
      }
      await db.dailyNutritionSummaries.filter((s) => s.importId === importId).delete();
      await db.dailyImports.delete(importId);
    },
  );
}
