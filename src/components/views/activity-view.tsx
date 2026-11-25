"use client";
import * as React from "react";
import { Pencil } from "lucide-react";
import { useUI } from "@/stores/ui-store";
import { useActivityForDate, useActivityRange, useGoals, useWorkoutData } from "@/hooks/use-data";
import { activitySeries, summarizeActivity } from "@/lib/analytics/activity";
import { goalsForDate } from "@/lib/analytics/goals";
import { weeklyFrequency } from "@/lib/analytics/workouts";
import { formatDay, shiftDate } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, SourceBadge } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/segmented";
import { Stat } from "@/components/ui/stat";
import { DailyBars } from "@/components/charts/daily-bars";
import { ActivityPanel } from "@/components/activity/activity-panel";
import { ActivityDialog } from "@/components/activity/activity-dialog";

export function ActivityView() {
  const date = useUI((s) => s.selectedDate);
  const [days, setDays] = React.useState<7 | 30 | 90>(30);
  const start = shiftDate(date, -(days - 1));
  const entries = useActivityRange(start, date);
  const today = useActivityForDate(date);
  const goals = useGoals();
  const workouts = useWorkoutData();
  const [open, setOpen] = React.useState(false);
  const [editDate, setEditDate] = React.useState(date);

  if (!entries || today === undefined || !goals || !workouts) return <LoadingBlock />;
  const series = activitySeries(start, date, entries, goals);
  const s = summarizeActivity(series);
  const g = goalsForDate(goals, date);
  const daySessions = workouts.sessions.filter((w) => w.date === date);
  const rangeSessions = workouts.sessions.filter((w) => w.date >= start && w.date <= date);
  const freq = weeklyFrequency(rangeSessions);
  const pct = (m: { met: number; of: number }) => (m.of ? `${m.met} of ${m.of} days` : "No goal data");
  const editing = entries.find((e) => e.date === editDate) ?? (editDate === date ? today : null);

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Apple Watch metrics arrive through your daily reports. Move calories are active energy only, not your total daily burn."
        actions={<Segmented label="Range" value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }]} />}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader
            title={formatDay(date, "EEEE, d MMM")}
            action={
              <Button size="sm" variant="ghost" onClick={() => { setEditDate(date); setOpen(true); }}>
                {today ? "Edit" : "Add"}
              </Button>
            }
          />
          <CardBody>
            <ActivityPanel entry={today} goals={g} workouts={{ count: daySessions.length, minutes: daySessions.some((x) => x.durationMin !== null) ? daySessions.reduce((a, x) => a + (x.durationMin ?? 0), 0) : null }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Last ${days} days`} description={`${s.daysWithData} of ${s.days} days have activity data; averages use those days only.`} />
          <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Stat label="Avg steps" value={fmt(s.avgSteps)} accent="var(--r-stand)" />
            <Stat label="Avg move" value={fmt(s.avgMove)} unit="kcal" accent="var(--r-move)" sub={`Goal met ${pct(s.moveGoalMet)}`} />
            <Stat label="Avg exercise" value={fmt(s.avgExercise)} unit="min" accent="var(--r-exercise)" sub={`Goal met ${pct(s.exerciseGoalMet)}`} />
            <Stat label="Avg stand" value={fmt(s.avgStand, { decimals: 1 })} unit="hr" sub={`Goal met ${pct(s.standGoalMet)}`} />
            <Stat label="Total distance" value={fmt(s.totalDistanceKm, { decimals: 1 })} unit="km" />
            <Stat label="Workouts" value={`${rangeSessions.length}`} sub={freq.length ? `${(rangeSessions.length / Math.max(1, days / 7)).toFixed(1)} per week` : undefined} />
          </CardBody>
        </Card>
      </div>

      {s.daysWithData === 0 ? (
        <EmptyState className="mt-4" title="No activity in this range" body="Import a daily report that includes your Apple Watch summary, or add a day manually." action={{ label: "Import a report", href: "/import/" }} />
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Steps" description={g?.steps ? `Daily goal ${fmt(g.steps)} (dashed)` : "Set a step goal in Goals & Targets"} />
              <CardBody>
                <DailyBars data={series.map((d) => ({ date: d.date, value: d.entry?.steps ?? null }))} color="var(--r-stand)" unit="steps" target={g?.steps} name="Steps" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Exercise minutes" description={g?.exerciseMinutes || today?.exerciseGoal ? `Goal ${fmt(today?.exerciseGoal ?? g?.exerciseMinutes ?? null)} min (dashed)` : undefined} />
              <CardBody>
                <DailyBars data={series.map((d) => ({ date: d.date, value: d.entry?.exerciseMinutes ?? null }))} color="var(--r-exercise)" unit="min" target={today?.exerciseGoal ?? g?.exerciseMinutes} name="Exercise" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Move calories" description="Active energy from the watch" />
              <CardBody>
                <DailyBars data={series.map((d) => ({ date: d.date, value: d.entry?.moveCalories ?? null }))} color="var(--r-move)" unit="kcal" target={today?.moveGoal ?? g?.moveCalories} name="Move" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Stand hours" />
              <CardBody>
                <DailyBars data={series.map((d) => ({ date: d.date, value: d.entry?.standHours ?? null }))} color="var(--r-stand)" unit="hr" target={today?.standGoal ?? g?.standHours} name="Stand" />
              </CardBody>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader title="Daily records" description="Imported values come from your reports; corrections are marked." />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[12px] text-muted">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 text-right font-medium">Move</th>
                      <th className="py-2 text-right font-medium">Exercise</th>
                      <th className="py-2 text-right font-medium">Stand</th>
                      <th className="py-2 text-right font-medium">Steps</th>
                      <th className="py-2 text-right font-medium">Distance</th>
                      <th className="py-2 pl-4 font-medium">Source</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().filter((d) => d.entry).map(({ date: d, entry: e, goals: dg }) => (
                      <tr key={d} className="border-b border-line/60">
                        <td className="py-2">{formatDay(d, "EEE, d MMM")}</td>
                        <td className="tabular py-2 text-right">{fmt(e!.moveCalories)}{dg.move ? <span className="text-faint"> / {fmt(dg.move)}</span> : null}</td>
                        <td className="tabular py-2 text-right">{fmt(e!.exerciseMinutes)}{dg.exercise ? <span className="text-faint"> / {fmt(dg.exercise)}</span> : null}</td>
                        <td className="tabular py-2 text-right">{fmt(e!.standHours)}{dg.stand ? <span className="text-faint"> / {fmt(dg.stand)}</span> : null}</td>
                        <td className="tabular py-2 text-right">{fmt(e!.steps)}</td>
                        <td className="tabular py-2 text-right">{fmt(e!.distanceKm, { decimals: 1 })} km</td>
                        <td className="py-2 pl-4"><SourceBadge source={e!.source} corrected={e!.corrected} /></td>
                        <td className="py-2 text-right">
                          <Button size="icon" variant="ghost" aria-label={`Edit activity for ${d}`} onClick={() => { setEditDate(d); setOpen(true); }}>
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
      <ActivityDialog open={open} onOpenChange={setOpen} date={editDate} entry={editing ?? null} />
    </div>
  );
}
