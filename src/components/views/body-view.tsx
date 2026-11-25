"use client";
import * as React from "react";
import { Pencil, Plus, Ruler, Scale } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { BodyMeasurement, MeasurementKey, WeightEntry } from "@/lib/db/types";
import { MEASUREMENT_KEYS } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import { useGoals, useMeasurements, useProfile, useWeights } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { addMeasurement, deleteMeasurement, updateMeasurement } from "@/lib/db/repos";
import { goalsForDate } from "@/lib/analytics/goals";
import { bmi, bmiCategory, dailyWeights, measurementChanges, measurementSeries, monthlyAverages, movingAverage, weeklyAverages, weightTrendPerWeek } from "@/lib/analytics/body";
import { formatDay, isISODate, shiftDate, todayISO } from "@/lib/utils/dates";
import { MEASUREMENT_LABEL, fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, LoadingBlock, SourceBadge } from "@/components/ui/feedback";
import { Field, Input, numToInput, parseInputNumber } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Stat } from "@/components/ui/stat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartFrame, ChartTooltip, Legend } from "@/components/ui/chart";
import { WeightDialog } from "@/components/body/weight-dialog";
import { Delta } from "@/components/ui/delta";

const RANGES = [
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "180", label: "6 months", days: 182 },
  { value: "365", label: "1 year", days: 365 },
  { value: "all", label: "All time", days: 0 },
] as const;

const unitOf = (k: MeasurementKey) => (k === "bodyFatPct" ? "%" : "cm");

export function BodyView() {
  const date = useUI((s) => s.selectedDate);
  const weights = useWeights();
  const measurements = useMeasurements();
  const profile = useProfile();
  const goals = useGoals();
  const [weightOpen, setWeightOpen] = React.useState(false);
  const [editingWeight, setEditingWeight] = React.useState<WeightEntry | null>(null);

  if (!weights || !measurements || !profile || !goals) return <LoadingBlock />;
  const g = goalsForDate(goals, todayISO());
  const daily = dailyWeights(weights);
  const latest = daily.at(-1) ?? null;
  const v = latest ? bmi(latest.weightKg, profile.heightCm) : null;
  const cats = v ? bmiCategory(v) : null;

  return (
    <div>
      <PageHeader
        title="Body Analytics"
        description="Scale weight moves with water, salt and food volume. Read trends from averages, alongside waist and strength."
        actions={
          <Button variant="primary" onClick={() => { setEditingWeight(null); setWeightOpen(true); }}>
            <Scale /> Log weight
          </Button>
        }
      />
      <Tabs defaultValue="weight">
        <TabsList className="mb-4">
          <TabsTrigger value="weight">Weight</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
          <TabsTrigger value="bmi">BMI</TabsTrigger>
        </TabsList>
        <TabsContent value="weight">
          <WeightTab weights={weights} targetKg={g?.targetWeightKg ?? null} onEdit={(w) => { setEditingWeight(w); setWeightOpen(true); }} />
        </TabsContent>
        <TabsContent value="measurements">
          <MeasurementsTab rows={measurements} />
        </TabsContent>
        <TabsContent value="bmi">
          <Card>
            <CardHeader title="Body-mass index" />
            <CardBody>
              {v && cats && latest ? (
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <div>
                    <p className="font-display text-[48px] font-semibold leading-none tabular">{v}</p>
                    <p className="mt-2 text-[13px] text-muted">
                      From {latest.weightKg} kg ({formatDay(latest.date, "d MMM")}) and {profile.heightCm} cm
                    </p>
                  </div>
                  <div className="space-y-3 text-[14px]">
                    <p>
                      WHO adult category: <strong>{cats.who}</strong>. Using the lower cut-offs common in Indian guidance (overweight from 23, obesity from 25): <strong>{cats.asianIndian}</strong>.
                    </p>
                    <p className="text-muted">
                      BMI is weight relative to height. It does not measure body fat and cannot tell muscle from fat, so people who carry more muscle often read higher. EVOLV does not use BMI to judge recomposition; waist, strength and weight trends are more informative.
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState title="BMI needs a weigh-in and your height" body="Add your height in Profile and log a weight." />
              )}
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>
      <WeightDialog open={weightOpen} onOpenChange={setWeightOpen} date={date} entry={editingWeight} />
    </div>
  );
}

