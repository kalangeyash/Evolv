"use client";
import * as React from "react";
import { Segmented } from "./segmented";

export interface TableSpec {
  columns: string[];
  rows: (string | number | null)[][];
  /** Index of columns to right-align (numeric). Defaults to all but the first. */
  numeric?: number[];
}

/**
 * Accessible chart wrapper: names the chart for screen readers, offers the
 * same data as a table (so no value depends on colour or hover), and shows
 * a clear message instead of empty axes when there is no data.
 */
export function ChartOrTable({
  label,
  table,
  children,
  emptyText = "No data in this range.",
  hasData = table.rows.length > 0,
}: {
  label: string;
  table: TableSpec;
  children: React.ReactNode;
  emptyText?: string;
  hasData?: boolean;
}) {
  const [mode, setMode] = React.useState<"chart" | "table">("chart");
  if (!hasData) return <p className="py-8 text-center text-[13px] text-muted">{emptyText}</p>;
  const numeric = new Set(table.numeric ?? table.columns.map((_, i) => i).filter((i) => i > 0));
  return (
    <div className="min-w-0">
      <div className="no-print -mt-1 mb-2 flex justify-end">
        <Segmented
          label={`${label}: view as`}
          value={mode}
          onChange={setMode}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {mode === "chart" ? (
        <figure aria-label={label} className="m-0 min-w-0">
          {children}
        </figure>
      ) : (
        <div className="scrollbar-thin max-h-80 overflow-auto rounded-[10px] border border-line">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr className="text-left text-[12px] text-muted">
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={`px-3 py-2 font-medium ${numeric.has(i) ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-line/60">
                  {r.map((cell, ci) => (
                    <td key={ci} className={`tabular px-3 py-1.5 ${numeric.has(ci) ? "text-right" : ""} ${cell === null ? "text-faint" : ""}`}>
                      {cell ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
