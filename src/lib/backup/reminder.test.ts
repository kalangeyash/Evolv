import { describe, expect, it } from "vitest";
import { backupStatus } from "./reminder";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const base = { createdAt: day(30), backupReminderDays: 7, lastBackupAt: null as string | null, backupSnoozedUntil: null as string | null };

describe("backupStatus", () => {
  it("is due when never backed up and there is data", () => {
    expect(backupStatus(base, 5, NOW)).toMatchObject({ due: true, daysSince: null });
  });
  it("waits for the first full day of use", () => {
    expect(backupStatus({ ...base, createdAt: day(0.5) }, 5, NOW).due).toBe(false);
  });
  it("respects the interval", () => {
    expect(backupStatus({ ...base, lastBackupAt: day(3) }, 5, NOW)).toMatchObject({ due: false, daysSince: 3 });
    expect(backupStatus({ ...base, lastBackupAt: day(8) }, 5, NOW)).toMatchObject({ due: true, daysSince: 8 });
  });
  it("is quiet when nothing changed since the last backup", () => {
    expect(backupStatus({ ...base, lastBackupAt: day(40) }, 0, NOW).due).toBe(false);
  });
  it("honours snooze and the off switch", () => {
    expect(backupStatus({ ...base, backupSnoozedUntil: new Date(NOW + 3600_000).toISOString() }, 5, NOW)).toMatchObject({ due: false, snoozed: true });
    expect(backupStatus({ ...base, backupSnoozedUntil: day(1) }, 5, NOW).due).toBe(true);
    expect(backupStatus({ ...base, backupReminderDays: 0 }, 5, NOW).due).toBe(false);
  });
});
