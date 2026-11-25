"use client";
import * as React from "react";
import { Dumbbell, Pencil, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExerciseDefinition, WorkoutSession } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import { useExerciseLibrary, useWorkoutData } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { deleteExerciseDefinition, saveExerciseDefinition } from "@/lib/db/repos";
import { MUSCLE_GROUPS } from "@/lib/db/seed";
import { E1RM_FORMULA, exerciseRecords, muscleGroupDistribution, totalReps, volumeOf, weeklyFrequency } from "@/lib/analytics/workouts";
import { formatDay, shiftDate, todayISO, weekKey } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, EstimateBadge, LoadingBlock, SourceBadge } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stat } from "@/components/ui/stat";
import { ChartOrTable } from "@/components/ui/chart-or-table";
import { ChartFrame, ChartTooltip, Legend } from "@/components/ui/chart";
import { SessionDialog } from "@/components/workouts/session-dialog";

export function WorkoutsView() {
  const date = useUI((s) => s.selectedDate);
  const data = useWorkoutData();
  const library = useExerciseLibrary();
  const [editing, setEditing] = React.useState<WorkoutSession | null>(null);
  const [open, setOpen] = React.useState(false);
  if (!data || !library) return <LoadingBlock />;
  const openSession = (s: WorkoutSession | null) => {
    setEditing(s);
    setOpen(true);
  };
  return (
    <div>
      <PageHeader
        title="Workouts"
        description="Strength and cardio sessions. Volume is sets × reps × load, counted only where both reps and load are recorded."
        actions={
          <Button variant="primary" onClick={() => openSession(null)}>
            <Plus /> Log workout
          </Button>
        }
      />
      <Tabs defaultValue="log">
        <TabsList className="mb-4">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="records">Personal records</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="library">Exercise library</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <SessionLog data={data} onOpen={openSession} />
        </TabsContent>
        <TabsContent value="records">
          <Records data={data} />
        </TabsContent>
        <TabsContent value="analytics">
          <Analytics data={data} />
        </TabsContent>
        <TabsContent value="library">
          <Library library={library} />
        </TabsContent>
      </Tabs>
      <SessionDialog open={open} onOpenChange={setOpen} date={date} session={editing} exercises={data.exercises} sets={data.sets} library={library} />
    </div>
  );
}

type Data = NonNullable<ReturnType<typeof useWorkoutData>>;

