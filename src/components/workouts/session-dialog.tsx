"use client";
import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ExerciseDefinition, ISODate, WorkoutExercise, WorkoutSession, WorkoutSet, WorkoutType } from "@/lib/db/types";
import { WORKOUT_TYPES } from "@/lib/db/types";
import { deleteWorkoutSession, saveWorkoutSession, type ExerciseDraft, type SessionDraft } from "@/lib/db/repos";
import { MUSCLE_GROUPS } from "@/lib/db/seed";
import { useAction } from "@/hooks/use-action";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, numToInput, parseInputNumber } from "@/components/ui/input";
import { volumeOf } from "@/lib/analytics/workouts";
import { fmt } from "@/lib/utils/format";

type SetRow = { reps: string; weightKg: string; restSec: string };
type ExRow = { key: string; exerciseId: string | null; name: string; muscleGroup: string; notes: string; sets: SetRow[] };

const CARDIO: WorkoutType[] = ["walking", "running", "cycling", "swimming", "cardio"];
let k = 0;
const key = () => `x${k++}`;

export function SessionDialog({
  open,
  onOpenChange,
  date,
  session,
  exercises,
  sets,
  library,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: ISODate;
  session: WorkoutSession | null;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  library: ExerciseDefinition[];
}) {
  const { run, busy } = useAction();
  const [f, setF] = React.useState({ date, name: "", type: "strength" as WorkoutType, startTime: "", durationMin: "", distanceKm: "", calories: "", avgHeartRate: "", notes: "" });
  const [rows, setRows] = React.useState<ExRow[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setF({
      date: session?.date ?? date,
      name: session?.name ?? "",
      type: session?.type ?? "strength",
      startTime: session?.startTime ?? "",
      durationMin: numToInput(session?.durationMin),
      distanceKm: numToInput(session?.distanceKm),
      calories: numToInput(session?.calories),
      avgHeartRate: numToInput(session?.avgHeartRate),
      notes: session?.notes ?? "",
    });
    if (session) {
      const exs = exercises.filter((e) => e.sessionId === session.id).sort((a, b) => a.order - b.order);
      setRows(
        exs.map((e) => ({
          key: key(),
          exerciseId: e.exerciseId,
          name: e.name,
          muscleGroup: e.muscleGroup ?? "",
          notes: e.notes ?? "",
          sets: sets
            .filter((s) => s.workoutExerciseId === e.id)
            .sort((a, b) => a.setNumber - b.setNumber)
            .map((s) => ({ reps: numToInput(s.reps), weightKg: numToInput(s.weightKg), restSec: numToInput(s.restSec) })),
        })),
      );
    } else setRows([]);
  }, [open, session, exercises, sets, date]);

  const setField = (name: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [name]: e.target.value }));
  const patchRow = (rk: string, patch: Partial<ExRow>) => setRows((rs) => rs.map((r) => (r.key === rk ? { ...r, ...patch } : r)));
  const addExercise = () => setRows((rs) => [...rs, { key: key(), exerciseId: null, name: "", muscleGroup: "", notes: "", sets: [{ reps: "", weightKg: "", restSec: "" }] }]);

  const pickName = (rk: string, name: string) => {
    const def = library.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
    patchRow(rk, { name, exerciseId: def?.id ?? null, ...(def ? { muscleGroup: def.muscleGroup } : {}) });
  };

  const save = async () => {
    const num = (s: string, label: string) => {
      const v = parseInputNumber(s);
      if (v !== null && (!Number.isFinite(v) || v < 0)) throw new Error(`${label} must be a non-negative number.`);
      return v;
    };
    let draft: SessionDraft;
    try {
      const exs: ExerciseDraft[] = rows
        .filter((r) => r.name.trim() || r.sets.some((s) => s.reps || s.weightKg))
        .map((r) => ({
          exerciseId: r.exerciseId,
          name: r.name,
          muscleGroup: r.muscleGroup || null,
          notes: r.notes || null,
          sets: r.sets
            .filter((s) => s.reps || s.weightKg || s.restSec)
            .map((s, i) => ({ reps: num(s.reps, `${r.name || "Exercise"} set ${i + 1} reps`), weightKg: num(s.weightKg, `${r.name || "Exercise"} set ${i + 1} weight`), restSec: num(s.restSec, "Rest"), notes: null })),
        }));
      const duration = num(f.durationMin, "Duration");
      const distance = num(f.distanceKm, "Distance");
      draft = {
        date: f.date,
        name: f.name.trim() || (f.type === "strength" ? "Strength training" : f.type[0].toUpperCase() + f.type.slice(1)),
        type: f.type,
        startTime: f.startTime || null,
        durationMin: duration,
        distanceKm: distance,
        calories: num(f.calories, "Calories"),
        avgHeartRate: num(f.avgHeartRate, "Heart rate"),
        avgSpeedKmh: duration && distance ? Math.round((distance / (duration / 60)) * 10) / 10 : null,
        notes: f.notes.trim() || null,
        exercises: exs,
      };
    } catch (e) {
      setErr((e as Error).message);
      return;
    }
    const r = await run(() => saveWorkoutSession(draft, session?.id), session ? "Workout updated" : "Workout logged");
    if (r.ok) onOpenChange(false);
  };

  const isCardio = CARDIO.includes(f.type);
  const liveVolume = volumeOf(rows.flatMap((r) => r.sets.map((s) => ({ reps: parseInputNumber(s.reps), weightKg: parseInputNumber(s.weightKg) }))).filter((s) => s.reps !== null && !Number.isNaN(s.reps)));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent wide title={session ? "Edit workout" : "Log workout"} description="Leave unknown values blank. EVOLV never fills them in.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Name" htmlFor="ws-name" className="col-span-2">
                <Input id="ws-name" value={f.name} onChange={setField("name")} placeholder="e.g. Push day" />
              </Field>
              <Field label="Type" htmlFor="ws-type">
                <Select id="ws-type" value={f.type} onChange={setField("type")}>
                  {WORKOUT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="ws-date">
                <Input id="ws-date" type="date" value={f.date} onChange={setField("date")} />
              </Field>
              <Field label="Duration (min)" htmlFor="ws-dur">
                <Input id="ws-dur" inputMode="decimal" value={f.durationMin} onChange={setField("durationMin")} placeholder="—" />
              </Field>
              {isCardio || f.distanceKm ? (
                <Field label="Distance (km)" htmlFor="ws-dist">
                  <Input id="ws-dist" inputMode="decimal" value={f.distanceKm} onChange={setField("distanceKm")} placeholder="—" />
                </Field>
              ) : null}
              <Field label="Calories (kcal)" htmlFor="ws-cal">
                <Input id="ws-cal" inputMode="decimal" value={f.calories} onChange={setField("calories")} placeholder="—" />
              </Field>
              <Field label="Avg heart rate" htmlFor="ws-hr">
                <Input id="ws-hr" inputMode="decimal" value={f.avgHeartRate} onChange={setField("avgHeartRate")} placeholder="bpm" />
              </Field>
            </div>

            {f.type === "strength" || rows.length ? (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">Exercises</h3>
                  <span className="tabular text-[12.5px] text-muted">Volume {fmt(liveVolume.volume)} kg (reps × load)</span>
                </div>
                <datalist id="exercise-library">
                  {library.map((l) => (
                    <option key={l.id} value={l.name} />
                  ))}
                </datalist>
                <ul className="space-y-3">
                  {rows.map((r, ri) => (
                    <li key={r.key} className="rounded-[12px] border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label={`Exercise ${ri + 1} name`} list="exercise-library" value={r.name} onChange={(e) => pickName(r.key, e.target.value)} placeholder="Exercise" className="h-9 min-w-[180px] flex-1" />
                        <Select aria-label="Muscle group" value={r.muscleGroup} onChange={(e) => patchRow(r.key, { muscleGroup: e.target.value })} className="h-9 w-36">
                          <option value="">Muscle group</option>
                          {MUSCLE_GROUPS.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </Select>
                        <Button size="icon" variant="ghost" aria-label={`Remove ${r.name || "exercise"}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          <Trash2 />
                        </Button>
                      </div>
                      <table className="mt-2 w-full text-[13px]">
                        <thead>
                          <tr className="text-left text-[11.5px] text-faint">
                            <th className="w-10 py-1 font-medium">Set</th>
                            <th className="py-1 font-medium">Reps</th>
                            <th className="py-1 font-medium">Weight (kg)</th>
                            <th className="py-1 font-medium">Rest (s)</th>
                            <th className="w-9" />
                          </tr>
                        </thead>
                        <tbody>
                          {r.sets.map((s, si) => (
                            <tr key={si}>
                              <td className="tabular py-1 text-muted">{si + 1}</td>
                              {(["reps", "weightKg", "restSec"] as const).map((fk) => (
                                <td key={fk} className="py-1 pr-2">
                                  <Input
                                    aria-label={`Set ${si + 1} ${fk}`}
                                    inputMode="decimal"
                                    value={s[fk]}
                                    placeholder="—"
                                    onChange={(e) => patchRow(r.key, { sets: r.sets.map((x, xi) => (xi === si ? { ...x, [fk]: e.target.value } : x)) })}
                                    className="h-8 px-2 tabular"
                                  />
                                </td>
                              ))}
                              <td>
                                <button type="button" aria-label={`Remove set ${si + 1}`} onClick={() => patchRow(r.key, { sets: r.sets.filter((_, xi) => xi !== si) })} className="rounded p-1 text-faint hover:text-bad">
                                  <X className="size-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        onClick={() => patchRow(r.key, { sets: [...r.sets, r.sets.length ? { ...r.sets[r.sets.length - 1] } : { reps: "", weightKg: "", restSec: "" }] })}
                      >
                        <Plus /> Add set
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" size="sm" className="mt-3" onClick={addExercise}>
                  <Plus /> Add exercise
                </Button>
              </div>
            ) : null}

            <Field label="Notes" htmlFor="ws-notes" className="mt-4">
              <Textarea id="ws-notes" rows={2} value={f.notes} onChange={setField("notes")} />
            </Field>
            {err ? <p className="mt-3 text-[13px] text-bad">{err}</p> : null}
            <div className="mt-5 flex items-center justify-between gap-2">
              {session ? (
                <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => setConfirmDel(true)}>
                  <Trash2 /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {session ? "Save workout" : "Log workout"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this workout?"
        description="The session and all its exercises and sets will be removed."
        confirmLabel="Delete workout"
        busy={busy}
        onConfirm={async () => {
          if (!session) return;
          const r = await run(() => deleteWorkoutSession(session.id), "Workout deleted");
          setConfirmDel(false);
          if (r.ok) onOpenChange(false);
        }}
      />
    </>
  );
}
