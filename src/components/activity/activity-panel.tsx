"use client";
import type { ActivityEntry, GoalVersion } from "@/lib/db/types";
import { effectiveActivityGoals, ringRatio } from "@/lib/analytics/activity";
import { ActivityRings } from "@/components/ui/rings";
import { SourceBadge } from "@/components/ui/feedback";
import { fmt } from "@/lib/utils/format";

export function ActivityPanel({ entry, goals, workouts }: { entry: ActivityEntry | null; goals: GoalVersion | null; workouts?: { count: number; minutes: number | null } }) {
  const g = effectiveActivityGoals(entry, goals);
  const rings = [
    { key: "move", label: "Move", value: entry?.moveCalories ?? null, goal: g.move, color: "var(--r-move)", unit: "kcal" },
    { key: "exercise", label: "Exercise", value: entry?.exerciseMinutes ?? null, goal: g.exercise, color: "var(--r-exercise)", unit: "min" },
    { key: "stand", label: "Stand", value: entry?.standHours ?? null, goal: g.stand, color: "var(--r-stand)", unit: "hr" },
  ];
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <ActivityRings rings={rings} className="mx-auto sm:mx-0" />
      <div className="min-w-0 flex-1">
        <ul className="space-y-2">
          {rings.map((r) => {
            const ratio = ringRatio(r.value, r.goal);
            return (
              <li key={r.key} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[13.5px] text-muted">
                  <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
                  {r.label}
                </span>
                <span className="tabular text-[13.5px]">
                  <span className="font-semibold">{fmt(r.value)}</span>
                  <span className="text-muted">
                    {" "}/ {fmt(r.goal)} {r.unit}
                    {ratio !== null ? ` (${Math.round(ratio * 100)}%)` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px]">
          <div>
            <dt className="text-muted">Steps</dt>
            <dd className="tabular font-semibold">{fmt(entry?.steps ?? null)}</dd>
          </div>
          <div>
            <dt className="text-muted">Distance</dt>
            <dd className="tabular font-semibold">{fmt(entry?.distanceKm ?? null, { decimals: 1, unit: "km" })}</dd>
          </div>
          {workouts ? (
            <>
              <div>
                <dt className="text-muted">Workouts</dt>
                <dd className="tabular font-semibold">{workouts.count}</dd>
              </div>
              <div>
                <dt className="text-muted">Workout time</dt>
                <dd className="tabular font-semibold">{fmt(workouts.minutes, { unit: "min" })}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {entry ? (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-faint">
            <SourceBadge source={entry.source} corrected={entry.corrected} />
            {entry.source === "import" ? "From your Apple Watch summary in the daily report" : "Entered in EVOLV"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
