"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardPaste, Eraser, FileSearch, History, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseReport, validateReport, type ParsedReport } from "@/lib/parser";
import { checkDuplicates, commitImport, deleteImport, type CommitResult, type DuplicateCheck, type ImportMode } from "@/lib/import/persist";
import { useImports, useWeights } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { useUI } from "@/stores/ui-store";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { ImportPreview } from "@/components/import/import-preview";
import { formatDay } from "@/lib/utils/dates";
import { fmt } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { DailyImport } from "@/lib/db/types";

export function ImportView() {
  const router = useRouter();
  const setDate = useUI((s) => s.setSelectedDate);
  const [text, setText] = React.useState("");
  const [report, setReport] = React.useState<ParsedReport | null>(null);
  const [parsedText, setParsedText] = React.useState("");
  const [dup, setDup] = React.useState<DuplicateCheck | null>(null);
  const [mode, setMode] = React.useState<ImportMode | null>(null);
  const [totalsChoice, setTotalsChoice] = React.useState<"calculated" | "reported">("calculated");
  const [recordWeight, setRecordWeight] = React.useState(true);
  const [result, setResult] = React.useState<CommitResult | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { run, busy } = useAction();
  const weights = useWeights();

  const validation = React.useMemo(() => (report ? validateReport(report) : null), [report]);
  const stale = report !== null && text !== parsedText;

  const preview = React.useCallback(
    (source = text) => {
      if (!source.trim()) {
        toast.error("Paste a report first.");
        return;
      }
      const r = parseReport(source);
      setReport(r);
      setParsedText(source);
      setResult(null);
      setMode(null);
      setTotalsChoice("calculated");
    },
    [text],
  );

  // Re-check duplicates whenever the date or entries change.
  React.useEffect(() => {
    if (!report?.metadata.date) {
      setDup(null);
      return;
    }
    let cancelled = false;
    checkDuplicates(report, parsedText).then((d) => {
      if (cancelled) return;
      setDup(d);
      setMode((m) => (d.sameDate.length ? (m === "new" ? null : m) : "new"));
    });
    return () => {
      cancelled = true;
    };
  }, [report, parsedText]);

  // Default for the weight checkbox: skip when it just repeats the last recorded weight.
  const weightHint = React.useMemo(() => {
    if (!report?.metadata.weightKg || !weights) return null;
    if (dup?.existingWeight) return `A weigh-in already exists for this date (${dup.existingWeight.weightKg} kg); it will be kept.`;
    const prior = weights.filter((w) => report.metadata.date && w.date < report.metadata.date).at(-1);
    if (prior && prior.weightKg === report.metadata.weightKg) {
      return `This matches your previous weigh-in (${prior.weightKg} kg on ${formatDay(prior.date, "d MMM")}). Reports often repeat the profile weight; only keep this if you weighed in.`;
    }
    return null;
  }, [report, weights, dup]);

  React.useEffect(() => {
    if (!report?.metadata.weightKg || !weights) return;
    const prior = weights.filter((w) => report.metadata.date && w.date < report.metadata.date).at(-1);
    setRecordWeight(!(prior && prior.weightKg === report.metadata.weightKg));
    // Only when a new report is previewed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedText]);

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast.error("The clipboard is empty.");
      setText(t);
      preview(t);
    } catch {
      toast.error("Clipboard access was blocked. Paste into the box with Ctrl/Cmd + V instead.");
    }
  };

  const doImport = async () => {
    if (!report || !mode || !validation?.canImport) return;
    const r = await run(() => commitImport({ report, rawText: parsedText, mode, totalsChoice, recordWeight }), "Report imported");
    setConfirmOpen(false);
    if (r.ok) {
      setResult(r.value);
      setReport(null);
      setText("");
      setParsedText("");
      setDup(null);
    }
  };

  const needsChoice = !!dup?.sameDate.length;
  const canImport = !!report && !!validation?.canImport && !stale && !!mode && !busy;

  return (
    <div>
      <PageHeader title="Import Daily Report" description="Paste the daily journal Gemini produced from your food photos. EVOLV reads it on this device. Nothing is uploaded." />

      {result ? (
        <Callout tone="good" title={`Imported ${formatDay(result.date)}`} className="mb-4">
          <p>
            {result.added.food} food entr{result.added.food === 1 ? "y" : "ies"} added
            {result.skipped.food ? `, ${result.skipped.food} already present and skipped` : ""}
            {result.added.activity ? ", activity saved" : ""}
            {result.added.workouts ? `, ${result.added.workouts} workout(s)` : ""}
            {result.added.weight ? ", weigh-in recorded" : ""}.
            {result.replacedImports ? ` Replaced the earlier import (${result.removedFood} entries removed; its original text is kept in history).` : ""}
            {result.skipped.activityFields.length ? ` Kept existing activity values for: ${result.skipped.activityFields.join(", ")}.` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => { setDate(result.date); router.push("/journal/"); }}>
              View in Food Journal
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDate(result.date); router.push("/"); }}>
              Open Overview
            </Button>
          </div>
        </Callout>
      ) : null}

      <Card>
        <CardBody className="pt-5">
          <label htmlFor="report-text" className="sr-only">
            Report text
          </label>
          <Textarea
            id="report-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              if (t && !text.trim()) {
                e.preventDefault();
                setText(t);
                preview(t);
              }
            }}
            placeholder={"Paste your daily report here.\n\nExample:\nDate: Wednesday, 25 November 2026\n### Entry 1 — 8:10 AM | Breakfast\nMeal: Masala oats with boiled eggs\nCalories: 345 kcal | Protein: 19.5 g | Carbs: 34 g | Fat: 13.5 g | Fiber: 4.5 g"}
            className="min-h-[240px] font-mono text-[13px]"
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={pasteFromClipboard}>
              <ClipboardPaste /> Paste from clipboard
            </Button>
            <Button variant="secondary" onClick={() => preview()} disabled={!text.trim()}>
              <FileSearch /> Preview
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setText("");
                setReport(null);
                setParsedText("");
                setDup(null);
                setResult(null);
              }}
              disabled={!text && !report}
            >
              <Eraser /> Clear
            </Button>
            <span className="ml-auto text-[12px] text-faint tabular">{text ? `${text.split("\n").length} lines` : ""}</span>
          </div>
          {stale ? <p className="mt-2 text-[12.5px] text-warn">The text changed since the preview. Preview again before importing.</p> : null}
        </CardBody>
      </Card>

      {report && validation ? (
        <div className="mt-5 space-y-4">
          {dup && (dup.identical || dup.sameContent || dup.sameDate.length) ? (
            <DuplicatePanel dup={dup} mode={mode} setMode={setMode} />
          ) : dup && dup.existingManualFoodCount ? (
            <Callout tone="info">
              {dup.existingManualFoodCount} manually added entr{dup.existingManualFoodCount === 1 ? "y" : "ies"} already exist for this date. They will be kept alongside the imported entries.
            </Callout>
          ) : null}

          <ImportPreview
            report={report}
            validation={validation}
            onChange={setReport}
            totalsChoice={totalsChoice}
            setTotalsChoice={setTotalsChoice}
            recordWeight={recordWeight}
            setRecordWeight={setRecordWeight}
            weightHint={weightHint}
          />

          <div className="sticky bottom-20 z-20 flex flex-col gap-2 rounded-[14px] border border-line bg-surface/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
            <p className="text-[13px] text-muted">
              {!validation.canImport
                ? "Fix the problems above to import."
                : needsChoice && !mode
                  ? "Choose replace or merge above."
                  : `${validation.includedEntries} entries for ${report.metadata.date ? formatDay(report.metadata.date) : "this date"}${mode && mode !== "new" ? ` (${mode})` : ""}`}
            </p>
            <Button variant="primary" size="lg" disabled={!canImport} onClick={() => (mode === "replace" ? setConfirmOpen(true) : void doImport())}>
              <Upload /> Import report
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the earlier import?"
        description="Food entries, activity, workouts and weigh-ins created by the earlier import for this date will be removed, including any corrections you made to them. Manually added records are kept. The earlier report's original text stays in import history."
        confirmLabel="Replace and import"
        onConfirm={doImport}
        busy={busy}
      />

      <ImportHistory />
    </div>
  );
}

