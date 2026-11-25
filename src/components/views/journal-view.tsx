"use client";
import * as React from "react";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FoodEntry, MealCategory } from "@/lib/db/types";
import { MEAL_CATEGORIES } from "@/lib/db/types";
import { useUI } from "@/stores/ui-store";
import { useAllFood, useFoodForDate, useGoals, useOverrideForDate, useSettings } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { clearTotalsOverride } from "@/lib/db/repos";
import { goalsForDate } from "@/lib/analytics/goals";
import { dayNutrition, frequentFoods, mealBreakdown, sumFood } from "@/lib/analytics/nutrition";
import { formatDay, formatTime12, isISODate, shiftDate, todayISO } from "@/lib/utils/dates";
import { MEAL_LABELS, fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Callout, EmptyState, LoadingBlock, SourceBadge } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
import { ChartFrame, ChartTooltip, Legend } from "@/components/ui/chart";
import { FoodEntryDialog } from "@/components/food/food-entry-dialog";
import { NUTRIENT_COLOR, NutrientProgressList } from "@/components/food/nutrient-progress";
import { sortEntries } from "@/components/food/meal-timeline";
import { useDateFromQuery } from "@/hooks/use-date-query";

export function JournalView() {
  useDateFromQuery();
  const date = useUI((s) => s.selectedDate);
  const [editing, setEditing] = React.useState<FoodEntry | null>(null);
  const [open, setOpen] = React.useState(false);
  const openEntry = (e: FoodEntry | null) => {
    setEditing(e);
    setOpen(true);
  };
  return (
    <div>
      <PageHeader
        title="Food Journal"
        description="Every meal, grouped and searchable. Edits to imported entries are tracked as corrections."
        actions={
          <Button variant="primary" onClick={() => openEntry(null)}>
            <Plus /> Add entry
          </Button>
        }
      />
      <Tabs defaultValue="day">
        <TabsList className="mb-4">
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="frequent">Frequent foods</TabsTrigger>
          <TabsTrigger value="meals">Meal analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="day">
          <DayJournal date={date} onOpen={openEntry} />
        </TabsContent>
        <TabsContent value="search">
          <SearchPanel onOpen={openEntry} />
        </TabsContent>
        <TabsContent value="frequent">
          <FrequentPanel />
        </TabsContent>
        <TabsContent value="meals">
          <MealAnalytics />
        </TabsContent>
      </Tabs>
      <FoodEntryDialog open={open} onOpenChange={setOpen} entry={editing} date={date} />
    </div>
  );
}

