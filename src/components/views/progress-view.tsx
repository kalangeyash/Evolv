"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Lightbulb } from "lucide-react";
import { useUI } from "@/stores/ui-store";
import { useActivityRange, useFoodRange, useGoals, useImportsForDate, useMeasurements, useOverridesRange, useProfile, useSettings, useWeights, useWorkoutData } from "@/hooks/use-data";
import { updateProfile, ValidationError } from "@/lib/db/repos";
import { useAction } from "@/hooks/use-action";
import { dailyWeights, measurementChanges, weightTrendPerWeek } from "@/lib/analytics/body";
import { exerciseRecords } from "@/lib/analytics/workouts";
import { dayNutrition, nutritionSeries, periodNutrition } from "@/lib/analytics/nutrition";
import { generateInsights, type Insight } from "@/lib/analytics/insights";
import { CONFIDENCE_LABEL, energyBalance, formulaMaintenance, trendMaintenance, type Confidence, type MaintenanceEstimate } from "@/lib/analytics/energy";
import { mean } from "@/lib/analytics/stats";
import { formatDay, shiftDate } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, LoadingBlock } from "@/components/ui/feedback";
import { Field, Input, parseInputNumber } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";

export function ProgressView() {
  const [tab, setTab] = React.useState("recomp");
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "insights" || t === "energy" || t === "recomp") setTab(t);
  }, []);
  const date = useUI((s) => s.selectedDate);
  const start = shiftDate(date, -89);
  const food = useFoodRange(start, date);
  const overrides = useOverridesRange(start, date);
  const activity = useActivityRange(start, date);
  const goals = useGoals();
  const weights = useWeights();
  const measurements = useMeasurements();
  const workouts = useWorkoutData();
  const settings = useSettings();
  const profile = useProfile();

  return (
    <div>
      <PageHeader title="Progress" description="Several signals read together. No single number, especially scale weight, tells you whether you gained muscle or lost fat." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="recomp">Recomposition</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="energy">Energy balance</TabsTrigger>
        </TabsList>
        {!food || !overrides || !activity || !goals || !weights || !measurements || !workouts || !settings || !profile ? (
          <LoadingBlock />
        ) : (
          <>
            <TabsContent value="recomp">
              <Recomposition date={date} series={nutritionSeries(start, date, food, overrides)} goals={goals} weights={weights} measurements={measurements} workouts={workouts} tol={settings.calorieTolerancePct} />
            </TabsContent>
            <TabsContent value="insights">
              <InsightsList
                insights={generateInsights({
                  today: date,
                  nutrition: nutritionSeries(start, date, food, overrides),
                  food,
                  goals,
                  activity,
                  weights: dailyWeights(weights),
                  measurements,
                  sessions: workouts.sessions,
                  exercises: workouts.exercises,
                  sets: workouts.sets,
                  calorieTolerancePct: settings.calorieTolerancePct,
                })}
              />
            </TabsContent>
            <TabsContent value="energy">
              <EnergyBalance date={date} series={nutritionSeries(start, date, food, overrides)} weights={weights} profile={profile} food={food} overrides={overrides} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

type Status = "good" | "watch" | "neutral" | "none";
function Indicator({ title, status, value, detail }: { title: string; status: Status; value: string; detail: string }) {
  const Icon = status === "good" ? CheckCircle2 : status === "watch" ? AlertTriangle : status === "none" ? CircleDashed : Info;
  const label = status === "good" ? "Favourable" : status === "watch" ? "Worth watching" : status === "none" ? "Not enough data" : "Neutral";
  return (
    <Card>
      <CardBody className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] text-muted">{title}</p>
          <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-medium", status === "good" ? "text-good" : status === "watch" ? "text-warn" : "text-faint")}>
            <Icon className="size-3.5" aria-hidden />
            {label}
          </span>
        </div>
        <p className="mt-2 font-display text-[22px] font-semibold tabular">{value}</p>
        <p className="mt-1 text-[12.5px] text-muted">{detail}</p>
      </CardBody>
    </Card>
  );
}

function Recomposition({ date, series, goals, weights, measurements, workouts, tol }: {
  date: string;
  series: ReturnType<typeof nutritionSeries>;
  goals: import("@/lib/db/types").GoalVersion[];
  weights: import("@/lib/db/types").WeightEntry[];
  measurements: import("@/lib/db/types").BodyMeasurement[];
  workouts: NonNullable<ReturnType<typeof useWorkoutData>>;
  tol: number;
}) {
  const daily = dailyWeights(weights).filter((d) => d.date <= date);
  const trend = weightTrendPerWeek(daily.filter((d) => d.date > shiftDate(date, -28)));
  const waist = measurementChanges(measurements.filter((m) => m.date <= date && m.date > shiftDate(date, -84))).find((m) => m.key === "waistCm")!;
  const records = exerciseRecords(workouts.sessions.filter((s) => s.date <= date), workouts.exercises, workouts.sets);
  const strength = records
    .map((r) => {
      const pts = r.progression.filter((p) => p.bestE1RM !== null && p.date > shiftDate(date, -56));
      return pts.length >= 2 ? ((pts.at(-1)!.bestE1RM! - pts[0].bestE1RM!) / pts[0].bestE1RM!) * 100 : null;
    })
    .filter((x): x is number => x !== null);
  const up = strength.filter((x) => x >= 2).length;
  const down = strength.filter((x) => x <= -2).length;
  const sessions28 = workouts.sessions.filter((s) => s.date > shiftDate(date, -28) && s.date <= date).length;
  const last28 = series.filter((d) => d.date > shiftDate(date, -28));
  const p28 = periodNutrition(last28, goals, tol);

  const wStatus: Status = !trend ? "none" : Math.abs(trend.kgPerWeek) < 0.1 ? "neutral" : trend.kgPerWeek < 0 && trend.kgPerWeek >= -1 ? "good" : "watch";
  const waistStatus: Status = waist.change === null ? "none" : waist.change < -0.4 ? "good" : waist.change > 0.4 ? "watch" : "neutral";
  const sStatus: Status = !strength.length ? "none" : up > down ? "good" : down > up ? "watch" : "neutral";
  const cStatus: Status = sessions28 === 0 && !workouts.sessions.length ? "none" : sessions28 >= 8 ? "good" : sessions28 >= 4 ? "neutral" : "watch";
  const pm = p28.targetMetDays.protein;
  const nStatus: Status = pm.of < 5 ? "none" : pm.met / pm.of >= 0.7 ? "good" : pm.met / pm.of >= 0.4 ? "neutral" : "watch";

  let reading: string;
  if ([wStatus, waistStatus, sStatus].filter((s) => s === "none").length >= 2) {
    reading = "Not enough data yet to read these signals together. Regular weigh-ins, a waist measurement every one to two weeks, and logged strength sets will make this useful.";
  } else if (waistStatus === "good" && sStatus === "good") {
    reading = "Your waist is shrinking while strength is rising. That combination is consistent with recomposition, whatever the scale says.";
  } else if (wStatus === "neutral" && waistStatus === "good") {
    reading = "Weight is roughly stable while your waist is decreasing, which is consistent with losing fat while maintaining or gaining lean mass.";
  } else if (trend && trend.kgPerWeek < -0.1 && sStatus === "watch") {
    reading = "Weight is falling while strength is declining. This can happen when protein, sleep or recovery are limited; it is worth reviewing those before cutting further.";
  } else if (trend && trend.kgPerWeek > 0.1 && waistStatus === "watch") {
    reading = "Weight and waist are both rising, which more often reflects fat gain than muscle gain. Review average intake against your target.";
  } else {
    reading = "The signals are mixed or still settling. Keep logging; trends become clearer over four to eight weeks.";
  }

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Interpretation, not measurement">
        <p>{reading}</p>
        <p className="text-[12px] text-faint">EVOLV cannot measure muscle or fat directly. This reading combines the indicators below and is a prompt for reflection, not a diagnosis.</p>
      </Callout>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Indicator title="Weight trend (28 days)" status={wStatus} value={trend ? `${trend.kgPerWeek > 0 ? "+" : ""}${trend.kgPerWeek.toFixed(2)} kg/wk` : "—"} detail={trend ? `Fitted over ${trend.samples} weigh-ins` : "Needs 4+ weigh-ins over 10+ days"} />
        <Indicator title="Waist (12 weeks)" status={waistStatus} value={waist.change !== null ? `${waist.change > 0 ? "+" : ""}${waist.change.toFixed(1)} cm` : "—"} detail={waist.latest ? `Latest ${waist.latest.value} cm on ${formatDay(waist.latest.date, "d MMM")}` : "Add waist measurements in Body Analytics"} />
        <Indicator title="Strength (8 weeks)" status={sStatus} value={strength.length ? `${up} up, ${down} down` : "—"} detail={strength.length ? `Of ${strength.length} exercises with 2+ sessions (estimated 1RM, ±2%)` : "Log strength sets in Workouts"} />
        <Indicator title="Workout consistency (28 days)" status={cStatus} value={`${sessions28} sessions`} detail={`${(sessions28 / 4).toFixed(1)} per week`} />
        <Indicator title="Protein consistency (28 days)" status={nStatus} value={pm.of ? `${pm.met} of ${pm.of} days` : "—"} detail={pm.of ? "Days reaching ≥95% of protein target" : "Needs 5+ logged days"} />
        <Indicator title="Logging coverage (28 days)" status={p28.loggedDays >= 20 ? "good" : p28.loggedDays >= 10 ? "neutral" : p28.loggedDays ? "watch" : "none"} value={`${p28.loggedDays} of ${last28.length} days`} detail="Days with a food log" />
      </div>
    </div>
  );
}

function InsightsList({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return <EmptyState icon={<Lightbulb />} title="No insights yet" body="Insights appear once there is enough data to support them, usually after five or more logged days. EVOLV does not guess from a single day." />;
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {insights.map((i) => (
        <li key={i.id}>
          <Card className="h-full">
            <CardBody className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{i.title}</h3>
                <Badge tone={i.tone === "positive" ? "good" : i.tone === "attention" ? "warn" : "neutral"}>{i.area}</Badge>
              </div>
              <p className="mt-0.5 text-[12px] text-faint">
                {formatDay(i.range.start, "d MMM")} to {formatDay(i.range.end, "d MMM yyyy")}
              </p>
              <dl className="mt-3 space-y-2 text-[13.5px]">
                <div>
                  <dt className="text-[12px] text-muted">Observation (fact)</dt>
                  <dd>{i.observation}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">Supporting data</dt>
                  <dd className="tabular">{i.evidence}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">Why it matters (interpretation)</dt>
                  <dd className="text-muted">{i.why}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">Practical next step</dt>
                  <dd>{i.action}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ConfidenceBadge({ c }: { c: Confidence }) {
  return <Badge tone={c === "user" ? "accent" : c === "insufficient" ? "outline" : "neutral"}>{CONFIDENCE_LABEL[c]}</Badge>;
}

function EnergyBalance({ date, series, weights, profile, food, overrides }: {
  date: string;
  series: ReturnType<typeof nutritionSeries>;
  weights: import("@/lib/db/types").WeightEntry[];
  profile: import("@/lib/db/types").UserProfile;
  food: import("@/lib/db/types").FoodEntry[];
  overrides: import("@/lib/db/types").DailyNutritionSummary[];
}) {
  const imports = useImportsForDate(date);
  const { run, busy } = useAction();
  const [manual, setManual] = React.useState(profile.maintenanceCaloriesOverride ? String(profile.maintenanceCaloriesOverride) : "");
  const daily = dailyWeights(weights);
  const latestW = daily.filter((d) => d.date <= date).at(-1)?.weightKg ?? null;
  const formula = formulaMaintenance(profile, latestW, date);
  const trend = trendMaintenance(series.filter((d) => d.date > shiftDate(date, -28)), daily);
  const chosen: MaintenanceEstimate = formula.confidence === "user" ? formula : trend.kcal !== null ? trend : formula;
  const day = dayNutrition(date, food.filter((f) => f.date === date), overrides.find((o) => o.date === date) ?? null);
  const bal = energyBalance(day, chosen);
  const week = series.filter((d) => d.date > shiftDate(date, -7) && d.logged && d.totals.calories !== null && d.missing.calories === 0);
  const weekAvg = mean(week.map((d) => d.totals.calories));
  const activeImport = imports?.find((i) => i.status === "active");

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Apple Watch Move calories are not your total burn">
        Move counts active energy only. Total daily energy expenditure also includes resting metabolism and digestion, so EVOLV never calculates a deficit as food minus Move calories.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={formatDay(date, "EEE, d MMM")} description="Intake minus estimated maintenance" action={<ConfidenceBadge c={bal.confidence} />} />
          <CardBody>
            {bal.balance !== null ? (
              <>
                <p className="font-display text-[40px] font-semibold leading-none tabular">
                  {bal.balance > 0 ? "+" : "−"}
                  {fmt(Math.abs(bal.balance))}
                  <span className="ml-1 text-base font-normal text-muted">kcal</span>
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  Estimated {bal.balance < 0 ? "deficit" : "surplus"}: {fmt(bal.intake)} kcal eaten vs ~{fmt(bal.maintenance)} kcal maintenance.
                </p>
                {bal.balance < -1000 ? <p className="mt-2 text-[12.5px] text-warn">This is a large estimated deficit. Very aggressive deficits make it harder to keep muscle during recomposition.</p> : null}
              </>
            ) : (
              <p className="text-[14px] text-muted">{bal.reason}</p>
            )}
            {weekAvg !== null && chosen.kcal !== null ? (
              <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                Last 7 days: average {fmt(weekAvg)} kcal over {week.length} complete day{week.length === 1 ? "" : "s"}, about {fmt(Math.abs(weekAvg - chosen.kcal))} kcal/day {weekAvg - chosen.kcal < 0 ? "below" : "above"} maintenance (estimate).
              </p>
            ) : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Maintenance estimates" description="EVOLV uses your own figure first, then the trend-based estimate, then the formula." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <EstimateBox title="From your intake and weight trend" e={trend} />
            <EstimateBox title="From a formula" e={formula.confidence === "user" ? formulaMaintenance({ ...profile, maintenanceCaloriesOverride: null }, latestW, date) : formula} />
            <form
              className="md:col-span-2 flex flex-wrap items-end gap-3 border-t border-line pt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = parseInputNumber(manual);
                if (n !== null && (!Number.isFinite(n) || n < 1000 || n > 6000)) {
                  return void run(async () => {
                    throw new ValidationError("Maintenance must be between 1,000 and 6,000 kcal.");
                  });
                }
                await run(() => updateProfile({ maintenanceCaloriesOverride: n }), n ? "Maintenance estimate saved" : "Maintenance estimate cleared");
              }}
            >
              <Field label="Your own maintenance estimate (kcal/day)" htmlFor="maint" hint="Optional. Leave blank to use EVOLV's estimates." className="w-64">
                <Input id="maint" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 2600" />
              </Field>
              <Button type="submit" variant="secondary" disabled={busy}>
                Save
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
      {activeImport?.energyBalanceText ? (
        <Card>
          <CardHeader title="As stated in the imported report" action={<Badge tone="outline">Report&apos;s estimate</Badge>} />
          <CardBody>
            <p className="whitespace-pre-line text-[13.5px] text-muted">{activeImport.energyBalanceText}</p>
            <p className="mt-2 text-[12px] text-faint">Shown for reference only. EVOLV&apos;s own figures above do not use it.</p>
          </CardBody>
        </Card>
      ) : null}
      <p className="text-[12px] text-faint">
        See <Link href="/profile/" className="text-accent-text hover:underline">Profile</Link> to add age, sex and activity level for the formula estimate.
      </p>
    </div>
  );
}

function EstimateBox({ title, e }: { title: string; e: MaintenanceEstimate }) {
  return (
    <div className="rounded-[12px] border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium">{title}</p>
        <ConfidenceBadge c={e.confidence} />
      </div>
      <p className="mt-2 font-display text-[26px] font-semibold tabular">{e.kcal !== null ? `~${fmt(e.kcal)}` : "—"}<span className="ml-1 text-[13px] font-normal text-muted">kcal/day</span></p>
      <p className="mt-1 text-[12px] text-muted">{e.method}</p>
      {e.missingInputs.length ? (
        <p className="mt-2 text-[12px] text-faint">Needs: {e.missingInputs.join("; ")}.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-faint">
          {e.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
