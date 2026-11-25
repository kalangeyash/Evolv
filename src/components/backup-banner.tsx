"use client";
import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { HardDriveDownload } from "lucide-react";
import { useSettings } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { backupStatus, changesSince } from "@/lib/backup/reminder";
import { createBackup, downloadText, markBackupTaken } from "@/lib/backup/backup";
import { updateSettings } from "@/lib/db/repos";
import { todayISO } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";

export async function exportBackupNow() {
  const b = await createBackup();
  downloadText(`evolv-backup-${todayISO()}.json`, JSON.stringify(b, null, 1));
  await markBackupTaken(b.exportedAt);
}

/** Re-evaluates the clock whenever the app returns to the foreground. */
function useNow() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const tick = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", tick);
    const id = window.setInterval(tick, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(id);
    };
  }, []);
  return now;
}

export function useBackupStatus() {
  const settings = useSettings();
  const now = useNow();
  const changes = useLiveQuery(() => (settings ? changesSince(settings.lastBackupAt) : Promise.resolve(undefined)), [settings?.lastBackupAt]);
  if (!settings || changes === undefined) return null;
  return { settings, status: backupStatus(settings, changes, now) };
}

/** Persistent, dismissible-by-snooze reminder shown while a backup is due. */
export function BackupBanner() {
  const s = useBackupStatus();
  const { run, busy } = useAction();
  if (!s?.status.due) return null;
  const { daysSince, changes } = s.status;
  return (
    <div role="status" className="no-print mb-5 flex flex-col gap-3 rounded-[14px] border border-warn/40 bg-warn-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-[13.5px] text-text">
        <HardDriveDownload className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <span>
          <strong className="font-semibold">{daysSince === null ? "You have not backed up EVOLV yet." : `Last backup was ${daysSince} days ago.`}</strong>{" "}
          {changes} record{changes === 1 ? "" : "s"} changed since then and exist only in this browser.
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={() => run(() => updateSettings({ backupSnoozedUntil: new Date(Date.now() + 86_400_000).toISOString() }), "Reminder snoozed until tomorrow")}>
          Remind me tomorrow
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(exportBackupNow, "Backup downloaded")}>
          Back up now
        </Button>
      </div>
    </div>
  );
}