function DayJournal({ date, onOpen }: { date: string; onOpen: (e: FoodEntry | null) => void }) {
  const food = useFoodForDate(date);
  const override = useOverrideForDate(date);
  const goals = useGoals();
  const settings = useSettings();
  const { run } = useAction();
  if (!food || override === undefined || !goals || !settings) return <LoadingBlock />;
  const g = goalsForDate(goals, date);
  const day = dayNutrition(date, food, override);
  const entrySums = sumFood(food).totals;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold">{formatDay(date, "EEEE, d MMMM yyyy")}</h2>
        {override ? (
          <Callout tone="info" title="Day totals use the report's printed numbers">
            <p>
              Sum of entries is {fmt(entrySums.calories)} kcal and {fmt(entrySums.protein, { decimals: 1 })} g protein. Edits to entries will not change the day&apos;s totals until you switch back.
            </p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => run(() => clearTotalsOverride(date), "Now using the sum of entries")}>
              Use sum of entries
            </Button>
          </Callout>
        ) : null}
        {food.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed />} title="Nothing logged for this day" body="Import a report or add an entry manually." action={{ label: "Import a report", href: "/import/" }} />
        ) : (
          MEAL_CATEGORIES.map((cat) => {
            const list = sortEntries(food.filter((f) => f.mealCategory === cat));
            if (!list.length) return null;
            const t = sumFood(list).totals;
            return (
              <Card key={cat}>
                <CardHeader title={MEAL_LABELS[cat]} description={`${fmt(t.calories)} kcal, ${fmt(t.protein, { decimals: 1 })} g protein`} />
                <CardBody className="pt-2">
                  <ul className="divide-y divide-line">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EntryRow e={e} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
      <div className="space-y-4">
        <Card className="lg:sticky lg:top-24">
          <CardHeader title="Day totals" description={day.source === "reported" ? "From the report's totals" : "Sum of entries"} />
          <CardBody>{g ? <NutrientProgressList totals={day.totals} targets={g} missing={day.missing} tolerance={settings.calorieTolerancePct} compact /> : null}</CardBody>
        </Card>
      </div>
    </div>
  );
}

function EntryRow({ e, onOpen, showDate }: { e: FoodEntry; onOpen: (e: FoodEntry) => void; showDate?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(e)} className="grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left hover:bg-surface-2/60 sm:grid-cols-[64px_1fr_auto] sm:px-2">
      <span className="tabular hidden pt-0.5 text-[12.5px] text-muted sm:block">{formatTime12(e.time)}</span>
      <span className="min-w-0">
        <span className="block font-medium">{e.mealName}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          {showDate ? <span>{formatDay(e.date, "d MMM yyyy")}</span> : null}
          <span className="sm:hidden">{formatTime12(e.time)}</span>
          {e.mealLabel && e.mealLabel !== MEAL_LABELS[e.mealCategory] ? <span>{e.mealLabel}</span> : null}
          {e.quantity ? <span className="max-w-full truncate">{e.quantity}</span> : null}
          {e.brand ? <span>{e.brand}</span> : null}
          <SourceBadge source={e.source} corrected={e.corrected} />
        </span>
        {e.description ? <span className="mt-1 line-clamp-2 block text-[12.5px] text-faint">{e.description}</span> : null}
      </span>
      <span className="tabular text-right text-[12.5px]">
        <span className="block text-[14px] font-semibold">{fmt(e.calories)} kcal</span>
        <span className="text-muted">
          P {fmt(e.protein, { decimals: 1 })}g C {fmt(e.carbs, { decimals: 1 })}g F {fmt(e.fat, { decimals: 1 })}g
        </span>
        <span className="block text-muted">
          Fiber {fmt(e.fiber, { decimals: 1 })}
          {e.foodScore !== null ? `, score ${e.foodScore}/${e.foodScoreScale ?? 10}` : ""}
        </span>
      </span>
    </button>
  );
}

function SearchPanel({ onOpen }: { onOpen: (e: FoodEntry) => void }) {
  const all = useAllFood();
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<MealCategory | "all">("all");
  const [from, setFrom] = React.useState(shiftDate(todayISO(), -29));
  const [to, setTo] = React.useState(todayISO());
  if (!all) return <LoadingBlock />;
  const needle = q.trim().toLowerCase();
  const results = all
    .filter((e) => (!isISODate(from) || e.date >= from) && (!isISODate(to) || e.date <= to))
    .filter((e) => cat === "all" || e.mealCategory === cat)
    .filter((e) => !needle || [e.mealName, e.brand, e.description, e.quantity, e.mealLabel, MEAL_LABELS[e.mealCategory]].some((s) => s?.toLowerCase().includes(needle)))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const totals = sumFood(results).totals;
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid gap-3 pt-5 sm:grid-cols-[1fr_180px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input aria-label="Search food, brand or meal" placeholder="Search food, brand or meal" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Meal category" value={cat} onChange={(e) => setCat(e.target.value as MealCategory | "all")}>
            <option value="all">All meals</option>
            {MEAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MEAL_LABELS[c]}
              </option>
            ))}
          </Select>
          <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
        </CardBody>
      </Card>
      <p className="text-[13px] text-muted tabular">
        {results.length} entr{results.length === 1 ? "y" : "ies"}
        {results.length ? `, ${fmt(totals.calories)} kcal and ${fmt(totals.protein, { decimals: 1 })} g protein in total` : ""}
      </p>
      {results.length ? (
        <Card>
          <ul className="divide-y divide-line px-3 sm:px-4">
            {results.slice(0, 300).map((e) => (
              <li key={e.id}>
                <EntryRow e={e} onOpen={onOpen} showDate />
              </li>
            ))}
          </ul>
          {results.length > 300 ? <p className="px-5 py-3 text-[12.5px] text-faint">Showing the 300 most recent. Narrow the dates to see more.</p> : null}
        </Card>
      ) : (
        <EmptyState icon={<Search />} title="No matching entries" body="Try a different word or widen the date range." />
      )}
    </div>
  );
}

