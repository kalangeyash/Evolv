"use client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/ui/chart";
import { ChartOrTable } from "@/components/ui/chart-or-table";
import { formatDay } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";

/**
 * One bar per day. Days without data are gaps (null), never zero-height bars,
 * and the tooltip says "Not logged".
 */
export function DailyBars({
  data,
  color,
  unit,
  target,
  height = 200,
  decimals = 0,
  name,
}: {
  data: { date: string; value: number | null; partial?: boolean }[];
  color: string;
  unit: string;
  target?: number | null;
  height?: number;
  decimals?: 0 | 1;
  name: string;
}) {
  const many = data.length > 14;
  const withData = data.filter((d) => d.value !== null);
  return (
    <ChartOrTable
      label={`${name} per day`}
      hasData={withData.length > 0}
      emptyText={`No ${name.toLowerCase()} data in this range.`}
      table={{
        columns: ["Date", `${name} (${unit})`, ...(target ? ["Target"] : [])],
        rows: data.map((d) => [
          formatDay(d.date, "EEE, d MMM"),
          d.value === null ? "Not logged" : `${fmt(d.value, { decimals })}${d.partial ? " (partial)" : ""}`,
          ...(target ? [fmt(target)] : []),
        ]),
      }}
    >
    <ChartFrame height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={many ? 2 : 6}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            interval={many ? Math.ceil(data.length / 8) - 1 : 0}
            tickFormatter={(d) => formatDay(d, many ? "d MMM" : "EEE")}
          />
          <YAxis axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmt(v)} />
          {target ? <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(p) => {
              const row = p.payload?.[0]?.payload as { date: string; value: number | null; partial?: boolean } | undefined;
              if (!p.active || !row) return null;
              return (
                <ChartTooltip
                  active
                  label={row.date}
                  labelFormatter={(l) => formatDay(String(l), "EEE, d MMM")}
                  payload={[{ name, value: row.value, color }]}
                  valueFormatter={() => (row.value === null ? "Not logged" : `${fmt(row.value, { decimals })} ${unit}${row.partial ? " (partial)" : ""}${target ? ` of ${fmt(target)}` : ""}`)}
                />
              );
            }}
          />
          <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
    </ChartOrTable>
  );
}
