import { getDb } from "@/lib/db/db";
import type { AppSettings } from "@/lib/db/types";

export interface BackupStatus {
  due: boolean;
  /** Whole days since the last backup, or null if never backed up. */
  daysSince: number | null;
  /** Records created or changed after the last backup. */
  changes: number;
  snoozed: boolean;
}

const DAY = 86_400_000;

/**
 * Decide whether to remind about a backup. A reminder is due when reminders
 * are on, not snoozed, something changed since the last backup, and either
 * no backup exists (after the first day of use) or the last one is older
 * than the configured interval.
 */
export function backupStatus(
  s: Pick<AppSettings, "lastBackupAt" | "createdAt" | "backupReminderDays" | "backupSnoozedUntil">,
  changes: number,
  now = Date.now(),
): BackupStatus {
  const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : null;
  const daysSince = last === null ? null : Math.floor((now - last) / DAY);
  const snoozed = !!s.backupSnoozedUntil && Date.parse(s.backupSnoozedUntil) > now;
  if (s.backupReminderDays <= 0 || snoozed || changes === 0) return { due: false, daysSince, changes, snoozed };
  const overdue = last === null ? now - Date.parse(s.createdAt) >= DAY : daysSince! >= s.backupReminderDays;
  return { due: overdue, daysSince, changes, snoozed };
}

const TRACKED = ["foodEntries", "dailyImports", "activityEntries", "weightEntries", "bodyMeasurements", "workoutSessions", "goalVersions", "userProfiles"] as const;

/** Count records created or updated after `since` (all records when null). */
export async function changesSince(since: string | null): Promise<number> {
  const db = getDb();
  let n = 0;
  for (const t of TRACKED) {
    const table = db.table(t);
    n += since === null ? await table.count() : await table.filter((r: { updatedAt?: string }) => !!r.updatedAt && r.updatedAt > since).count();
  }
  return n;
}