function FrequentPanel() {
  const all = useAllFood();
  if (!all) return <LoadingBlock />;
  const list = frequentFoods(all, 30);
  if (!list.length) return <EmptyState title="No history yet" body="Foods you log repeatedly will appear here with their typical values." />;
  return (
    <Card>
      <CardHeader title="Frequently eaten" description="Averages of what was recorded each time. EVOLV never fills in values for new foods from this list." />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th className="py-2 font-medium">Food</th>
                <th className="py-2 text-right font-medium">Times</th>
                <th className="py-2 text-right font-medium">Avg kcal</th>
                <th className="py-2 text-right font-medium">Avg protein</th>
                <th className="py-2 pl-4 font-medium">Usually</th>
                <th className="py-2 text-right font-medium">Last eaten</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.key} className="border-b border-line/60">
                  <td className="py-2 font-medium">{f.name}</td>
                  <td className="tabular py-2 text-right">{f.count}</td>
                  <td className="tabular py-2 text-right">{fmt(f.avgCalories)}</td>
                  <td className="tabular py-2 text-right">{fmt(f.avgProtein, { decimals: 1 })} g</td>
                  <td className="py-2 pl-4 text-muted">{f.categories.map((c) => MEAL_LABELS[c]).join(", ")}</td>
                  <td className="tabular py-2 text-right text-muted">{formatDay(f.lastDate, "d MMM yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function MealAnalytics() {
  const all = useAllFood();
  const [days, setDays] = React.useState<7 | 30 | 90>(30);
  if (!all) return <LoadingBlock />;
  const end = todayISO();
  const start = shiftDate(end, -(days - 1));
  const inRange = all.filter((e) => e.date >= start && e.date <= end);
  const loggedDays = new Set(inRange.map((e) => e.date)).size;
  const breakdown = mealBreakdown(inRange);
  const data = breakdown.map((m) => ({
    meal: MEAL_LABELS[m.category],
    calories: loggedDays ? (m.totals.calories ?? 0) / loggedDays : 0,
    protein: loggedDays ? ((m.totals.protein ?? 0) * 4) / loggedDays : 0,
    carbs: loggedDays ? ((m.totals.carbs ?? 0) * 4) / loggedDays : 0,
    fat: loggedDays ? ((m.totals.fat ?? 0) * 9) / loggedDays : 0,
    proteinG: loggedDays ? (m.totals.protein ?? 0) / loggedDays : 0,
    entries: m.entries,
  }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Averages per logged day ({loggedDays} of {days} days logged), {formatDay(start, "d MMM")} to {formatDay(end, "d MMM")}
        </p>
        <Segmented label="Range" value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }]} />
      </div>
      {!data.length ? (
        <EmptyState title="No meals in this range" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Energy by meal and macro" description="kcal per logged day, from grams × 4/4/9 (estimate)" />
            <CardBody>
              <ChartFrame height={240}>
                <ResponsiveContainer>
                  <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={10}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="meal" width={100} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <ChartTooltip active={p.active} label={p.label as string} payload={p.payload as never} valueFormatter={(v) => `${fmt(Number(v))} kcal`} />} />
                    <Bar dataKey="protein" name="Protein" stackId="m" fill={NUTRIENT_COLOR.protein} stroke="var(--surface)" strokeWidth={2} />
                    <Bar dataKey="carbs" name="Carbs" stackId="m" fill={NUTRIENT_COLOR.carbs} stroke="var(--surface)" strokeWidth={2} />
                    <Bar dataKey="fat" name="Fat" stackId="m" fill={NUTRIENT_COLOR.fat} stroke="var(--surface)" strokeWidth={2} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
              <Legend className="mt-2" items={[{ label: "Protein", color: NUTRIENT_COLOR.protein }, { label: "Carbs", color: NUTRIENT_COLOR.carbs }, { label: "Fat", color: NUTRIENT_COLOR.fat }]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Meal summary" />
            <CardBody>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th className="py-2 font-medium">Meal</th>
                    <th className="py-2 text-right font-medium">kcal/day</th>
                    <th className="py-2 text-right font-medium">Protein/day</th>
                    <th className="py-2 text-right font-medium">Share of protein</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => {
                    const totalP = data.reduce((a, x) => a + x.proteinG, 0);
                    return (
                      <tr key={d.meal} className="border-b border-line/60">
                        <td className="py-2">{d.meal}</td>
                        <td className="tabular py-2 text-right">{fmt(d.calories)}</td>
                        <td className="tabular py-2 text-right">{fmt(d.proteinG, { decimals: 1 })} g</td>
                        <td className="tabular py-2 text-right">{totalP ? `${Math.round((d.proteinG / totalP) * 100)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
