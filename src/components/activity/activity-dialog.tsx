"use client";
import * as React from "react";
import type { ActivityEntry, ISODate } from "@/lib/db/types";
import { saveActivityForDate, type ActivityInput } from "@/lib/db/repos";
import { useAction } from "@/hooks/use-action";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, numToInput, parseInputNumber } from "@/components/ui/input";
import { formatDay } from "@/lib/utils/dates";

const FIELDS: { k: keyof ActivityInput; label: string }[] = [
  { k: "moveCalories", label: "Move (kcal)" },
  { k: "moveGoal", label: "Move goal (kcal)" },
  { k: "exerciseMinutes", label: "Exercise (min)" },
  { k: "exerciseGoal", label: "Exercise goal (min)" },
  { k: "standHours", label: "Stand (hours)" },
  { k: "standGoal", label: "Stand goal (hours)" },
  { k: "steps", label: "Steps" },
  { k: "distanceKm", label: "Distance (km)" },
];

/** Manually enter or correct a day's activity. Corrections to imported values are tracked. */
export function ActivityDialog({ open, onOpenChange, date, entry }: { open: boolean; onOpenChange: (o: boolean) => void; date: ISODate; entry: ActivityEntry | null }) {
  const [v, setV] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  const { run, busy } = useAction();
  React.useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const f of FIELDS) init[f.k] = numToInput(entry?.[f.k] as number | null);
      setV(init);
      setErr(null);
    }
  }, [open, entry]);

  const save = async () => {
    const out: Partial<ActivityInput> = {};
    for (const f of FIELDS) {
      const n = parseInputNumber(v[f.k] ?? "");
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        setErr(`${f.label} must be a non-negative number.`);
        return;
      }
      (out as Record<string, number | null>)[f.k] = n;
    }
    const r = await run(() => saveActivityForDate(date, out), "Activity saved");
    if (r.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={entry ? "Edit activity" : "Add activity"} description={`${formatDay(date)}. Blank fields stay missing.`}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {FIELDS.map((f) => (
            <Field key={f.k} label={f.label} htmlFor={`act-${f.k}`}>
              <Input id={`act-${f.k}`} inputMode="decimal" placeholder="—" value={v[f.k] ?? ""} onChange={(e) => setV((p) => ({ ...p, [f.k]: e.target.value }))} />
            </Field>
          ))}
          {err ? <p className="col-span-2 text-[13px] text-bad">{err}</p> : null}
          {entry?.source === "import" ? <p className="col-span-2 text-[12px] text-faint">This day was imported. Changed values will be marked as corrected.</p> : null}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              Save activity
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
