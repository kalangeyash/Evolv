"use client";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { FoodEntry } from "@/lib/db/types";
import { cumulativeIntake } from "@/lib/analytics/nutrition";
import { ChartFrame, ChartTooltip, Legend } from "@/components/ui/chart";
import { fmt } from "@/lib/utils/format";

const hh = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
};

/**
 * How the day's intake built up: cumulative calories and protein, each as a
 * percentage of that day's target, so both share one honest axis.
 */
export function IntakeLine({
  entries,
  calorieTarget,
  proteinTarget,
  isToday,
}: {
  entries: FoodEntry[];
  calorieTarget: number;
  proteinTarget: number;
  isToday: boolean;
}) {
  const pts = cumulativeIntake(entries);
  const untimed = entries.filter((e) => !e.time).length;
  if (!pts.length) return null;

  const first = pts[0].minutes;
  const start = Math.max(0, Math.floor((first - 60) / 60) * 60);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const last = pts[pts.length - 1];
  const end = isToday ? Math.max(last.minutes, nowMin) : Math.min(24 * 60, Math.max(last.minutes + 60, 21 * 60));
  const data = [
    { minutes: start, cal: 0, pro: 0, kcal: 0, g: 0, label: "Start of day", partial: false },
    ...pts.map((p) => ({
      minutes: p.minutes,
      cal: (p.calories / calorieTarget) * 100,
      pro: (p.protein / proteinTarget) * 100,
      kcal: p.calories,
      g: p.protein,
      label: p.label,
      partial: p.partial,
    })),
    { minutes: end, cal: (last.calories / calorieTarget) * 100, pro: (last.protein / proteinTarget) * 100, kcal: last.calories, g: last.protein, label: isToday ? "Now" : "End of day", partial: last.partial },
  ];
  const maxY = Math.max(110, ...data.map((d) => Math.max(d.cal, d.pro))) + 5;
  const yMax = Math.ceil(maxY / 25) * 25;
  const yTicks = Array.from({ length: yMax / 25 + 1 }, (_, i) => i * 25);
  const ticks: number[] = [];
  for (let m = Math.ceil(start / 180) * 180; m <= end; m += 180) ticks.push(m);

  return (
    <div>
      <ChartFrame height={200}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis dataKey="minutes" type="number" domain={[start, end]} ticks={ticks} tickFormatter={hh} axisLine={false} tickLine={false} />
            <YAxis domain={[0, yMax]} ticks={yTicks} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={48} />
            <ReferenceLine y={100} stroke="var(--muted)" strokeDasharray="4 4" ifOverflow="extendDomain" label={{ value: "Target", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)" }}
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  label={p.label as number}
                  payload={p.payload as never}
                  labelFormatter={(l, row) => `${hh(Number(l))}${row?.label ? ` — ${row.label}` : ""}`}
                  valueFormatter={(_, name) => {
                    const row = (p.payload?.[0]?.payload ?? {}) as { kcal: number; g: number; cal: number; pro: number; partial: boolean };
                    const txt = name === "Calories" ? `${fmt(row.kcal)} kcal (${Math.round(row.cal)}%)` : `${fmt(row.g, { decimals: 1 })} g (${Math.round(row.pro)}%)`;
                    return row.partial ? `${txt}+` : txt;
                  }}
                />
              )}
            />
            <Line type="stepAfter" dataKey="cal" name="Calories" stroke="var(--c-calories)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="pro" name="Protein" stroke="var(--c-protein)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Legend items={[{ label: "Calories", color: "var(--c-calories)" }, { label: "Protein", color: "var(--c-protein)" }, { label: "Daily target", color: "var(--muted)", dashed: true }]} />
        {untimed || last.partial ? (
          <p className="text-[11.5px] text-faint">
            {untimed ? `${untimed} entr${untimed === 1 ? "y" : "ies"} without a time not shown. ` : ""}
            {last.partial ? "Some entries lack values; “+” marks a lower bound." : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
