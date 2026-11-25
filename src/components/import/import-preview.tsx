"use client";
import * as React from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { MealCategory, NutrientKey } from "@/lib/db/types";
import { MEAL_CATEGORIES, NUTRIENT_KEYS, WORKOUT_TYPES } from "@/lib/db/types";
import type { ParsedActivity, ParsedEntry, ParsedReport, ValidationResult } from "@/lib/parser";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, parseInputNumber } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { MEAL_LABELS, NUTRIENT_LABELS, NUTRIENT_UNITS, fmt } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Numeric input that commits on blur; empty means "missing" (null), never zero. */
export function NumCell({
  value,
  onCommit,
  label,
  className,
  approximate,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  className?: string;
  approximate?: boolean;
}) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <div className="relative">
      <Input
        aria-label={label}
        inputMode="decimal"
        value={text}
        placeholder="—"
        aria-invalid={bad}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseInputNumber(text);
          if (n !== null && (!Number.isFinite(n) || n < 0)) {
            setBad(true);
            return;
          }
          setBad(false);
          if (n !== value) onCommit(n);
        }}
        className={cn("h-9 px-2 text-right tabular", approximate && "pr-5", className)}
      />
      {approximate ? (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-warn" title="Marked approximate in the report">
          ~
        </span>
      ) : null}
    </div>
  );
}

