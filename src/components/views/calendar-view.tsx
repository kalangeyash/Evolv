"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { useUI } from "@/stores/ui-store";
import { useActivityRange, useFoodRange, useGoals, useImports, useOverridesRange, useSettings, useWeights, useWorkoutData } from "@/hooks/use-data";
import { goalsForDate, targetMet } from "@/lib/analytics/goals";
import { nutritionSeries } from "@/lib/analytics/nutrition";
import { WEEK_OPTIONS, dateRange, formatDay, fromISODate, todayISO, toISODate } from "@/lib/utils/dates";
import { fmt, MEAL_LABELS } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";

const FLAGS = [
  { key: "imported", label: "Report imported", short: "I" },
  { key: "calories", label: "Calories tracked", short: "C" },
  { key: "protein", label: "Protein target met", short: "P" },
  { key: "fiber", label: "Fiber target met", short: "F" },
  { key: "activity", label: "Activity logged", short: "A" },
  { key: "workout", label: "Workout logged", short: "W" },
  { key: "weight", label: "Weight recorded", short: "Kg" },
] as const;
type FlagKey = (typeof FLAGS)[number]["key"];
/** Heatmap steps (% of --heat mixed into the surface), light → dark. */
const HEAT = [18, 36, 58];

export function CalendarView() {
  const router = useRouter();
  const selected = useUI((s) => s.selectedDate);
  const setDate = useUI((s) => s.setSelectedDate);
  const [month, setMonth] = React.useState(() => toISODate(startOfMonth(fromISODate(selected))));
  const gridStart = toISODate(startOfWeek(fromISODate(month), WEEK_OPTIONS));
  const gridEnd = toISODate(endOfWeek(endOfMonth(fromISODate(month)), WEEK_OPTIONS));
  const food = useFoodRange(gridStart, gridEnd);
  const overrides = useOverridesRange(gridStart, gridEnd);
  const activity = useActivityRange(gridStart, gridEnd);
  const goals = useGoals();
  const settings = useSettings();
  const weights = useWeights();
  const workouts = useWorkoutData();
  const imports = useImports();

  if (!food || !overrides || !activity || !goals || !settings || !weights || !workouts || !imports) return <LoadingBlock />;

  const series = new Map(nutritionSeries(gridStart, gridEnd, food, overrides).map((d) => [d.date, d]));
  const actDates = new Set(activity.map((a) => a.date));
  const wDates = new Set(weights.map((w) => w.date));
  const sDates = new Set(workouts.sessions.map((s) => s.date));
  const iDates = new Set(imports.filter((i) => i.status === "active").map((i) => i.date));
  const flagsFor = (d: string): Record<FlagKey, boolean | null> => {
    const n = series.get(d);
    const g = goalsForDate(goals, d);
    return {
      imported: iDates.has(d),
      calories: !!n?.logged && n.totals.calories !== null,
      protein: n?.logged ? targetMet("protein", n.totals.protein, g?.protein ?? null, settings.calorieTolerancePct) : null,
      fiber: n?.logged ? targetMet("fiber", n.totals.fiber, g?.fiber ?? null, settings.calorieTolerancePct) : null,
      activity: actDates.has(d),
      workout: sDates.has(d),
      weight: wDates.has(d),
    };
  };
  const today = todayISO();
  const days = dateRange(gridStart, gridEnd);

  return (
    <div>
      <PageHeader title="Calendar" description="Your health journal by day. Shading shows how complete each day's log is; empty days are shown as missing, not as zero." />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title={formatDay(month, "MMMM yyyy")}
            action={
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(toISODate(addMonths(fromISODate(month), -1)))}>
                  <ChevronLeft />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMonth(toISODate(startOfMonth(new Date())))}>
                  This month
                </Button>
                <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(toISODate(addMonths(fromISODate(month), 1)))}>
                  <ChevronRight />
                </Button>
              </div>
            }
          />
          <CardBody>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] text-faint" aria-hidden>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div role="grid" aria-label={`Calendar for ${formatDay(month, "MMMM yyyy")}`} className="mt-1.5 grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const f = flagsFor(d);
                const count = FLAGS.filter((x) => f[x.key] === true).length;
                const any = f.calories || f.activity || f.weight || f.workout;
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : 3;
                const bg = ["transparent", ...HEAT.map((p) => `color-mix(in oklab, var(--heat) ${p}%, var(--surface))`)][level];
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={d === selected}
                    aria-label={`${formatDay(d, "EEEE d MMMM")}: ${any ? FLAGS.filter((x) => f[x.key]).map((x) => x.label).join(", ") || "partially logged" : "nothing logged"}`}
                    onClick={() => setDate(d)}
                    className={cn(
                      "relative flex aspect-square min-h-12 flex-col items-start justify-between rounded-[10px] border p-1.5 text-left transition-colors sm:p-2",
                      any ? "border-transparent" : "border-dashed border-line",
                      !inMonth && "opacity-40",
                      d === selected && "ring-2 ring-accent-text",
                    )}
                    style={{ background: bg }}
                  >
                    <span className={cn("tabular text-[12px] font-medium sm:text-[13px]", d === today ? "rounded-full bg-text px-1.5 text-bg" : level >= 3 ? "text-text" : "text-muted")}>{Number(d.slice(8))}</span>
                    <span className="hidden flex-wrap gap-0.5 sm:flex" aria-hidden>
                      {FLAGS.filter((x) => f[x.key] === true).map((x) => (
                        <span key={x.key} className="rounded bg-surface/70 px-1 text-[9.5px] font-semibold leading-[14px] text-text">
                          {x.short}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-dashed border-line" /> Missing
              </span>
              {[1, 2, 3].map((l) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="size-3 rounded" style={{ background: `color-mix(in oklab, var(--heat) ${HEAT[l - 1]}%, var(--surface))` }} />
                  {["1–2 signals", "3–4 signals", "5+ signals"][l - 1]}
                </span>
              ))}
              <span className="text-faint">{FLAGS.map((x) => `${x.short} ${x.label.toLowerCase()}`).join(", ")}</span>
            </div>
          </CardBody>
        </Card>
        <DayPanel date={selected} flags={flagsFor(selected)} food={food.filter((f) => f.date === selected)} onOpen={(href) => router.push(href)} series={series.get(selected)} workouts={workouts.sessions.filter((s) => s.date === selected)} weight={weights.filter((w) => w.date === selected)} activity={activity.find((a) => a.date === selected) ?? null} />
      </div>
    </div>
  );
}

