"use client";
import * as React from "react";
import { AlertTriangle, Download, FileJson, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/db";
import { useSettings } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import {
  TABLE_NAMES,
  activityCsv,
  clearAllData,
  downloadText,
  foodCsv,
  measurementsCsv,
  restoreBackup,
  validateBackupText,
  weightCsv,
  workoutCsv,
  type BackupValidation,
} from "@/lib/backup/backup";
import { todayISO } from "@/lib/utils/dates";
import { BackupBanner, exportBackupNow } from "@/components/backup-banner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const TABLE_LABEL: Record<string, string> = {
  userProfiles: "Profile",
  goalVersions: "Target versions",
  dailyImports: "Imported reports",
  dailyNutritionSummaries: "Day total overrides",
  foodEntries: "Food entries",
  activityEntries: "Activity days",
  workoutSessions: "Workouts",
  workoutExercises: "Workout exercises",
  workoutSets: "Sets",
  weightEntries: "Weigh-ins",
  bodyMeasurements: "Measurements",
  exerciseLibrary: "Exercise library",
  applicationSettings: "Settings",
};

const exportJson = exportBackupNow;

export function DataView() {
  const settings = useSettings();
  const counts = useLiveQuery(async () => {
    const db = getDb();
    const out: Record<string, number> = {};
    for (const t of TABLE_NAMES) out[t] = await db.table(t).count();
    return out;
  }, []);
  const { run, busy } = useAction();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [check, setCheck] = React.useState<(BackupValidation & { fileName: string }) | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  const onFile = async (file: File) => {
    const text = await file.text();
    setCheck({ ...validateBackupText(text), fileName: file.name });
  };

  const csv = (name: string, fn: () => Promise<string>) => () =>
    run(async () => downloadText(`evolv-${name}-${todayISO()}.csv`, await fn(), "text/csv"), `${name[0].toUpperCase() + name.slice(1)} CSV downloaded`);

  const last = settings?.lastBackupAt ? new Date(settings.lastBackupAt) : null;

  return (
    <div>
      <PageHeader title="Data Management" description="Everything lives in this browser. Back up regularly; a backup file is the only copy outside this device." />
      <BackupBanner />

      <Callout tone={last ? "info" : "warn"} title={last ? `Last backup: ${last.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "No backup yet"} className="mb-4">
        Clearing your browser&apos;s site data, uninstalling the browser, or using private browsing can erase EVOLV&apos;s records. Keep a recent backup file somewhere safe.
      </Callout>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Full backup" description="A versioned JSON file with every record, including original report text." />
          <CardBody className="space-y-3">
            <Button variant="primary" onClick={() => run(exportJson, "Backup downloaded")} disabled={busy}>
              <Download /> Export backup (JSON)
            </Button>
            {counts ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-muted">
                {TABLE_NAMES.map((t) => (
                  <li key={t} className="flex justify-between">
                    <span>{TABLE_LABEL[t]}</span>
                    <span className="tabular">{counts[t]}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Restore from backup" description="The file is checked completely before anything changes. A bad file never touches your data." />
          <CardBody>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose backup file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload /> Choose backup file
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Spreadsheet exports" description="CSV files open in Excel, Numbers or Google Sheets." />
          <CardBody className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={csv("food", foodCsv)}>
              <FileJson /> Food
            </Button>
            <Button variant="secondary" onClick={csv("weight", weightCsv)}>
              <FileJson /> Weight
            </Button>
            <Button variant="secondary" onClick={csv("measurements", measurementsCsv)}>
              <FileJson /> Measurements
            </Button>
            <Button variant="secondary" onClick={csv("activity", activityCsv)}>
              <FileJson /> Activity
            </Button>
            <Button variant="secondary" onClick={csv("workouts", workoutCsv)}>
              <FileJson /> Workouts
            </Button>
          </CardBody>
        </Card>
        <Card className="border-bad/40">
          <CardHeader title="Erase all data" description="Deletes every record and restores the default profile and targets." />
          <CardBody>
            <Button variant="danger" onClick={() => { setTyped(""); setClearOpen(true); }}>
              <Trash2 /> Erase all data
            </Button>
          </CardBody>
        </Card>
      </div>

      <Dialog open={!!check} onOpenChange={(o) => !o && setCheck(null)}>
        <DialogContent title={check?.ok ? "Backup is valid" : "This backup cannot be restored"} description={check?.fileName}>
          {check?.ok && check.backup ? (
            <div className="space-y-3 text-[13.5px]">
              <p className="text-muted">Exported {new Date(check.backup.exportedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Contains:</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                {TABLE_NAMES.map((t) => (
                  <li key={t} className="flex justify-between">
                    <span className="text-muted">{TABLE_LABEL[t]}</span>
                    <span className="tabular">{check.backup!.data[t].length}</span>
                  </li>
                ))}
              </ul>
              {check.warnings.map((w, i) => (
                <Callout key={i} tone="warn">
                  {w}
                </Callout>
              ))}
              <Callout tone="warn" title="Restoring replaces everything currently in EVOLV">
                Your current data will be overwritten. Download a safety backup first if you might need it.
              </Callout>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setCheck(null)}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => run(exportJson, "Safety backup downloaded")}>
                  <ShieldCheck /> Download safety backup
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    const r = await run(() => restoreBackup(check.backup!), "Backup restored");
                    if (r.ok) setCheck(null);
                  }}
                >
                  Replace my data
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-[13.5px]">
              <p className="flex items-center gap-2 text-bad">
                <AlertTriangle className="size-4" /> Nothing was changed.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {check?.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Erase all EVOLV data?"
        description="Every food entry, import, weigh-in, measurement, workout and setting will be permanently deleted from this browser. This cannot be undone."
        confirmLabel="Erase everything"
        busy={busy}
        disabled={typed !== "ERASE"}
        onConfirm={async () => {
          if (typed !== "ERASE") return;
          const r = await run(clearAllData, "All data erased");
          if (r.ok) setClearOpen(false);
        }}
      >
        <label htmlFor="erase-confirm" className="mb-1.5 block text-[13px] text-muted">
          Type <strong className="text-text">ERASE</strong> to confirm
        </label>
        <Input id="erase-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </ConfirmDialog>
    </div>
  );
}