function WeightTab({ weights, targetKg, onEdit }: { weights: WeightEntry[]; targetKg: number | null; onEdit: (w: WeightEntry) => void }) {
  const [range, setRange] = React.useState<(typeof RANGES)[number]["value"]>("90");
  const daily = dailyWeights(weights);
  if (!daily.length) return <EmptyState icon={<Scale />} title="No weigh-ins yet" body="Log your weight a few times a week for a reliable trend." />;
  const today = todayISO();
  const days = RANGES.find((r) => r.value === range)!.days;
  const from = days ? shiftDate(today, -(days - 1)) : daily[0].date;
  const ma = movingAverage(daily);
  const inRange = ma.filter((p) => p.date >= from);
  const first = daily[0];
  const latest = daily[daily.length - 1];
  const trend = weightTrendPerWeek(daily.filter((d) => d.date >= from));
  const weekly = weeklyAverages(daily.filter((d) => d.date >= from));
  const monthly = monthlyAverages(daily);
  const thisWeek = weekly.at(-1);
  const thisMonth = monthly.at(-1);
  const ys = inRange.flatMap((p) => [p.weightKg, p.average]).concat(targetKg ? [targetKg] : []);
  const domain = ys.length ? [Math.floor(Math.min(...ys) - 0.5), Math.ceil(Math.max(...ys) + 0.5)] : ["auto", "auto"];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-2 gap-5 pt-5 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Current" value={fmt(latest.weightKg, { decimals: 1 })} unit="kg" sub={formatDay(latest.date, "d MMM")} />
          <Stat label="Starting" value={fmt(first.weightKg, { decimals: 1 })} unit="kg" sub={formatDay(first.date, "d MMM yyyy")} />
          <Stat label="Target" value={targetKg ? fmt(targetKg, { decimals: 1 }) : "—"} unit={targetKg ? "kg" : undefined} sub={targetKg ? `${fmt(latest.weightKg - targetKg, { decimals: 1 })} kg to go` : "Set in Goals"} />
          <Stat label="Total change" value={<Delta value={latest.weightKg - first.weightKg} unit="" />} unit="kg" />
          <Stat label="7-day average" value={fmt(ma.at(-1)?.average ?? null, { decimals: 1 })} unit="kg" sub={`${ma.at(-1)?.samples ?? 0} weigh-ins`} />
          <Stat label="This week avg" value={thisWeek ? fmt(thisWeek.average, { decimals: 1 }) : "—"} unit="kg" sub={thisWeek ? `${thisWeek.samples} weigh-ins` : undefined} />
          <Stat label="This month avg" value={thisMonth ? fmt(thisMonth.average, { decimals: 1 }) : "—"} unit="kg" sub={thisMonth ? `${thisMonth.samples} weigh-ins` : undefined} />
          <Stat label="Trend" value={trend ? <Delta value={trend.kgPerWeek} unit="" /> : "—"} unit={trend ? "kg/wk" : undefined} sub={trend ? `Fitted over ${trend.samples} weigh-ins` : "Needs 4+ over 10+ days"} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Weight and 7-day average" action={<Segmented label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />} />
        <CardBody>
          {inRange.length ? (
            <>
              <ChartFrame height={280}>
                <ResponsiveContainer>
                  <ComposedChart data={inRange} margin={{ top: 8, right: 12, left: -8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d MMM")} minTickGap={24} />
                    <YAxis domain={domain as [number, number]} axisLine={false} tickLine={false} width={44} />
                    {targetKg ? <ReferenceLine y={targetKg} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `Target ${targetKg} kg`, position: "insideBottomRight", fill: "var(--muted)", fontSize: 11 }} /> : null}
                    <Tooltip content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => formatDay(String(l), "EEE, d MMM yyyy")} valueFormatter={(x) => `${Number(x).toFixed(2)} kg`} />} />
                    <Scatter dataKey="weightKg" name="Weigh-in" fill="var(--c-body)" fillOpacity={0.45} isAnimationActive={false} />
                    <Line dataKey="average" name="7-day average" stroke="var(--c-body)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartFrame>
              <Legend className="mt-2" items={[{ label: "Daily weigh-in", color: "color-mix(in oklab, var(--c-body) 45%, transparent)" }, { label: "7-day moving average", color: "var(--c-body)" }, ...(targetKg ? [{ label: "Target", color: "var(--muted)", dashed: true }] : [])]} />
            </>
          ) : (
            <p className="text-[13px] text-muted">No weigh-ins in this range.</p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weekly averages" description="Monday to Sunday" />
          <CardBody>
            <PeriodBars data={weekly.map((w) => ({ label: formatDay(w.start, "d MMM"), value: w.average, samples: w.samples }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Monthly progression" />
          <CardBody>
            <PeriodBars data={monthly.map((m) => ({ label: formatDay(`${m.key}-01`, "MMM yy"), value: m.average, samples: m.samples }))} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Weigh-ins" />
        <CardBody>
          <ul className="divide-y divide-line">
            {[...weights].reverse().slice(0, 60).map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2 text-[13.5px]">
                <span className="w-36">{formatDay(w.date, "EEE, d MMM yyyy")}</span>
                <span className="tabular flex-1 font-semibold">{w.weightKg} kg</span>
                <SourceBadge source={w.source} />
                <Button size="icon" variant="ghost" aria-label={`Edit weigh-in ${w.date}`} onClick={() => onEdit(w)}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function PeriodBars({ data }: { data: { label: string; value: number; samples: number }[] }) {
  if (data.length < 2) return <p className="text-[13px] text-muted">Needs at least two periods with weigh-ins.</p>;
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  return (
    <ChartFrame height={200}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis domain={[Math.floor(min - 1), Math.ceil(max + 0.5)]} axisLine={false} tickLine={false} width={40} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} valueFormatter={(x) => `${Number(x).toFixed(2)} kg (${(p.payload?.[0]?.payload as { samples: number })?.samples} weigh-ins)`} />} />
          <Bar dataKey="value" name="Average" fill="var(--c-body)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function MeasurementsTab({ rows }: { rows: BodyMeasurement[] }) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BodyMeasurement | null>(null);
  const [key, setKey] = React.useState<MeasurementKey>("waistCm");
  const changes = measurementChanges(rows);
  const series = measurementSeries(rows, key);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus /> Add measurements
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState icon={<Ruler />} title="No measurements yet" body="Waist circumference is one of the most useful recomposition signals. Measure at the navel, relaxed, at the same time of day." action={{ label: "Add measurements", onClick: () => setOpen(true) }} />
      ) : (
        <>
          <Card>
            <CardHeader title="Change since first measurement" />
            <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {changes.map((c) => (
                <Stat
                  key={c.key}
                  label={MEASUREMENT_LABEL[c.key]}
                  value={c.latest ? fmt(c.latest.value, { decimals: 1 }) : "—"}
                  unit={c.latest ? unitOf(c.key) : undefined}
                  sub={c.change !== null ? <Delta value={c.change} unit={unitOf(c.key)} /> : c.count === 1 ? "One reading" : "Not measured"}
                />
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`${MEASUREMENT_LABEL[key]} over time`} action={<Segmented label="Measurement" value={key} onChange={setKey} options={MEASUREMENT_KEYS.map((k) => ({ value: k, label: MEASUREMENT_LABEL[k] }))} />} />
            <CardBody>
              {series.length >= 2 ? (
                <ChartFrame height={220}>
                  <ResponsiveContainer>
                    <ComposedChart data={series} margin={{ top: 8, right: 12, left: -8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d MMM")} />
                      <YAxis domain={["auto", "auto"]} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => formatDay(String(l), "d MMM yyyy")} valueFormatter={(x) => `${x} ${unitOf(key)}`} />} />
                      <Line dataKey="value" name={MEASUREMENT_LABEL[key]} stroke="var(--c-body)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartFrame>
              ) : (
                <p className="text-[13px] text-muted">Needs at least two {MEASUREMENT_LABEL[key].toLowerCase()} readings.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="All measurements" />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[12px] text-muted">
                      <th className="py-2 font-medium">Date</th>
                      {MEASUREMENT_KEYS.map((k) => (
                        <th key={k} className="py-2 text-right font-medium">
                          {MEASUREMENT_LABEL[k]} ({unitOf(k)})
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="py-2">{formatDay(r.date, "d MMM yyyy")}</td>
                        {MEASUREMENT_KEYS.map((k) => (
                          <td key={k} className="tabular py-2 text-right">
                            {fmt(r[k], { decimals: 1 })}
                          </td>
                        ))}
                        <td className="text-right">
                          <Button size="icon" variant="ghost" aria-label={`Edit measurements ${r.date}`} onClick={() => { setEditing(r); setOpen(true); }}>
                            <Pencil />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
      <MeasurementDialog open={open} onOpenChange={setOpen} entry={editing} />
    </div>
  );
}

function MeasurementDialog({ open, onOpenChange, entry }: { open: boolean; onOpenChange: (o: boolean) => void; entry: BodyMeasurement | null }) {
  const date = useUI((s) => s.selectedDate);
  const { run, busy } = useAction();
  const [d, setD] = React.useState(date);
  const [v, setV] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setD(entry?.date ?? date);
    setNote(entry?.note ?? "");
    setErr(null);
    const init: Record<string, string> = {};
    for (const k of MEASUREMENT_KEYS) init[k] = numToInput(entry?.[k]);
    setV(init);
  }, [open, entry, date]);
  const save = async () => {
    if (!isISODate(d)) return setErr("Enter a valid date.");
    const out = {} as Record<MeasurementKey, number | null>;
    for (const k of MEASUREMENT_KEYS) {
      const n = parseInputNumber(v[k] ?? "");
      if (n !== null && !Number.isFinite(n)) return setErr(`${MEASUREMENT_LABEL[k]} must be a number.`);
      out[k] = n;
    }
    const r = await run(() => (entry ? updateMeasurement(entry.id, { date: d, ...out, note: note || null }) : addMeasurement({ date: d, ...out, note: note || null }).then(() => undefined)), "Measurements saved");
    if (r.ok) onOpenChange(false);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={entry ? "Edit measurements" : "Add measurements"} description="Fill in only what you measured. Blank fields stay empty.">
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Field label="Date" htmlFor="m-date" className="col-span-2">
              <Input id="m-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </Field>
            {MEASUREMENT_KEYS.map((k) => (
              <Field key={k} label={`${MEASUREMENT_LABEL[k]} (${unitOf(k)})`} htmlFor={`m-${k}`}>
                <Input id={`m-${k}`} inputMode="decimal" placeholder="—" value={v[k] ?? ""} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
              </Field>
            ))}
            <Field label="Note" htmlFor="m-note" className="col-span-2">
              <Input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {err ? <p className="col-span-2 text-[13px] text-bad">{err}</p> : null}
            <div className="col-span-2 flex items-center justify-between">
              {entry ? (
                <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => setConfirm(true)}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  Save
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete these measurements?"
        confirmLabel="Delete"
        busy={busy}
        onConfirm={async () => {
          if (!entry) return;
          const r = await run(() => deleteMeasurement(entry.id), "Measurements deleted");
          setConfirm(false);
          if (r.ok) onOpenChange(false);
        }}
      />
    </>
  );
}