function DayPanel({ date, flags, food, series, workouts, weight, activity, onOpen }: {
  date: string;
  flags: Record<FlagKey, boolean | null>;
  food: import("@/lib/db/types").FoodEntry[];
  series: ReturnType<typeof nutritionSeries>[number] | undefined;
  workouts: import("@/lib/db/types").WorkoutSession[];
  weight: import("@/lib/db/types").WeightEntry[];
  activity: import("@/lib/db/types").ActivityEntry | null;
  onOpen: (href: string) => void;
}) {
  return (
    <Card className="xl:sticky xl:top-24 xl:self-start">
      <CardHeader title={formatDay(date, "EEEE, d MMMM yyyy")} description={date > todayISO() ? "Future date" : undefined} />
      <CardBody className="space-y-4 text-[13.5px]">
        <ul className="grid grid-cols-2 gap-1.5">
          {FLAGS.map((x) => (
            <li key={x.key} className={cn("rounded-md px-2 py-1 text-[12px]", flags[x.key] ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent-text" : "bg-surface-2 text-faint")}>
              {flags[x.key] ? "✓ " : flags[x.key] === false ? "✗ " : "– "}
              {x.label}
            </li>
          ))}
        </ul>
        {series?.logged ? (
          <div>
            <p className="font-medium">
              {fmt(series.totals.calories)} kcal, {fmt(series.totals.protein, { decimals: 1 })} g protein
            </p>
            <ul className="mt-2 space-y-1 text-muted">
              {food
                .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"))
                .map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {MEAL_LABELS[f.mealCategory]}: {f.mealName}
                    </span>
                    <span className="tabular shrink-0">{fmt(f.calories)}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">No food logged.</p>
        )}
        {activity ? (
          <p className="text-muted">
            Activity: {fmt(activity.steps)} steps, {fmt(activity.exerciseMinutes)} exercise min, {fmt(activity.moveCalories)} move kcal
          </p>
        ) : null}
        {weight.length ? <p className="text-muted">Weight: {weight.map((w) => `${w.weightKg} kg`).join(", ")}</p> : null}
        {workouts.length ? <p className="text-muted">Workouts: {workouts.map((w) => w.name).join(", ")}</p> : null}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button size="sm" variant="primary" onClick={() => onOpen("/journal/")}>
            Open journal
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpen("/")}>
            Overview
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpen("/import/")}>
            Import report
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
