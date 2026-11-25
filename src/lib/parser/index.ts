import { parseReportStructure } from "./parse";
import { normalizeReport, type NormalizeOptions, type ParsedReport } from "./normalize";

export { validateReport, sumEntries, compareTotals } from "./validate";
export type { ValidationResult, TotalComparison, TotalStatus } from "./validate";
export { contentHash, reportFingerprint, entrySignature, normalizeFoodName } from "./fingerprint";
export { PARSER_VERSION } from "./normalize";
export type { ParsedReport, ParsedEntry, ParsedActivity, ParsedWorkout, Issue } from "./normalize";

/** Parse pasted report text into a typed, reviewable ParsedReport. Pure and deterministic. */
export function parseReport(text: string, opts?: NormalizeOptions): ParsedReport {
  return normalizeReport(parseReportStructure(text), opts);
}
