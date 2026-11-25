"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { addMonths } from "date-fns";
import type { NutrientKey } from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import { useActivityRange, useFoodRange, useGoals, useImports, useMeasurements, useOverridesRange, useSettings, useWeights, useWorkoutData } from "@/hooks/use-data";
import { goalsForDate } from "@/lib/analytics/goals";
import { averageFoodScore, macroEnergyShare, nutritionSeries, periodNutrition } from "@/lib/analytics/nutrition";
import { activitySeries, summarizeActivity } from "@/lib/analytics/activity";
import { dailyWeights, measurementChanges, weightTrendPerWeek } from "@/lib/analytics/body";
import { exerciseRecords, totalReps, volumeOf } from "@/lib/analytics/workouts";
import { generateInsights } from "@/lib/analytics/insights";
import { mean } from "@/lib/analytics/stats";
import { formatDay, fromISODate, monthBounds, shiftDate, toISODate, weekBounds } from "@/lib/utils/dates";
import { NUTRIENT_LABELS, NUTRIENT_UNITS, fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/segmented";
import { EvolvMark } from "@/components/layout/brand";
import { DailyBars } from "@/components/charts/daily-bars";
import { NUTRIENT_COLOR } from "@/components/food/nutrient-progress";
import { MEASUREMENT_LABEL } from "@/lib/utils/format";

type Kind = "week" | "month";

export function ReportsView() {
  const selected = useUI((s) => s.selectedDate);
  const [kind, setKind] = React.useState<Kind>("week");
  const [anchor, setAnchor] = React.useState(selected);
  const { start, end } = kind === "week" ? weekBounds(anchor) : monthBounds(anchor);
  const histStart = shiftDate(start, -60);
  const food = useFoodRange(histStart, end);
  const overrides = useOverridesRange(histStart, end);
  const activity = useActivityRange(histStart, end);
  const goals = useGoals();
  const settings = useSettings();
  const weights = useWeights();
  const measurements = useMeasurements();
  const workouts = useWorkoutData();
  const imports = useImports();

  const step = (dir: -1 | 1) => setAnchor(kind === "week" ? shiftDate(anchor, dir * 7) : toISODate(addMonths(fromISODate(anchor), dir)));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="A printable summary of a week or month. Use Print to save it as a PDF."
        actions={
          <>
            <Segmented label="Report type" value={kind} onChange={setKind} options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
            <Button size="icon" variant="ghost" aria-label="Previous period" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Next period" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer /> Print or save PDF
            </Button>
          </>
        }
      />
      {!food || !overrides || !activity || !goals || !settings || !weights || !measurements || !workouts || !imports ? (
        <LoadingBlock />
      ) : (
        <Report
          kind={kind}
          start={start}
          end={end}
          data={{ food, overrides, activity, goals, tol: settings.calorieTolerancePct, weights, measurements, workouts, imports, histStart }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line py-5">
      <h2 className="mb-3 font-display text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="tabular text-[15px] font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Report({ kind, start, end, data }: {
  kind: Kind;
  start: string;
  end: string;
  data: {
    food: import("@/lib/db/types").FoodEntry[];
    overrides: import("@/lib/db/types").DailyNutritionSummary[];
    activity: import("@/lib/db/types").ActivityEntry[];
    goals: import("@/lib/db/types").GoalVersion[];
    tol: number;
    weights: import("@/lib/db/types").WeightEntry[];
    measurements: import("@/lib/db/types").BodyMeasurement[];
    workouts: NonNullable<ReturnType<typeof useWorkoutData>>;
    imports: import("@/lib/db/types").DailyImport[];
    histStart: string;
  };
}) {
  const history = nutritionSeries(data.histStart, end, data.food, data.overrides);
  const series = history.filter((d) => d.date >= start);
  const p = periodNutrition(series, data.goals, data.tol);
  const g = goalsForDate(data.goals, end);
  const periodFood = data.food.filter((f) => f.date >= start && f.date <= end);
  const act = summarizeActivity(activitySeries(start, end, data.activity.filter((a) => a.date >= start), data.goals));
  const sessions = data.workouts.sessions.filter((s) => s.date >= start && s.date <= end);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const sets = data.workouts.sets.filter((s) => sessionIds.has(s.sessionId));
  const daily = dailyWeights(data.weights);
  const inPeriod = daily.filter((d) => d.date >= start && d.date <= end);
  const prevAvg = mean(daily.filter((d) => d.date >= shiftDate(start, kind === "week" ? -7 : -30) && d.date < start).map((d) => d.weightKg));
  const curAvg = mean(inPeriod.map((d) => d.weightKg));
  const trend = weightTrendPerWeek(inPeriod);
  const meas = measurementChanges(data.measurements.filter((m) => m.date >= start && m.date <= end));
  const records = exerciseRecords(sessions, data.workouts.exercises, sets);
  const insights = generateInsights({
    today: end,
    nutrition: history,
    food: data.food,
    goals: data.goals,
    activity: data.activity,
    weights: daily,
    measurements: data.measurements,
    sessions: data.workouts.sessions,
    exercises: data.workouts.exercises,
    sets: data.workouts.sets,
    calorieTolerancePct: data.tol,
  });
  const imported = new Set(data.imports.filter((i) => i.status === "active" && i.date >= start && i.date <= end).map((i) => i.date)).size;
  const manualFood = periodFood.filter((f) => f.source === "manual").length;
  const corrected = periodFood.filter((f) => f.corrected).length;
  const share = macroEnergyShare(p.averages);
  const met = (k: NutrientKey) => (p.targetMetDays[k].of ? `${p.targetMetDays[k].met}/${p.targetMetDays[k].of}` : "—");

  return (
    <article className="rounded-[var(--radius-lg)] border border-line bg-surface px-5 py-6 sm:px-8 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div className="flex items-center gap-3">
          <EvolvMark className="size-10" />
          <div>
            <p className="text-[12.5px] text-muted">EVOLV {kind === "week" ? "weekly" : "monthly"} report</p>
            <h2 className="font-display text-[24px] font-semibold leading-tight">
              {kind === "week" ? `${formatDay(start, "d MMM")} – ${formatDay(end, "d MMM yyyy")}` : formatDay(start, "MMMM yyyy")}
            </h2>
          </div>
        </div>
        <p className="max-w-xs text-right text-[12px] text-muted">
          Generated {formatDay(toISODate(new Date()), "d MMM yyyy")}. Data: {p.loggedDays} of {p.days} days with food logs ({imported} imported reports, {manualFood} manual entries, {corrected} corrected).
        </p>
      </header>

      <Section title="Nutrition">
        <KV
          items={[
            ...NUTRIENT_KEYS.map((k) => [`Avg ${NUTRIENT_LABELS[k].toLowerCase()}`, `${fmt(p.averages[k], { decimals: k === "calories" ? 0 : 1 })} ${NUTRIENT_UNITS[k]}`] as [string, React.ReactNode]),
            ["Calorie target met", `${met("calories")} days`],
            ["Protein target met", `${met("protein")} days`],
            ["Fiber target met", `${met("fiber")} days`],
          ]}
        />
        <div className="mt-4 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <p>
            Best protein day: {p.highest.protein ? `${formatDay(p.highest.protein.date, "EEE d MMM")}, ${fmt(p.highest.protein.totals.protein, { decimals: 1 })} g` : "—"}
          </p>
          <p>
            Lowest protein day: {p.lowest.protein ? `${formatDay(p.lowest.protein.date, "EEE d MMM")}, ${fmt(p.lowest.protein.totals.protein, { decimals: 1 })} g` : "—"}
          </p>
          {share ? (
            <p>
              Energy split (estimate): protein {Math.round(share.protein)}%, carbs {Math.round(share.carbs)}%, fat {Math.round(share.fat)}%
            </p>
          ) : null}
          {averageFoodScore(periodFood) !== null ? <p>Average food score: {averageFoodScore(periodFood)}/10</p> : null}
          {g ? <p className="text-muted">Targets: {fmt(g.calories)} kcal, {g.protein} g protein, {g.carbs} g carbs, {g.fat} g fat, {g.fiber} g fiber</p> : null}
        </div>
        {p.loggedDays ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12.5px] text-muted">Daily calories</p>
              <DailyBars height={150} data={series.map((d) => ({ date: d.date, value: d.logged ? d.totals.calories : null }))} color={NUTRIENT_COLOR.calories} unit="kcal" target={g?.calories} name="Calories" />
            </div>
            <div>
              <p className="mb-1 text-[12.5px] text-muted">Daily protein</p>
              <DailyBars height={150} data={series.map((d) => ({ date: d.date, value: d.logged ? d.totals.protein : null }))} color={NUTRIENT_COLOR.protein} unit="g" target={g?.protein} name="Protein" decimals={1} />
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Activity and training">
        <KV
          items={[
            ["Avg steps", fmt(act.avgSteps)],
            ["Exercise minutes", fmt(act.totalExerciseMin)],
            ["Workout sessions", String(sessions.length)],
            ["Distance", `${fmt(act.totalDistanceKm, { decimals: 1 })} km`],
            ["Move goal met", act.moveGoalMet.of ? `${act.moveGoalMet.met}/${act.moveGoalMet.of} days` : "—"],
            ["Exercise goal met", act.exerciseGoalMet.of ? `${act.exerciseGoalMet.met}/${act.exerciseGoalMet.of} days` : "—"],
            ["Training volume", `${fmt(volumeOf(sets).volume)} kg`],
            ["Total reps", String(totalReps(sets))],
          ]}
        />
        <p className="mt-2 text-[12px] text-faint">Activity averages use the {act.daysWithData} days with Apple Watch data.</p>
        {records.length ? (
          <div className="mt-3 text-[13.5px]">
            <p className="mb-1 font-medium">Strength</p>
            <ul className="space-y-0.5 text-muted">
              {records.slice(0, 8).map((r) => (
                <li key={r.name}>
                  {r.name}: heaviest {r.maxWeight ? `${r.maxWeight.weightKg} kg × ${r.maxWeight.reps ?? "?"}` : "—"}
                  {r.bestE1RM ? `, est. 1RM ~${r.bestE1RM.value} kg (Epley, estimate)` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="Body">
        <KV
          items={[
            ["Average weight", curAvg !== null ? `${curAvg.toFixed(1)} kg` : "—"],
            ["Weigh-ins", String(inPeriod.length)],
            ["vs previous period", curAvg !== null && prevAvg !== null ? `${curAvg - prevAvg > 0 ? "+" : ""}${(curAvg - prevAvg).toFixed(2)} kg` : "—"],
            ["Trend", trend ? `${trend.kgPerWeek > 0 ? "+" : ""}${trend.kgPerWeek.toFixed(2)} kg/wk` : "Not enough data"],
          ]}
        />
        {meas.some((m) => m.count) ? (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px]">
            {meas.filter((m) => m.count).map((m) => (
              <li key={m.key}>
                {MEASUREMENT_LABEL[m.key]}: {m.latest?.value}
                {m.key === "bodyFatPct" ? "%" : " cm"}
                {m.change !== null ? ` (${m.change > 0 ? "+" : ""}${m.change.toFixed(1)})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted">No body measurements in this period.</p>
        )}
      </Section>

      <Section title="Key insights">
        {insights.length ? (
          <ul className="space-y-3 text-[13.5px]">
            {insights.slice(0, 6).map((i) => (
              <li key={i.id}>
                <p className="font-medium">{i.title}</p>
                <p className="text-muted">
                  {i.observation} {i.evidence}
                </p>
                <p className="text-[12.5px]">Next step: {i.action}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">Not enough data for insights in this period.</p>
        )}
      </Section>

      <footer className="border-t border-line pt-4 text-[11.5px] text-faint">
        Nutrition values are estimates from photo-based reports. Averages use logged days only. Estimated 1RM and energy figures are estimates, not measurements. Not medical advice.
      </footer>
    </article>
  );
}