function DuplicatePanel({ dup, mode, setMode }: { dup: DuplicateCheck; mode: ImportMode | null; setMode: (m: ImportMode | null) => void }) {
  const prev = dup.sameDate[0];
  return (
    <Card className="border-warn/50">
      <CardHeader
        title={dup.identical ? "This exact report was already imported" : dup.sameContent ? "This day's entries were already imported" : "A report for this date already exists"}
        description={
          prev
            ? `Imported ${new Date(prev.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}, with ${fmt(prev.calculatedTotals.calories)} kcal across the earlier entries. ${dup.existingFoodCount} food entries are stored for this date.`
            : undefined
        }
      />
      <CardBody>
        {dup.sameDate.length ? (
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How to handle the existing import">
            {(
              [
                ["merge", "Merge", "Keep everything and add only entries that are not already there."],
                ["replace", "Replace", "Remove what the earlier import added for this date, then import this report."],
              ] as const
            ).map(([m, label, body]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded-[10px] border p-3 text-left text-[13px] transition-colors", mode === m ? "border-accent-text bg-surface-2" : "border-line hover:bg-surface-2")}
              >
                <span className="font-semibold">{label}</span>
                <span className="mt-0.5 block text-muted">{body}</span>
              </button>
            ))}
            <Link href="/" className="rounded-[10px] border border-line p-3 text-left text-[13px] hover:bg-surface-2">
              <span className="font-semibold">Cancel</span>
              <span className="mt-0.5 block text-muted">Leave the stored data as it is.</span>
            </Link>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ImportHistory() {
  const imports = useImports();
  const setDate = useUI((s) => s.setSelectedDate);
  const router = useRouter();
  const [viewing, setViewing] = React.useState<DailyImport | null>(null);
  const [deleting, setDeleting] = React.useState<DailyImport | null>(null);
  const { run, busy } = useAction();
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <History className="size-4 text-muted" /> Import history
      </h2>
      {imports === undefined ? null : imports.length === 0 ? (
        <EmptyState title="No reports imported yet" body="Each import keeps its original text here for reference." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {imports.map((imp) => (
              <li key={imp.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDay(imp.date)}
                    {imp.status === "replaced" ? (
                      <Badge tone="outline" className="ml-2">
                        Replaced
                      </Badge>
                    ) : (
                      <Badge tone="good" className="ml-2">
                        <CheckCircle2 /> Active
                      </Badge>
                    )}
                  </p>
                  <p className="tabular text-[12.5px] text-muted">
                    {fmt(imp.calculatedTotals.calories)} kcal, {fmt(imp.calculatedTotals.protein, { decimals: 1 })} g protein, imported {new Date(imp.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    {imp.mode !== "new" ? ` (${imp.mode})` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(imp)}>
                    Original text
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setDate(imp.date); router.push("/journal/"); }}>
                    Open day
                  </Button>
                  {imp.status === "active" ? (
                    <Button size="icon" variant="ghost" aria-label={`Delete import for ${imp.date}`} onClick={() => setDeleting(imp)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent wide title={viewing ? `Report for ${formatDay(viewing.date)}` : ""} description="Exactly as pasted. Kept for audit.">
          <pre className="whitespace-pre-wrap break-words rounded-[10px] bg-surface-2 p-4 font-mono text-[12px] text-muted">{viewing?.rawText}</pre>
          {viewing?.warnings.length ? (
            <Callout tone="warn" title="Warnings at import time" className="mt-3">
              <ul className="list-disc pl-4">
                {viewing.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this import?"
        description={deleting ? `Removes the food entries, activity, workouts and weigh-in that the ${formatDay(deleting.date)} import created, plus the stored report text. Manually added records are kept. This cannot be undone.` : undefined}
        confirmLabel="Delete import"
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          await run(() => deleteImport(deleting.id), "Import deleted");
          setDeleting(null);
        }}
      />
    </section>
  );
}
