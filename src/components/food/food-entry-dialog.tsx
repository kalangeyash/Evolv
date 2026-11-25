"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import type { FoodEntry, ISODate, MealCategory, NutrientKey } from "@/lib/db/types";
import { MEAL_CATEGORIES, NUTRIENT_KEYS } from "@/lib/db/types";
import { addFoodEntry, deleteFoodEntry, updateFoodEntry, type FoodInput } from "@/lib/db/repos";
import { useAction } from "@/hooks/use-action";
import { Dialog, DialogContent, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, numToInput, parseInputNumber } from "@/components/ui/input";
import { Callout, SourceBadge } from "@/components/ui/feedback";
import { MEAL_LABELS, NUTRIENT_LABELS, NUTRIENT_UNITS, fmt } from "@/lib/utils/format";
import { formatDay, isISODate } from "@/lib/utils/dates";
import { detectBrand } from "@/lib/parser/labels";

interface Draft {
  date: string;
  time: string;
  mealCategory: MealCategory;
  mealName: string;
  description: string;
  quantity: string;
  brand: string;
  foodScore: string;
  notes: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

function toDraft(e: FoodEntry | null, date: ISODate): Draft {
  return {
    date: e?.date ?? date,
    time: e?.time ?? "",
    mealCategory: e?.mealCategory ?? "breakfast",
    mealName: e?.mealName ?? "",
    description: e?.description ?? "",
    quantity: e?.quantity ?? "",
    brand: e?.brand ?? "",
    foodScore: numToInput(e?.foodScore),
    notes: e?.notes ?? "",
    calories: numToInput(e?.calories),
    protein: numToInput(e?.protein),
    carbs: numToInput(e?.carbs),
    fat: numToInput(e?.fat),
    fiber: numToInput(e?.fiber),
  };
}

/**
 * Add, view, edit or delete a food entry. Imported entries keep their
 * provenance; any change marks them "Corrected" and preserves the original.
 */
export function FoodEntryDialog({
  open,
  onOpenChange,
  entry,
  date,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry: FoodEntry | null;
  date: ISODate;
}) {
  const [d, setD] = React.useState<Draft>(() => toDraft(entry, date));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { run, busy } = useAction();

  React.useEffect(() => {
    if (open) {
      setD(toDraft(entry, date));
      setErrors({});
    }
  }, [open, entry, date]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }));

  const validate = (): FoodInput | null => {
    const errs: Record<string, string> = {};
    if (!isISODate(d.date)) errs.date = "Enter a valid date.";
    if (!d.mealName.trim()) errs.mealName = "Food name is required.";
    const nums: Partial<Record<NutrientKey, number | null>> = {};
    for (const k of NUTRIENT_KEYS) {
      const v = parseInputNumber(d[k]);
      if (v !== null && (!Number.isFinite(v) || v < 0)) errs[k] = "Must be a non-negative number.";
      nums[k] = v;
    }
    const score = parseInputNumber(d.foodScore);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) errs.foodScore = "Score is 0–10.";
    if (NUTRIENT_KEYS.every((k) => nums[k] === null)) errs.calories = "Enter at least one nutrition value.";
    setErrors(errs);
    if (Object.keys(errs).length) return null;
    return {
      date: d.date,
      time: d.time || null,
      mealCategory: d.mealCategory,
      mealLabel: entry?.mealLabel ?? null,
      mealName: d.mealName.trim(),
      description: d.description.trim() || null,
      quantity: d.quantity.trim() || null,
      brand: d.brand.trim() || detectBrand(d.mealName, d.description) || null,
      foodScore: score,
      foodScoreScale: score === null ? null : (entry?.foodScoreScale ?? 10),
      notes: d.notes.trim() || null,
      calories: nums.calories ?? null,
      protein: nums.protein ?? null,
      carbs: nums.carbs ?? null,
      fat: nums.fat ?? null,
      fiber: nums.fiber ?? null,
    };
  };

  const save = async () => {
    const input = validate();
    if (!input) return;
    const r = await run(
      () => (entry ? updateFoodEntry(entry.id, input) : addFoodEntry(input).then(() => undefined)),
      entry ? "Entry updated" : "Entry added",
    );
    if (r.ok) onOpenChange(false);
  };

  const remove = async () => {
    if (!entry) return;
    const r = await run(() => deleteFoodEntry(entry.id), "Entry deleted");
    setConfirmDelete(false);
    if (r.ok) onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          wide
          title={entry ? entry.mealName : "Add food entry"}
          description={entry ? formatDay(entry.date) : "Values you leave blank are stored as missing, not zero."}
        >
          {entry ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <SourceBadge source={entry.source} corrected={entry.corrected} />
              {entry.mealLabel ? <span>Report label: {entry.mealLabel}</span> : null}
              {entry.approximateFields.length ? <span>Approximate in report: {entry.approximateFields.join(", ")}</span> : null}
            </div>
          ) : null}
          {entry?.corrected && entry.original ? (
            <Callout tone="info" title="Corrected from the imported values" className="mb-4">
              {entry.correctedFields.map((f) => (
                <span key={f} className="mr-3 inline-block">
                  {NUTRIENT_LABELS[f] ?? f}: {String((entry.original as Record<string, unknown>)[f] ?? "—")} → {String((entry as unknown as Record<string, unknown>)[f] ?? "—")}
                </span>
              ))}
            </Callout>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4"
          >
            <Field label="Food name" htmlFor="fe-name" error={errors.mealName} className="col-span-2 sm:col-span-4">
              <Input id="fe-name" value={d.mealName} onChange={set("mealName")} aria-invalid={!!errors.mealName} autoFocus={!entry} />
            </Field>
            <Field label="Date" htmlFor="fe-date" error={errors.date} className="col-span-1">
              <Input id="fe-date" type="date" value={d.date} onChange={set("date")} />
            </Field>
            <Field label="Time" htmlFor="fe-time" className="col-span-1">
              <Input id="fe-time" type="time" value={d.time} onChange={set("time")} />
            </Field>
            <Field label="Meal" htmlFor="fe-cat" className="col-span-2">
              <Select id="fe-cat" value={d.mealCategory} onChange={set("mealCategory")}>
                {MEAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {MEAL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            {NUTRIENT_KEYS.map((k) => (
              <Field key={k} label={`${NUTRIENT_LABELS[k]} (${NUTRIENT_UNITS[k]})`} htmlFor={`fe-${k}`} error={errors[k]} className="col-span-1">
                <Input id={`fe-${k}`} inputMode="decimal" value={d[k]} onChange={set(k)} placeholder="—" aria-invalid={!!errors[k]} />
              </Field>
            ))}
            <Field label="Score (0–10)" htmlFor="fe-score" error={errors.foodScore} className="col-span-1">
              <Input id="fe-score" inputMode="decimal" value={d.foodScore} onChange={set("foodScore")} placeholder="—" />
            </Field>
            <Field label="Quantity" htmlFor="fe-qty" className="col-span-2">
              <Input id="fe-qty" value={d.quantity} onChange={set("quantity")} placeholder="e.g. 1 katori (150 g)" />
            </Field>
            <Field label="Brand" htmlFor="fe-brand" className="col-span-2">
              <Input id="fe-brand" value={d.brand} onChange={set("brand")} placeholder="Optional" />
            </Field>
            <Field label="Description" htmlFor="fe-desc" className="col-span-2 sm:col-span-4">
              <Textarea id="fe-desc" value={d.description} onChange={set("description")} rows={2} />
            </Field>
            <Field label="Notes" htmlFor="fe-notes" className="col-span-2 sm:col-span-4">
              <Input id="fe-notes" value={d.notes} onChange={set("notes")} />
            </Field>
            {entry && (entry.protein !== null || entry.calories !== null) ? (
              <p className="col-span-2 text-[12px] text-faint sm:col-span-4">
                Macro-derived energy: {fmt((parseInputNumber(d.protein) ?? 0) * 4 + (parseInputNumber(d.carbs) ?? 0) * 4 + (parseInputNumber(d.fat) ?? 0) * 9)} kcal (protein×4 + carbs×4 + fat×9).
              </p>
            ) : null}
            <div className="col-span-2 mt-1 flex flex-col-reverse gap-2 sm:col-span-4 sm:flex-row sm:items-center sm:justify-between">
              {entry ? (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-bad hover:text-bad">
                  <Trash2 /> Delete entry
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2 sm:justify-end">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={busy}>
                  {entry ? "Save changes" : "Add entry"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this food entry?"
        description={entry ? `${entry.mealName} will be removed from ${formatDay(entry.date)}. Daily totals update immediately.` : undefined}
        confirmLabel="Delete entry"
        onConfirm={remove}
        busy={busy}
      />
    </>
  );
}
