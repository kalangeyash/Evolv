"use client";
import * as React from "react";
import type { ISODate, WeightEntry } from "@/lib/db/types";
import { addWeight, deleteWeight, updateWeight } from "@/lib/db/repos";
import { useAction } from "@/hooks/use-action";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, parseInputNumber } from "@/components/ui/input";
import { isISODate } from "@/lib/utils/dates";

export function WeightDialog({ open, onOpenChange, date, entry }: { open: boolean; onOpenChange: (o: boolean) => void; date: ISODate; entry?: WeightEntry | null }) {
  const [d, setD] = React.useState(date);
  const [kg, setKg] = React.useState("");
  const [time, setTime] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const { run, busy } = useAction();
  React.useEffect(() => {
    if (open) {
      setD(entry?.date ?? date);
      setKg(entry ? String(entry.weightKg) : "");
      setTime(entry?.time ?? "");
      setNote(entry?.note ?? "");
      setErr(null);
    }
  }, [open, entry, date]);

  const save = async () => {
    const w = parseInputNumber(kg);
    if (w === null || !Number.isFinite(w) || w < 25 || w > 350) return setErr("Enter a weight between 25 and 350 kg.");
    if (!isISODate(d)) return setErr("Enter a valid date.");
    const r = await run(
      () => (entry ? updateWeight(entry.id, { date: d, weightKg: w, note: note || null, time: time || null }) : addWeight(d, w, note || null, time || null).then(() => undefined)),
      entry ? "Weight updated" : "Weight logged",
    );
    if (r.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={entry ? "Edit weigh-in" : "Log weight"} description="Weigh at a consistent time (e.g. morning, after the bathroom) for comparable readings.">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Weight (kg)" htmlFor="w-kg" error={err} className="col-span-2">
            <Input id="w-kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus className="h-12 text-lg" />
          </Field>
          <Field label="Date" htmlFor="w-date">
            <Input id="w-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label="Time (optional)" htmlFor="w-time">
            <Input id="w-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Note (optional)" htmlFor="w-note" className="col-span-2">
            <Input id="w-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="col-span-2 mt-2 flex items-center justify-between gap-2">
            {entry ? (
              <Button
                variant="ghost"
                className="text-bad hover:text-bad"
                onClick={async () => {
                  const r = await run(() => deleteWeight(entry.id), "Weigh-in deleted");
                  if (r.ok) onOpenChange(false);
                }}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {entry ? "Save" : "Log weight"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