function IssueList({ issues }: { issues: { level: string; message: string }[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {issues.map((i, k) => (
        <li key={k} className={cn("flex gap-1.5 text-[12px]", i.level === "error" ? "text-bad" : i.level === "warning" ? "text-warn" : "text-faint")}>
          {i.level === "error" ? <XCircle className="mt-px size-3.5 shrink-0" /> : i.level === "warning" ? <AlertTriangle className="mt-px size-3.5 shrink-0" /> : <Info className="mt-px size-3.5 shrink-0" />}
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function EntryEditor({ e, onChange }: { e: ParsedEntry; onChange: (patch: Partial<ParsedEntry>) => void }) {
  const setNutrient = (k: NutrientKey) => (v: number | null) =>
    onChange({ [k]: v, approximateFields: e.approximateFields.filter((f) => f !== k) } as Partial<ParsedEntry>);
  const hasError = e.issues.some((i) => i.level === "error") && e.include;
  return (
    <li className={cn("rounded-[12px] border p-3 sm:p-4", hasError ? "border-bad/60" : "border-line", !e.include && "opacity-55")}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
          <input type="checkbox" checked={e.include} onChange={(ev) => onChange({ include: ev.target.checked })} className="size-4 accent-[var(--accent)]" />
          <span className="sr-only">Include entry</span>
          {e.entryNumber !== null ? <span className="tabular">#{e.entryNumber}</span> : null}
        </label>
        <div className="min-w-[200px] flex-1">
          <Input aria-label="Food name" value={e.mealName} onChange={(ev) => onChange({ mealName: ev.target.value })} className="h-9 font-medium" placeholder="Food name" />
        </div>
        <Input aria-label="Time" type="time" value={e.time ?? ""} onChange={(ev) => onChange({ time: ev.target.value || null })} className="h-9 w-[120px]" />
        <Select aria-label="Meal category" value={e.mealCategory} onChange={(ev) => onChange({ mealCategory: ev.target.value as MealCategory })} className="h-9 w-[160px]">
          {MEAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MEAL_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {NUTRIENT_KEYS.map((k) => (
          <div key={k}>
            <p className="mb-1 text-[11px] text-faint">
              {NUTRIENT_LABELS[k]} ({NUTRIENT_UNITS[k]})
            </p>
            <NumCell label={`${NUTRIENT_LABELS[k]} for ${e.mealName || "entry"}`} value={e[k]} onCommit={setNutrient(k)} approximate={e.approximateFields.includes(k)} />
          </div>
        ))}
        <div>
          <p className="mb-1 text-[11px] text-faint">Score{e.foodScoreScale ? ` (/${e.foodScoreScale})` : ""}</p>
          <NumCell label="Food score" value={e.foodScore} onCommit={(v) => onChange({ foodScore: v, foodScoreScale: v === null ? null : (e.foodScoreScale ?? 10) })} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {e.mealLabel ? <span>Label: {e.mealLabel}</span> : null}
        {e.quantity ? <span>Quantity: {e.quantity}</span> : null}
        {e.brand ? <span>Brand: {e.brand}</span> : null}
      </div>
      {e.description ? <p className="mt-1 text-[12.5px] text-muted">{e.description}</p> : null}
      <IssueList issues={e.issues.filter((i) => i.level !== "info" || i.field !== "time" || !e.time)} />
    </li>
  );
}

export function ImportPreview({
  report,
  validation,
  onChange,
  totalsChoice,
  setTotalsChoice,
  recordWeight,
  setRecordWeight,
  weightHint,
}: {
  report: ParsedReport;
  validation: ValidationResult;
  onChange: (r: ParsedReport) => void;
  totalsChoice: "calculated" | "reported";
  setTotalsChoice: (c: "calculated" | "reported") => void;
  recordWeight: boolean;
  setRecordWeight: (v: boolean) => void;
  weightHint: string | null;
}) {
  const m = report.metadata;
  const patchEntry = (key: string, patch: Partial<ParsedEntry>) =>
    onChange({ ...report, entries: report.entries.map((e) => (e.key === key ? { ...e, ...patch, issues: patch.mealName !== undefined || NUTRIENT_KEYS.some((k) => k in patch) ? e.issues.filter((i) => i.level !== "error") : e.issues } : e)) });
  const patchActivity = (k: keyof ParsedActivity, v: number | null) => onChange({ ...report, activity: { ...(report.activity as ParsedActivity), [k]: v } });
  const anyReported = NUTRIENT_KEYS.some((k) => report.reportedTotals[k] !== null);

  return (
    <div className="space-y-4">
      {/* Status */}
      {validation.errors.length ? (
        <Callout tone="bad" title={`${validation.errors.length} problem${validation.errors.length > 1 ? "s" : ""} must be fixed before importing`}>
          <ul className="list-disc pl-4">
            {validation.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </Callout>
      ) : (
        <Callout tone="good" title="Ready to import">
          {validation.includedEntries} food entr{validation.includedEntries === 1 ? "y" : "ies"}
          {report.activity ? ", Apple Watch activity" : ""}
          {report.workouts.filter((w) => w.include).length ? `, ${report.workouts.filter((w) => w.include).length} workout(s)` : ""}. Review the values below; you can edit anything before saving.
        </Callout>
      )}
      {validation.warnings.length ? (
        <Callout tone="warn" title="Check these">
          <ul className="list-disc pl-4">
            {validation.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {/* Metadata */}
      <Card>
        <CardHeader title="Report details" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-2">
              <p className="mb-1 text-[12px] text-muted">Report date</p>
              <Input type="date" aria-label="Report date" value={m.date ?? ""} aria-invalid={!m.date} onChange={(e) => onChange({ ...report, metadata: { ...m, date: e.target.value || null } })} />
            </div>
            <Meta label="Day" value={m.dayOfWeek} />
            <Meta label="Timezone" value={m.timezone} />
            <Meta label="Goal" value={m.goal} />
            <Meta label="Height" value={m.heightCm ? `${m.heightCm} cm` : null} />
          </div>
          {m.weightKg !== null ? (
            <label className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-line p-3 text-[13.5px]">
              <input type="checkbox" checked={recordWeight} onChange={(e) => setRecordWeight(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                Record body weight <strong className="tabular">{m.weightKg} kg</strong> as a weigh-in for this date
                {weightHint ? <span className="mt-0.5 block text-[12px] text-muted">{weightHint}</span> : null}
              </span>
            </label>
          ) : null}
        </CardBody>
      </Card>

      {/* Entries */}
      <Card>
        <CardHeader title={`Food entries (${report.entries.length})`} description="Uncheck an entry to leave it out. Blank values are stored as missing, not zero. “~” marks values the report gave as approximate." />
        <CardBody>
          {report.entries.length ? (
            <ul className="space-y-3">
              {report.entries.map((e) => (
                <EntryEditor key={e.key} e={e} onChange={(p) => patchEntry(e.key, p)} />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">No food entries were found.</p>
          )}
        </CardBody>
      </Card>

      {/* Totals reconciliation */}
      <Card>
        <CardHeader title="Daily totals check" description="Entries are added up and compared with the totals printed in the report. The report's own numbers are kept unchanged." />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="py-2 font-medium">Nutrient</th>
                  <th className="py-2 text-right font-medium">From entries</th>
                  <th className="py-2 text-right font-medium">Reported</th>
                  <th className="py-2 text-right font-medium">Difference</th>
                  <th className="py-2 text-right font-medium">Target in report</th>
                  <th className="py-2 pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {validation.comparisons.map((c) => (
                  <tr key={c.key} className="border-b border-line/60">
                    <td className="py-2">{NUTRIENT_LABELS[c.key]}</td>
                    <td className="tabular py-2 text-right">
                      {fmt(c.calculated, { decimals: 1 })}
                      {c.entriesMissing ? <span className="ml-1 text-[11px] text-warn">({c.entriesMissing} missing)</span> : null}
                    </td>
                    <td className="tabular py-2 text-right">{fmt(c.reported, { decimals: 1 })}</td>
                    <td className="tabular py-2 text-right">{c.difference === null ? "—" : `${c.difference > 0 ? "+" : ""}${c.difference}`}</td>
                    <td className="tabular py-2 text-right text-muted">{fmt(report.reportedTargets[c.key], { decimals: 1 })}</td>
                    <td className="py-2 pl-4">
                      <StatusBadge s={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyReported ? (
            <fieldset className="mt-4">
              <legend className="mb-2 text-[13px] font-medium">Which totals should represent this day?</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(["calculated", "reported"] as const).map((c) => (
                  <label key={c} className={cn("flex flex-1 cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 text-[13px]", totalsChoice === c ? "border-accent-text" : "border-line")}>
                    <input type="radio" name="totals" checked={totalsChoice === c} onChange={() => setTotalsChoice(c)} className="mt-0.5 accent-[var(--accent)]" />
                    <span>
                      <span className="font-medium">{c === "calculated" ? "Sum of entries (recommended)" : "Totals printed in the report"}</span>
                      <span className="mt-0.5 block text-muted">
                        {c === "calculated" ? "Stays correct when you later edit an entry." : "Fixed numbers; later edits to entries will not change the day's totals."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </CardBody>
      </Card>

      {/* Activity */}
      {report.activity ? (
        <Card>
          <CardHeader title="Apple Watch activity" description="Imported values are labelled as imported throughout EVOLV." />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["moveCalories", "Move (kcal)"],
                  ["moveGoal", "Move goal"],
                  ["exerciseMinutes", "Exercise (min)"],
                  ["exerciseGoal", "Exercise goal"],
                  ["standHours", "Stand (hr)"],
                  ["standGoal", "Stand goal"],
                  ["steps", "Steps"],
                  ["distanceKm", "Distance (km)"],
                ] as [keyof ParsedActivity, string][]
              ).map(([k, label]) => (
                <div key={k}>
                  <p className="mb-1 text-[11.5px] text-faint">{label}</p>
                  <NumCell label={label} value={report.activity![k]} onCommit={(v) => patchActivity(k, v)} />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {report.workouts.length ? (
        <Card>
          <CardHeader title="Workouts" />
          <CardBody>
            <ul className="space-y-2">
              {report.workouts.map((w) => (
                <li key={w.key} className={cn("flex flex-wrap items-center gap-3 rounded-[10px] border border-line p-3", !w.include && "opacity-55")}>
                  <input
                    type="checkbox"
                    aria-label={`Include ${w.name}`}
                    checked={w.include}
                    onChange={(e) => onChange({ ...report, workouts: report.workouts.map((x) => (x.key === w.key ? { ...x, include: e.target.checked } : x)) })}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <Input aria-label="Workout name" value={w.name} onChange={(e) => onChange({ ...report, workouts: report.workouts.map((x) => (x.key === w.key ? { ...x, name: e.target.value } : x)) })} className="h-9 w-48" />
                  <Select aria-label="Workout type" value={w.type} onChange={(e) => onChange({ ...report, workouts: report.workouts.map((x) => (x.key === w.key ? { ...x, type: e.target.value as typeof w.type } : x)) })} className="h-9 w-36">
                    {WORKOUT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </Select>
                  <span className="tabular text-[13px] text-muted">
                    {fmt(w.durationMin, { unit: "min" })}, {fmt(w.distanceKm, { decimals: 1, unit: "km" })}, {fmt(w.calories, { unit: "kcal" })}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {report.energyBalanceText || report.notes.length || report.uncertainties.length ? (
        <Card>
          <CardHeader title="Notes from the report" description="Stored with the import for reference. EVOLV does not use the report's energy-balance figure in its own calculations." />
          <CardBody className="space-y-4 text-[13.5px]">
            {report.energyBalanceText ? (
              <div>
                <p className="mb-1 flex items-center gap-2 font-medium">
                  Energy balance <Badge tone="outline">Report&apos;s estimate</Badge>
                </p>
                <p className="whitespace-pre-line text-muted">{report.energyBalanceText}</p>
              </div>
            ) : null}
            {report.notes.length ? (
              <div>
                <p className="mb-1 font-medium">Notes</p>
                <ul className="list-disc space-y-0.5 pl-5 text-muted">
                  {report.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.uncertainties.length ? (
              <div>
                <p className="mb-1 font-medium">Uncertainty</p>
                <ul className="list-disc space-y-0.5 pl-5 text-muted">
                  {report.uncertainties.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {report.unrecognized.length || report.ignored.length ? (
        <details className="rounded-[12px] border border-line bg-surface p-4 text-[13px]">
          <summary className="cursor-pointer font-medium">
            Lines not imported ({report.unrecognized.length + report.ignored.length})
          </summary>
          <p className="mt-2 text-muted">These lines were not recognised as data, or belong to summary sections EVOLV recalculates itself. They remain in the stored original text.</p>
          <ul className="mt-2 space-y-1 font-mono text-[12px] text-faint">
            {[...report.unrecognized, ...report.ignored].map((l, i) => (
              <li key={i} className="break-words">
                {l}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-muted">{label}</p>
      <p className={cn("text-[14px]", value ? "text-text" : "text-faint")}>{value ?? "Not stated"}</p>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  switch (s) {
    case "match":
      return <Badge tone="good">Matches</Badge>;
    case "rounding":
      return <Badge tone="neutral">Rounding</Badge>;
    case "mismatch":
      return <Badge tone="warn">Differs</Badge>;
    case "not-reported":
      return <Badge tone="outline">No total in report</Badge>;
    default:
      return <Badge tone="outline">No data</Badge>;
  }
}
