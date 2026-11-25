"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import type { GoalTargets, GoalVersion } from "@/lib/db/types";
import { useGoals, useSettings } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { deleteGoalVersion, saveGoalVersion, ValidationError } from "@/lib/db/repos";
import { goalsForDate, macroConsistency } from "@/lib/analytics/goals";
import { EPOCH_DATE } from "@/lib/db/seed";
import { formatDay, isISODate, todayISO } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout, LoadingBlock } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, numToInput, parseInputNumber } from "@/components/ui/input";

const FIELDS: { k: keyof GoalTargets; label: string; required?: boolean; group: "nutrition" | "activity" | "body" }[] = [
  { k: "calories", label: "Calories (kcal)", required: true, group: "nutrition" },
  { k: "protein", label: "Protein (g)", required: true, group: "nutrition" },
  { k: "carbs", label: "Carbohydrates (g)", required: true, group: "nutrition" },
  { k: "fat", label: "Fat (g)", required: true, group: "nutrition" },
  { k: "fiber", label: "Fiber (g)", required: true, group: "nutrition" },
  { k: "steps", label: "Steps", group: "activity" },
  { k: "moveCalories", label: "Move (kcal)", group: "activity" },
  { k: "exerciseMinutes", label: "Exercise (min)", group: "activity" },
  { k: "standHours", label: "Stand (hours)", group: "activity" },
  { k: "targetWeightKg", label: "Target weight (kg)", group: "body" },
  { k: "targetWaistCm", label: "Target waist (cm)", group: "body" },
];

export function GoalsView() {
  const goals = useGoals();
  const settings = useSettings();
  const { run, busy } = useAction();
  const today = todayISO();
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [from, setFrom] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [del, setDel] = React.useState<GoalVersion | null>(null);
  const current = goals ? goalsForDate(goals, today) : null;

  React.useEffect(() => {
    if (!current) return;
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.k] = numToInput(current[f.k] as number | null);
    setForm(init);
    // Reset only when the active version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.updatedAt]);

  if (!goals || !settings || !current) return <LoadingBlock />;

  const parsed = Object.fromEntries(FIELDS.map((f) => [f.k, parseInputNumber(form[f.k] ?? "")])) as Record<keyof GoalTargets, number | null>;
  const nutritionOk = ["calories", "protein", "carbs", "fat"].every((k) => typeof parsed[k as keyof GoalTargets] === "number" && (parsed[k as keyof GoalTargets] as number) > 0);
  const mc = nutritionOk ? macroConsistency({ calories: parsed.calories!, protein: parsed.protein!, carbs: parsed.carbs!, fat: parsed.fat! }) : null;

  const save = async () => {
    for (const f of FIELDS) {
      const v = parsed[f.k];
      if (v !== null && (!Number.isFinite(v) || v < 0)) return void run(() => Promise.reject(new ValidationError(`${f.label} must be a non-negative number.`)));
    }
    if (!isISODate(from)) return;
    await run(() => saveGoalVersion(parsed as unknown as GoalTargets, from, note.trim() || null), `Targets saved, effective ${formatDay(from, "d MMM yyyy")}`);
    setNote("");
  };

  const groups: [string, (typeof FIELDS)[number]["group"]][] = [
    ["Nutrition", "nutrition"],
    ["Activity", "activity"],
    ["Body", "body"],
  ];

  return (
    <div>
      <PageHeader title="Goals & Targets" description="Working targets, not medical prescriptions. Changes apply from the date you choose; earlier days keep the targets that applied then." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Targets" description={`Currently in force since ${current.effectiveFrom === EPOCH_DATE ? "the start" : formatDay(current.effectiveFrom, "d MMM yyyy")}`} />
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-5"
            >
              {groups.map(([title, g]) => (
                <fieldset key={g}>
                  <legend className="mb-2 text-[13px] font-semibold">{title}</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {FIELDS.filter((f) => f.group === g).map((f) => (
                      <Field key={f.k} label={f.label} htmlFor={`g-${f.k}`} hint={!f.required ? "Optional" : undefined}>
                        <Input id={`g-${f.k}`} inputMode="decimal" value={form[f.k] ?? ""} placeholder="—" onChange={(e) => setForm((p) => ({ ...p, [f.k]: e.target.value }))} required={f.required} />
                      </Field>
                    ))}
                  </div>
                </fieldset>
              ))}
              {mc ? (
                mc.material ? (
                  <Callout tone="warn" title="Macro targets and calorie target disagree">
                    Protein × 4 + carbs × 4 + fat × 9 = {fmt(mc.derived)} kcal, which is {fmt(Math.abs(mc.difference))} kcal ({Math.abs(Math.round(mc.differencePct))}%) {mc.difference > 0 ? "above" : "below"} your {fmt(mc.target)} kcal target. You can keep them as they are; this is only a check.
                  </Callout>
                ) : (
                  <p className="text-[12.5px] text-muted">
                    Macros imply about {fmt(mc.derived)} kcal ({mc.difference > 0 ? "+" : "−"}
                    {fmt(Math.abs(mc.difference))} kcal vs the calorie target), within 10%.
                  </p>
                )
              ) : null}
              <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                <Field label="Effective from" htmlFor="g-from">
                  <Input id="g-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="Note (optional)" htmlFor="g-note">
                  <Input id="g-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the change?" />
                </Field>
                <Button type="submit" variant="primary" disabled={busy}>
                  Save targets
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="How targets are judged" />
            <CardBody className="space-y-2 text-[13px] text-muted">
              <p>
                <strong className="text-text">Calories:</strong> within ±{settings.calorieTolerancePct}% of target (change in Settings).
              </p>
              <p>
                <strong className="text-text">Protein and fiber:</strong> met at 95% or more of target. Going over is fine.
              </p>
              <p>
                <strong className="text-text">Carbs and fat:</strong> within ±10% of target.
              </p>
              <p>
                <strong className="text-text">Activity rings:</strong> the goal from each day&apos;s Apple Watch summary is used when present; otherwise the goals here.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" description="Each version applies until the next one starts." />
            <CardBody>
              <ul className="divide-y divide-line">
                {[...goals].reverse().map((v) => (
                  <li key={v.id} className="flex items-start gap-2 py-2.5 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{v.effectiveFrom === EPOCH_DATE ? "Initial targets" : `From ${formatDay(v.effectiveFrom, "d MMM yyyy")}`}</p>
                      <p className="tabular text-muted">
                        {fmt(v.calories)} kcal, P {v.protein} g, C {v.carbs} g, F {v.fat} g, fiber {v.fiber} g
                      </p>
                      {v.note ? <p className="text-faint">{v.note}</p> : null}
                    </div>
                    {goals.length > 1 ? (
                      <Button size="icon" variant="ghost" aria-label={`Delete targets from ${v.effectiveFrom}`} onClick={() => setDel(v)}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this target version?"
        description="Days it covered will fall back to the previous version's targets in all analytics."
        confirmLabel="Delete version"
        busy={busy}
        onConfirm={async () => {
          if (!del) return;
          await run(() => deleteGoalVersion(del.id), "Target version deleted");
          setDel(null);
        }}
      />
    </div>
  );
}
