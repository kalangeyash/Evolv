"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ClipboardPaste, Eye, EyeOff, Lightbulb, Plus, Settings2, Scale } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardWidgetId, FoodEntry } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import {
  useActivityForDate,
  useActivityRange,
  useFoodForDate,
  useFoodRange,
  useGoals,
  useOverrideForDate,
  useOverridesRange,
  useSettings,
  useWeights,
  useWorkoutData,
} from "@/hooks/use-data";
import { goalsForDate } from "@/lib/analytics/goals";
import { dayNutrition, nutritionSeries } from "@/lib/analytics/nutrition";
import { dailyWeights, movingAverage, weeklyAverageChange, weightTrendPerWeek } from "@/lib/analytics/body";
import { dailyObservations } from "@/lib/analytics/insights";
import { formatDay, shiftDate, todayISO } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { updateSettings } from "@/lib/db/repos";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, SourceBadge } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChartFrame, ChartTooltip } from "@/components/ui/chart";
import { NutrientProgressList } from "@/components/food/nutrient-progress";
import { MealTimeline } from "@/components/food/meal-timeline";
import { FoodEntryDialog } from "@/components/food/food-entry-dialog";
import { IntakeLine } from "@/components/charts/intake-line";
import { ActivityPanel } from "@/components/activity/activity-panel";
import { ActivityDialog } from "@/components/activity/activity-dialog";
import { WeightDialog } from "@/components/body/weight-dialog";
import { cn } from "@/lib/utils/cn";
import { Delta } from "@/components/ui/delta";

const WIDGET_LABEL: Record<DashboardWidgetId, string> = {
  intakeLine: "Intake through the day",
  nutrition: "Nutrition targets",
  activity: "Activity",
  weight: "Weight",
  meals: "Meals",
  insights: "Observations",
};