function SessionLog({ data, onOpen }: { data: Data; onOpen: (s: WorkoutSession) => void }) {
  const sessions = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!sessions.length) return <EmptyState icon={<Dumbbell />} title="No workouts logged yet" body="Log a strength session with sets, or import a report that includes an Apple Watch workout." />;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {sessions.map((s) => {
          const exs = data.exercises.filter((e) => e.sessionId === s.id).sort((a, b) => a.order - b.order);
          const sets = data.sets.filter((x) => x.sessionId === s.id);
          const v = volumeOf(sets);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s)} className="flex w-full flex-wrap items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2/60 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.name}
                    <Badge>{s.type}</Badge>
                    <SourceBadge source={s.source} />
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {formatDay(s.date)}
                    {s.durationMin !== null ? `, ${fmt(s.durationMin)} min` : ""}
                    {s.distanceKm !== null ? `, ${fmt(s.distanceKm, { decimals: 1 })} km` : ""}
                    {s.calories !== null ? `, ${fmt(s.calories)} kcal` : ""}
                    {s.avgHeartRate !== null ? `, ${s.avgHeartRate} bpm avg` : ""}
                  </p>
                  {exs.length ? <p className="mt-1 text-[12.5px] text-faint">{exs.map((e) => `${e.name} (${sets.filter((x) => x.workoutExerciseId === e.id).length})`).join(", ")}</p> : null}
                </div>
                {sets.length ? (
                  <div className="tabular text-right text-[12.5px]">
                    <p className="font-semibold text-[14px]">{fmt(v.volume)} kg</p>
                    <p className="text-muted">
                      {sets.length} sets, {totalReps(sets)} reps
                    </p>
                    {v.uncountedSets ? <p className="text-faint">{v.uncountedSets} without load</p> : null}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Records({ data }: { data: Data }) {
  const records = exerciseRecords(data.sessions, data.exercises, data.sets);
  const [selected, setSelected] = React.useState<string | null>(null);
  if (!records.length) return <EmptyState title="No strength sets recorded yet" body="Personal records appear once you log sets with reps and weight." />;
  const rec = records.find((r) => r.name === selected) ?? records[0];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Personal records" description={<>Estimated 1RM uses {E1RM_FORMULA}. It is an estimate, not a lift you performed.</>} />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="py-2 font-medium">Exercise</th>
                  <th className="py-2 text-right font-medium">Heaviest set</th>
                  <th className="py-2 text-right font-medium">Most reps</th>
                  <th className="py-2 text-right font-medium">Est. 1RM</th>
                  <th className="py-2 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.name} className={`cursor-pointer border-b border-line/60 hover:bg-surface-2/60 ${r.name === rec.name ? "bg-surface-2/60" : ""}`} onClick={() => setSelected(r.name)}>
                    <td className="py-2 font-medium">
                      <button type="button" className="text-left" onClick={() => setSelected(r.name)}>
                        {r.name}
                      </button>
                      {r.muscleGroup ? <span className="ml-2 text-[12px] text-faint">{r.muscleGroup}</span> : null}
                    </td>
                    <td className="tabular py-2 text-right">{r.maxWeight ? `${r.maxWeight.weightKg} kg × ${r.maxWeight.reps ?? "?"}` : "—"}</td>
                    <td className="tabular py-2 text-right">{r.maxReps ? `${r.maxReps.reps}${r.maxReps.weightKg !== null ? ` @ ${r.maxReps.weightKg} kg` : ""}` : "—"}</td>
                    <td className="tabular py-2 text-right">{r.bestE1RM ? `~${r.bestE1RM.value} kg` : <span className="text-faint">n/a</span>}</td>
                    <td className="tabular py-2 text-right">{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`${rec.name} progression`} description="Heaviest set and best estimated 1RM per session" action={<EstimateBadge label="1RM estimated" />} />
        <CardBody>
          {rec.progression.length < 2 ? (
            <p className="text-[13px] text-muted">Log this exercise in at least two sessions to see progression.</p>
          ) : (
            <ChartOrTable
              label={`${rec.name} progression`}
              table={{ columns: ["Session", "Heaviest set (kg)", "Est. 1RM (kg)", "Volume (kg)"], rows: rec.progression.map((p) => [formatDay(p.date, "d MMM yyyy"), p.topWeight, p.bestE1RM, fmt(p.volume)]) }}
            >
              <ChartFrame height={220}>
                <ResponsiveContainer>
                  <LineChart data={rec.progression} margin={{ top: 8, right: 12, left: -8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d MMM")} />
                    <YAxis axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
                    <Tooltip content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => formatDay(String(l), "d MMM yyyy")} valueFormatter={(v) => (v == null ? "—" : `${v} kg`)} />} />
                    <Line dataKey="topWeight" name="Heaviest set" stroke="var(--c-strength)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line dataKey="bestE1RM" name="Est. 1RM" stroke="var(--c-strength)" strokeOpacity={0.55} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
              <Legend className="mt-2" items={[{ label: "Heaviest set", color: "var(--c-strength)" }, { label: "Estimated 1RM", color: "var(--c-strength)", dashed: true }]} />
            </ChartOrTable>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Analytics({ data }: { data: Data }) {
  if (!data.sessions.length) return <EmptyState title="No workouts yet" />;
  const today = todayISO();
  const freq = weeklyFrequency(data.sessions.filter((s) => s.date > shiftDate(today, -84)));
  const groups = muscleGroupDistribution(data.exercises, data.sets);
  const volumeByWeek = new Map<string, number>();
  const sessionWeek = new Map(data.sessions.map((s) => [s.id, weekKey(s.date)]));
  for (const set of data.sets) {
    const w = sessionWeek.get(set.sessionId);
    if (!w || set.reps === null || set.weightKg === null) continue;
    volumeByWeek.set(w, (volumeByWeek.get(w) ?? 0) + set.reps * set.weightKg);
  }
  const weekly = freq.map((f) => ({ ...f, volume: Math.round(volumeByWeek.get(f.week) ?? 0) }));
  const exerciseCounts = exerciseRecords(data.sessions, data.exercises, data.sets).slice(0, 10);
  const last28 = data.sessions.filter((s) => s.date > shiftDate(today, -28)).length;
  const v = volumeOf(data.sets);
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-2 gap-5 pt-5 sm:grid-cols-4">
          <Stat label="Total workouts" value={data.sessions.length} />
          <Stat label="Last 4 weeks" value={last28} sub={`${(last28 / 4).toFixed(1)} per week`} />
          <Stat label="Total sets" value={data.sets.length} />
          <Stat label="Lifetime volume" value={fmt(v.volume)} unit="kg" sub={v.uncountedSets ? `${v.uncountedSets} sets without load excluded` : undefined} />
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weekly frequency" description="Sessions per week, last 12 weeks" />
          <CardBody>
            <ChartOrTable label="Workout sessions per week" table={{ columns: ["Week of", "Sessions", "Minutes"], rows: weekly.map((w) => [formatDay(w.week, "d MMM yyyy"), w.sessions, w.minutes]) }}>
            <ChartFrame height={200}>
              <ResponsiveContainer>
                <BarChart data={weekly} margin={{ top: 8, right: 8, left: -16 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d MMM")} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => `Week of ${formatDay(String(l), "d MMM")}`} />} />
                  <Bar dataKey="sessions" name="Sessions" fill="var(--c-strength)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
            </ChartOrTable>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Training volume" description="kg lifted per week (reps × load)" />
          <CardBody>
            <ChartOrTable label="Training volume per week" table={{ columns: ["Week of", "Volume (kg)"], rows: weekly.map((w) => [formatDay(w.week, "d MMM yyyy"), fmt(w.volume)]) }}>
            <ChartFrame height={200}>
              <ResponsiveContainer>
                <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d MMM")} />
                  <YAxis axisLine={false} tickLine={false} width={48} tickFormatter={(x) => fmt(x)} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => `Week of ${formatDay(String(l), "d MMM")}`} valueFormatter={(x) => `${fmt(Number(x))} kg`} />} />
                  <Bar dataKey="volume" name="Volume" fill="var(--c-strength)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
            </ChartOrTable>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Muscle group distribution" description="Sets logged per muscle group" />
          <CardBody>
            {groups.length ? (
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li key={g.group} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-[13px]">
                    <span className="text-muted">{g.group}</span>
                    <span className="h-2 rounded-full bg-surface-3">
                      <span className="block h-2 rounded-full bg-[var(--c-strength)]" style={{ width: `${(g.sets / groups[0].sets) * 100}%` }} />
                    </span>
                    <span className="tabular text-right">{g.sets}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No sets with a muscle group yet.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Exercise frequency" />
          <CardBody>
            {exerciseCounts.length ? (
              <ul className="space-y-1.5 text-[13.5px]">
                {exerciseCounts.map((r) => (
                  <li key={r.name} className="flex justify-between">
                    <span>{r.name}</span>
                    <span className="tabular text-muted">
                      {r.sessions} sessions, {r.totalSets} sets
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No exercises logged yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Library({ library }: { library: ExerciseDefinition[] }) {
  const { run, busy } = useAction();
  const [edit, setEdit] = React.useState<ExerciseDefinition | "new" | null>(null);
  const [del, setDel] = React.useState<ExerciseDefinition | null>(null);
  const [form, setForm] = React.useState({ name: "", muscleGroup: "Chest", equipment: "", category: "compound" as ExerciseDefinition["category"] });
  React.useEffect(() => {
    if (edit === "new") setForm({ name: "", muscleGroup: "Chest", equipment: "", category: "compound" });
    else if (edit) setForm({ name: edit.name, muscleGroup: edit.muscleGroup, equipment: edit.equipment ?? "", category: edit.category });
  }, [edit]);
  return (
    <Card>
      <CardHeader title="Exercise library" description="Used for suggestions when logging sets." action={<Button size="sm" variant="outline" onClick={() => setEdit("new")}><Plus /> Add exercise</Button>} />
      <CardBody>
        <ul className="divide-y divide-line">
          {library.map((ex) => (
            <li key={ex.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{ex.name}</p>
                <p className="text-[12.5px] text-muted">
                  {ex.muscleGroup}
                  {ex.equipment ? `, ${ex.equipment}` : ""}, {ex.category}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Edit ${ex.name}`} onClick={() => setEdit(ex)}>
                <Pencil />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${ex.name}`} onClick={() => setDel(ex)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit === "new" ? "Add exercise" : "Edit exercise"}>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(() => saveExerciseDefinition({ name: form.name, muscleGroup: form.muscleGroup, equipment: form.equipment || null, category: form.category }, edit && edit !== "new" ? edit.id : undefined), "Exercise saved");
              if (r.ok) setEdit(null);
            }}
          >
            <Field label="Name" htmlFor="ex-name" className="col-span-2">
              <Input id="ex-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Muscle group" htmlFor="ex-mg">
              <Select id="ex-mg" value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}>
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="ex-cat">
              <Select id="ex-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExerciseDefinition["category"] })}>
                {["compound", "isolation", "bodyweight", "cardio", "other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Equipment" htmlFor="ex-eq" className="col-span-2">
              <Input id="ex-eq" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Barbell, dumbbell, cable…" />
            </Field>
            <div className="col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Save exercise
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Remove ${del?.name ?? ""} from the library?`}
        description="Logged workouts keep this exercise by name; only the library entry is removed."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={async () => {
          if (!del) return;
          await run(() => deleteExerciseDefinition(del.id), "Exercise removed");
          setDel(null);
        }}
      />
    </Card>
  );
}
