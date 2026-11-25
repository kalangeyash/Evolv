"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NutrientKey } from "@/lib/db/types";
import { NUTRIENT_KEYS } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import { useFoodRange, useGoals, useOverridesRange, useSettings } from "@/hooks/use-data";
import { goalsForDate } from "@/lib/analytics/goals";
import { averageFoodScore, consecutiveBelowTarget, macroEnergyShare, mealBreakdown, nutritionSeries, periodNutrition, type DayNutrition } from "@/lib/analytics/nutrition";
import { mean, stdev } from "@/lib/analytics/stats";
import { formatDay, monthBounds, shiftDate, weekBounds } from "@/lib/utils/dates";
import { MEAL_LABELS, NUTRIENT_LABELS, NUTRIENT_UNITS, fmt } from "@/lib/utils/format";
import { addMonths } from "date-fns";
import { fromISODate, toISODate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, EstimateBadge, LoadingBlock } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stat } from "@/components/ui/stat";
import { ChartFrame, ChartTooltip, Legend } from "@/components/ui/chart";
import { DailyBars } from "@/components/charts/daily-bars";
import { NUTRIENT_COLOR, NutrientProgressList } from "@/components/food/nutrient-progress";

type Mode = "day" | "week" | "month";

export function NutritionView() {
  const selected = useUI((s) => s.selectedDate);
  const [mode, setMode] = React.useState<Mode>("week");
  const [anchor, setAnchor] = React.useState(selected);
  React.useEffect(() => setAnchor(selected), [selected]);

  const { start, end } = mode === "day" ? { start: anchor, end: anchor } : mode === "week" ? weekBounds(anchor) : monthBounds(anchor);
  // Extra history for streaks and 7-day averages.
  const histStart = shiftDate(start, -60);
  const food = useFoodRange(histStart, end);
  const overrides = useOverridesRange(histStart, end);
  const goals = useGoals();
  const settings = useSettings();

  const step = (dir: -1 | 1) => {
    if (mode === "day") setAnchor(shiftDate(anchor, dir));
    else if (mode === "week") setAnchor(shiftDate(anchor, dir * 7));
    else setAnchor(toISODate(addMonths(fromISODate(anchor), dir)));
  };

  return (
    <div>
      <PageHeader title="Nutrition" description="Averages count logged days only. Days with no food log are shown as gaps, never as zero intake." />
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="day">Daily</TabsTrigger>
            <TabsTrigger value="week">Weekly</TabsTrigger>
            <TabsTrigger value="month">Monthly</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous period" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-44 text-center text-[13.5px] font-medium">
              {mode === "day" ? formatDay(start, "EEE, d MMM yyyy") : mode === "week" ? `${formatDay(start, "d MMM")} – ${formatDay(end, "d MMM yyyy")}` : formatDay(start, "MMMM yyyy")}
            </span>
            <Button size="icon" variant="ghost" aria-label="Next period" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        {!food || !overrides || !goals || !settings ? (
          <LoadingBlock />
        ) : (
          <NutritionBody mode={mode} start={start} end={end} history={nutritionSeries(histStart, end, food, overrides)} food={food.filter((f) => f.date >= start && f.date <= end)} goals={goals} tol={settings.calorieTolerancePct} />
        )}
        <TabsContent value="day" />
        <TabsContent value="week" />
        <TabsContent value="month" />
      </Tabs>
    </div>
  );
}