export function OverviewView() {
  const date = useUI((s) => s.selectedDate);
  const today = todayISO();
  const settings = useSettings();
  const goals = useGoals();
  const food = useFoodForDate(date);
  const override = useOverrideForDate(date);
  const activity = useActivityForDate(date);
  const weights = useWeights();
  const workouts = useWorkoutData();
  const histStart = shiftDate(date, -59);
  const histFood = useFoodRange(histStart, date);
  const histOverrides = useOverridesRange(histStart, date);
  const histActivity = useActivityRange(shiftDate(date, -13), date);

  const [editing, setEditing] = React.useState<FoodEntry | null>(null);
  const [foodOpen, setFoodOpen] = React.useState(false);
  const [actOpen, setActOpen] = React.useState(false);
  const [weightOpen, setWeightOpen] = React.useState(false);
  const [customize, setCustomize] = React.useState(false);

  if (!settings || !goals || !food || override === undefined || activity === undefined || !weights || !workouts || !histFood || !histOverrides || !histActivity) {
    return <LoadingBlock label="Loading overview" />;
  }

  const g = goalsForDate(goals, date);
  const tol = settings.calorieTolerancePct;
  const day = dayNutrition(date, food, override);
  const range = settings.dashboardRangeDays;
  const daily = dailyWeights(weights);
  const upTo = daily.filter((d) => d.date <= date);
  const latest = upTo[upTo.length - 1] ?? null;
  const previous = upTo[upTo.length - 2] ?? null;
  const ma = movingAverage(upTo);
  const weekChange = weeklyAverageChange(upTo, date);
  const trend = weightTrendPerWeek(upTo.filter((d) => d.date > shiftDate(date, -90)));
  const latestEntry = latest ? weights.filter((w) => w.date === latest.date).at(-1) : null;
  const daySessions = workouts.sessions.filter((s) => s.date === date);
  const sessionMinutes = daySessions.some((s) => s.durationMin !== null) ? daySessions.reduce((a, s) => a + (s.durationMin ?? 0), 0) : null;

  const observations = dailyObservations(
    {
      today: date,
      nutrition: nutritionSeries(histStart, date, histFood, histOverrides),
      food: histFood,
      goals,
      activity: histActivity,
      weights: daily,
      measurements: [],
      sessions: [],
      exercises: [],
      sets: [],
      calorieTolerancePct: tol,
    },
    day,
  );

  const widgets = settings.dashboardWidgets;
  const remaining = g && day.totals.calories !== null ? g.calories - day.totals.calories : null;

  const blocks: Record<DashboardWidgetId, React.ReactNode> = {
    intakeLine:
      g && food.some((f) => f.time) ? (
        <Card className="lg:col-span-2">
          <CardHeader title="Intake through the day" description="Running totals as a share of today's targets" />
          <CardBody>
            <IntakeLine entries={food} calorieTarget={g.calories} proteinTarget={g.protein} isToday={date === today} />
          </CardBody>
        </Card>
      ) : null,
    nutrition: (
      <Card className="lg:col-span-2">
        <CardHeader
          title="Nutrition targets"
          description={day.source === "reported" ? "Using the totals printed in the imported report" : day.logged ? `${day.entryCount} food entr${day.entryCount === 1 ? "y" : "ies"}` : "Nothing logged for this day"}
          action={
            <Link href="/goals/" className="text-[12.5px] font-medium text-accent-text hover:underline">
              Edit targets
            </Link>
          }
        />
        <CardBody>
          {g ? <NutrientProgressList totals={day.totals} targets={g} missing={day.missing} tolerance={tol} /> : null}
        </CardBody>
      </Card>
    ),
    activity: (
      <Card>
        <CardHeader
          title="Activity"
          description={activity ? undefined : "No activity recorded for this day"}
          action={
            <Button size="sm" variant="ghost" onClick={() => setActOpen(true)}>
              {activity ? "Edit" : "Add"}
            </Button>
          }
        />
        <CardBody>
          <ActivityPanel entry={activity} goals={g} workouts={{ count: daySessions.length, minutes: sessionMinutes }} />
        </CardBody>
      </Card>
    ),
    weight: (
      <Card>
        <CardHeader
          title="Weight"
          action={
            <Button size="sm" variant="ghost" onClick={() => setWeightOpen(true)}>
              <Scale /> Log
            </Button>
          }
        />
        <CardBody>
          {latest ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-[34px] font-semibold leading-none tabular">
                    {fmt(latest.weightKg, { decimals: 1 })}
                    <span className="ml-1 text-base font-normal text-muted">kg</span>
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted">
                    {latest.date === date ? "Today" : formatDay(latest.date, "d MMM yyyy")}
                    {latestEntry ? <SourceBadge source={latestEntry.source} /> : null}
                  </p>
                </div>
                <WeightSpark data={ma.filter((p) => p.date > shiftDate(date, -range))} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-[13px]">
                <div>
                  <dt className="text-muted">Previous</dt>
                  <dd className="tabular font-semibold">{previous ? `${fmt(previous.weightKg, { decimals: 1 })} kg` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">7-day average</dt>
                  <dd className="tabular font-semibold">{ma.length ? `${fmt(ma[ma.length - 1].average, { decimals: 1 })} kg` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Weekly change</dt>
                  <dd className="tabular font-semibold">
                    {weekChange ? <Delta value={weekChange.change} unit="kg" /> : <span className="font-normal text-faint">Needs 2+ weigh-ins per week</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">90-day trend</dt>
                  <dd className="tabular font-semibold">
                    {trend ? <Delta value={trend.kgPerWeek} unit="kg/wk" /> : <span className="font-normal text-faint">Not enough data</span>}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11.5px] text-faint">Day-to-day changes mostly reflect water and food volume, not fat or muscle.</p>
            </>
          ) : (
            <EmptyState title="No weigh-ins yet" body="Log your weight to start a trend." action={{ label: "Log weight", onClick: () => setWeightOpen(true) }} />
          )}
        </CardBody>
      </Card>
    ),
    meals: (
      <Card className="lg:col-span-2">
        <CardHeader
          title={date === today ? "Today's meals" : `Meals on ${formatDay(date, "d MMM")}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setFoodOpen(true); }}>
              <Plus /> Add
            </Button>
          }
        />
        <CardBody>
          {food.length ? (
            <MealTimeline entries={food} onSelect={(e) => { setEditing(e); setFoodOpen(true); }} />
          ) : (
            <EmptyState
              icon={<ClipboardPaste />}
              title="No meals logged for this day"
              body="Paste your daily Gemini report to fill in meals, totals and Apple Watch activity at once."
              action={{ label: "Import a report", href: "/import/" }}
            />
          )}
        </CardBody>
      </Card>
    ),
    insights: observations.length ? (
      <Card className="lg:col-span-2">
        <CardHeader title="Observations" description="Calculated from your stored records" action={<Link href="/progress/" className="text-[12.5px] font-medium text-accent-text hover:underline">All insights</Link>} />
        <CardBody>
          <ul className="space-y-2">
            {observations.map((o) => (
              <li key={o.id} className="flex gap-2.5 text-[14px]">
                <Lightbulb className={cn("mt-0.5 size-4 shrink-0", o.tone === "attention" ? "text-warn" : o.tone === "positive" ? "text-good" : "text-faint")} aria-hidden />
                {o.text}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    ) : null,
  };

  return (
    <div>
      {/* Hero: the day's headline numbers */}
      <section className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13.5px] text-muted">{formatDay(date, "EEEE, d MMMM yyyy")}</p>
          <h1 className="mt-1 font-display text-[44px] font-semibold leading-none tracking-tight sm:text-[56px]">
            <span className="tabular">{fmt(day.totals.calories)}</span>
            <span className="ml-2 text-[18px] font-medium text-muted sm:text-[20px]">kcal eaten</span>
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            {g ? (
              remaining !== null ? (
                remaining >= 0 ? (
                  <>
                    <span className="tabular font-semibold text-text">{fmt(remaining)}</span> kcal remaining of {fmt(g.calories)}
                  </>
                ) : (
                  <>
                    <span className="tabular font-semibold text-text">{fmt(-remaining)}</span> kcal above the {fmt(g.calories)} target
                  </>
                )
              ) : (
                `Target ${fmt(g.calories)} kcal`
              )
            ) : null}
            {g && day.totals.protein !== null ? (
              <>
                {" "}and <span className="tabular font-semibold text-text">{fmt(day.totals.protein, { decimals: 1 })} g</span> protein of {g.protein} g
              </>
            ) : null}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Segmented
            label="Dashboard range"
            value={range}
            onChange={(v) => void updateSettings({ dashboardRangeDays: v })}
            options={[
              { value: 7, label: "7 days" },
              { value: 14, label: "14 days" },
              { value: 30, label: "30 days" },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => setCustomize(true)}>
            <Settings2 /> Customize
          </Button>
          <Button variant="primary" size="sm" asChild>
            <Link href="/import/">
              <ClipboardPaste /> Import report
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {widgets
          .filter((w) => w.visible)
          .map((w) => (blocks[w.id] ? <React.Fragment key={w.id}>{blocks[w.id]}</React.Fragment> : null))}
      </div>

      <FoodEntryDialog open={foodOpen} onOpenChange={setFoodOpen} entry={editing} date={date} />
      <ActivityDialog open={actOpen} onOpenChange={setActOpen} date={date} entry={activity} />
      <WeightDialog open={weightOpen} onOpenChange={setWeightOpen} date={date} />

      <Dialog open={customize} onOpenChange={setCustomize}>
        <DialogContent title="Customize overview" description="Show, hide and reorder sections. Saved on this device.">
          <ul className="space-y-1.5">
            {widgets.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2">
                <span className={cn("text-[14px]", !w.visible && "text-faint")}>{WIDGET_LABEL[w.id]}</span>
                <span className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Move ${WIDGET_LABEL[w.id]} up`} disabled={i === 0} onClick={() => void updateSettings({ dashboardWidgets: move(widgets, i, -1) })}>
                    <ChevronUp />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Move ${WIDGET_LABEL[w.id]} down`} disabled={i === widgets.length - 1} onClick={() => void updateSettings({ dashboardWidgets: move(widgets, i, 1) })}>
                    <ChevronDown />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={w.visible ? `Hide ${WIDGET_LABEL[w.id]}` : `Show ${WIDGET_LABEL[w.id]}`}
                    aria-pressed={w.visible}
                    onClick={() => void updateSettings({ dashboardWidgets: widgets.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)) })}
                  >
                    {w.visible ? <Eye /> : <EyeOff />}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const out = [...arr];
  const j = i + dir;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function WeightSpark({ data }: { data: { date: string; weightKg: number; average: number }[] }) {
  if (data.length < 2) return null;
  const vals = data.flatMap((d) => [d.weightKg, d.average]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return (
    <ChartFrame height={56} className="max-w-[160px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[min - 0.3, max + 0.3]} />
          <Tooltip
            content={(p) => (
              <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => formatDay(String(l), "d MMM")} valueFormatter={(v) => `${Number(v).toFixed(1)} kg`} />
            )}
          />
          <Line dataKey="weightKg" name="Weigh-in" stroke="var(--c-body)" strokeOpacity={0.35} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="average" name="7-day avg" stroke="var(--c-body)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