function NutritionBody({
  mode,
  start,
  end,
  history,
  food,
  goals,
  tol,
}: {
  mode: Mode;
  start: string;
  end: string;
  history: DayNutrition[];
  food: import("@/lib/db/types").FoodEntry[];
  goals: import("@/lib/db/types").GoalVersion[];
  tol: number;
}) {
  const series = history.filter((d) => d.date >= start && d.date <= end);
  const period = periodNutrition(series, goals, tol);
  const g = goalsForDate(goals, end);

  if (mode === "day") {
    const d = series[0];
    const share = macroEnergyShare(d.totals);
    const meals = mealBreakdown(food);
    if (!d.logged) return <EmptyState title="Nothing logged for this day" action={{ label: "Import a report", href: "/import/" }} />;
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Targets" />
          <CardBody>{g ? <NutrientProgressList totals={d.totals} targets={g} missing={d.missing} tolerance={tol} compact /> : null}</CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Energy from macros" description="Share of macro-derived energy (protein×4, carbs×4, fat×9)" action={<EstimateBadge />} />
            <CardBody>
              {share ? (
                <>
                  <MacroShareBar share={share} />
                  <p className="mt-3 text-[12px] text-faint tabular">
                    Macro-derived {fmt(share.derivedKcal)} kcal vs {fmt(d.totals.calories)} kcal recorded. Differences come from rounding, fiber and alcohol.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-muted">Needs protein, carbs and fat values.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Meal distribution" />
            <CardBody>
              <MealTable meals={meals} total={d.totals.calories} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  if (!period.loggedDays) return <EmptyState title="No food logged in this period" body="Import daily reports to see weekly and monthly analytics." action={{ label: "Import a report", href: "/import/" }} />;

  const proteinStreak = consecutiveBelowTarget(history.filter((d) => d.date <= end), "protein", goals, tol);
  const fiberStreak = consecutiveBelowTarget(history.filter((d) => d.date <= end), "fiber", goals, tol);
  const last7 = history.filter((d) => d.date > shiftDate(end, -7) && d.date <= end);
  const fiber7 = mean(last7.filter((d) => d.logged).map((d) => d.totals.fiber));
  const proteinValues = series.filter((d) => d.logged && d.totals.protein !== null).map((d) => d.totals.protein!);
  const proteinSd = stdev(proteinValues);
  const meals = mealBreakdown(food);
  const score = averageFoodScore(food);
  const bars = (k: NutrientKey) => series.map((d) => ({ date: d.date, value: d.logged ? d.totals[k] : null, partial: d.missing[k] > 0 }));
  const met = (k: NutrientKey) => `${period.targetMetDays[k].met} of ${period.targetMetDays[k].of} logged days`;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-2 gap-5 pt-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Days logged" value={`${period.loggedDays}`} unit={`of ${period.days}`} />
          {NUTRIENT_KEYS.map((k) => (
            <Stat key={k} label={`Avg ${NUTRIENT_LABELS[k].toLowerCase()}`} accent={NUTRIENT_COLOR[k]} value={fmt(period.averages[k], { decimals: k === "calories" ? 0 : 1 })} unit={NUTRIENT_UNITS[k]} sub={`Target met: ${met(k)}`} />
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calories" description={g ? `Target ${fmt(g.calories)} kcal (dashed); within range is ±${tol}%` : undefined} />
          <CardBody>
            <DailyBars data={bars("calories")} color={NUTRIENT_COLOR.calories} unit="kcal" target={g?.calories} name="Calories" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Protein" description={g ? `Target ${g.protein} g (dashed)` : undefined} />
          <CardBody>
            <DailyBars data={bars("protein")} color={NUTRIENT_COLOR.protein} unit="g" target={g?.protein} name="Protein" decimals={1} />
          </CardBody>
        </Card>
      </div>

      {mode === "month" ? <MacroTrend series={series} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Protein" description="Consistency and distribution" />
          <CardBody className="space-y-3 text-[13.5px]">
            <Row label="Average per logged day" value={`${fmt(period.averages.protein, { decimals: 1 })} g`} />
            <Row label="Target reached (≥95%)" value={met("protein")} />
            <Row label="Day-to-day variation" value={proteinSd !== null && proteinValues.length >= 3 ? `±${fmt(proteinSd, { decimals: 1 })} g` : "Needs 3+ days"} />
            <Row label="Highest day" value={period.highest.protein ? `${fmt(period.highest.protein.totals.protein, { decimals: 1 })} g, ${formatDay(period.highest.protein.date, "d MMM")}` : "—"} />
            <Row label="Lowest day" value={period.lowest.protein ? `${fmt(period.lowest.protein.totals.protein, { decimals: 1 })} g, ${formatDay(period.lowest.protein.date, "d MMM")}` : "—"} />
            <Row label="Consecutive logged days below" value={proteinStreak.count ? `${proteinStreak.count}` : "None"} />
            {g && period.averages.protein !== null && period.averages.protein < g.protein * 0.95 ? (
              <p className="rounded-[10px] bg-surface-2 p-3 text-[12.5px] text-muted">
                Opportunity: about {fmt(g.protein - period.averages.protein, { decimals: 0 })} g more per day reaches target. One serving of paneer (100 g), two eggs plus curd, or a whey scoop each add roughly 15–25 g.
              </p>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Fiber" />
          <CardBody className="space-y-3 text-[13.5px]">
            <Row label="Average per logged day" value={`${fmt(period.averages.fiber, { decimals: 1 })} g`} />
            <Row label="Last 7 days average" value={fiber7 !== null ? `${fmt(fiber7, { decimals: 1 })} g` : "—"} />
            <Row label="Target reached (≥95%)" value={met("fiber")} />
            <Row label="Consecutive logged days below" value={fiberStreak.count ? `${fiberStreak.count}` : "None"} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Calories" />
          <CardBody className="space-y-3 text-[13.5px]">
            <Row label="Average intake" value={`${fmt(period.averages.calories)} kcal`} />
            <Row label="Versus target" value={g && period.averages.calories !== null ? `${period.averages.calories - g.calories >= 0 ? "+" : "−"}${fmt(Math.abs(period.averages.calories - g.calories))} kcal` : "—"} />
            <Row label="Within target range" value={met("calories")} />
            <Row label="Highest day" value={period.highest.calories ? `${fmt(period.highest.calories.totals.calories)} kcal, ${formatDay(period.highest.calories.date, "d MMM")}` : "—"} />
            <Row label="Lowest day" value={period.lowest.calories ? `${fmt(period.lowest.calories.totals.calories)} kcal, ${formatDay(period.lowest.calories.date, "d MMM")}` : "—"} />
            <Link href="/progress/?tab=energy" className="inline-block text-[12.5px] font-medium text-accent-text hover:underline">
              Estimated energy balance
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Macro distribution" description="Average grams, % of target, and share of macro energy" action={<EstimateBadge label="Rounded estimates" />} />
          <CardBody>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="py-2 font-medium">Macro</th>
                  <th className="py-2 text-right font-medium">Avg g</th>
                  <th className="py-2 text-right font-medium">% of target</th>
                  <th className="py-2 text-right font-medium">% of energy</th>
                </tr>
              </thead>
              <tbody>
                {(["protein", "carbs", "fat"] as const).map((k) => {
                  const s = macroEnergyShare(period.averages);
                  return (
                    <tr key={k} className="border-b border-line/60">
                      <td className="py-2">
                        <span className="mr-2 inline-block size-2 rounded-full" style={{ background: NUTRIENT_COLOR[k] }} />
                        {NUTRIENT_LABELS[k]}
                      </td>
                      <td className="tabular py-2 text-right">{fmt(period.averages[k], { decimals: 1 })}</td>
                      <td className="tabular py-2 text-right">{g && period.averages[k] !== null ? `${Math.round((period.averages[k]! / g[k]) * 100)}%` : "—"}</td>
                      <td className="tabular py-2 text-right">{s ? `${Math.round(s[k])}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {score !== null ? <p className="mt-3 text-[12.5px] text-muted">Average food quality score: {score}/10 (as rated in your reports)</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Meal composition" description="Totals across the period" />
          <CardBody>
            <MealTable meals={meals} total={meals.reduce((a, m) => a + (m.totals.calories ?? 0), 0)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right font-medium">{value}</span>
    </div>
  );
}

function MacroShareBar({ share }: { share: { protein: number; carbs: number; fat: number } }) {
  const parts = (["protein", "carbs", "fat"] as const).map((k) => ({ k, v: share[k] }));
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${NUTRIENT_LABELS[p.k]} ${Math.round(p.v)}%`).join(", ")}>
        {parts.map((p) => (
          <span key={p.k} style={{ width: `${p.v}%`, background: NUTRIENT_COLOR[p.k] }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 text-[13px]">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: NUTRIENT_COLOR[p.k] }} />
            <span className="text-muted">{NUTRIENT_LABELS[p.k]}</span>
            <span className="tabular font-semibold">{Math.round(p.v)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MealTable({ meals, total }: { meals: ReturnType<typeof mealBreakdown>; total: number | null }) {
  if (!meals.length) return <p className="text-[13px] text-muted">No meals.</p>;
  return (
    <table className="w-full text-[13.5px]">
      <thead>
        <tr className="border-b border-line text-left text-[12px] text-muted">
          <th className="py-2 font-medium">Meal</th>
          <th className="py-2 text-right font-medium">kcal</th>
          <th className="py-2 text-right font-medium">Share</th>
          <th className="py-2 text-right font-medium">Protein</th>
        </tr>
      </thead>
      <tbody>
        {meals.map((m) => (
          <tr key={m.category} className="border-b border-line/60">
            <td className="py-2">{MEAL_LABELS[m.category]}</td>
            <td className="tabular py-2 text-right">{fmt(m.totals.calories)}</td>
            <td className="tabular py-2 text-right">{total && m.totals.calories !== null ? `${Math.round((m.totals.calories / total) * 100)}%` : "—"}</td>
            <td className="tabular py-2 text-right">{fmt(m.totals.protein, { decimals: 1 })} g</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MacroTrend({ series }: { series: DayNutrition[] }) {
  const data = series.map((d) => ({
    date: d.date,
    protein: d.logged ? d.totals.protein : null,
    carbs: d.logged ? d.totals.carbs : null,
    fat: d.logged ? d.totals.fat : null,
    fiber: d.logged ? d.totals.fiber : null,
  }));
  const keys = ["protein", "carbs", "fat", "fiber"] as const;
  return (
    <Card>
      <CardHeader title="Macro trends" description="Grams per logged day; gaps are unlogged days" />
      <CardBody>
        <ChartFrame height={240}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(d) => formatDay(d, "d")} interval={2} />
              <YAxis axisLine={false} tickLine={false} width={44} />
              <Tooltip content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} labelFormatter={(l) => formatDay(String(l), "EEE, d MMM")} valueFormatter={(v) => (v === null || v === undefined ? "Not logged" : `${fmt(Number(v), { decimals: 1 })} g`)} />} />
              {keys.map((k) => (
                <Line key={k} dataKey={k} name={NUTRIENT_LABELS[k]} stroke={NUTRIENT_COLOR[k]} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: NUTRIENT_COLOR[k] }} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
        <Legend className="mt-2" items={keys.map((k) => ({ label: NUTRIENT_LABELS[k], color: NUTRIENT_COLOR[k] }))} />
        <p className="mt-2 text-[12px] text-faint">
          Consistency: {series.filter((d) => d.logged).length} of {series.length} days logged
        </p>
      </CardBody>
    </Card>
  );
}
