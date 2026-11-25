import { hashString } from "@/lib/utils/ids";
import type { ParsedEntry } from "./normalize";

/** Whitespace- and case-insensitive hash of the pasted text. */
export function contentHash(raw: string): string {
  return hashString(raw.replace(/\s+/g, " ").trim().toLowerCase());
}

export function normalizeFoodName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Signature used to recognise the same food entry across re-imports and merges. */
export function entrySignature(e: Pick<ParsedEntry, "time" | "mealName" | "calories">): string {
  return `${e.time ?? "--:--"}|${normalizeFoodName(e.mealName)}|${e.calories ?? "?"}`;
}

/**
 * Fingerprint of a report's *content*: date plus the sorted entry signatures.
 * Two differently formatted copies of the same day's journal share it.
 */
export function reportFingerprint(date: string, entries: Pick<ParsedEntry, "time" | "mealName" | "calories">[]): string {
  const sigs = entries.map(entrySignature).sort();
  return hashString(`${date}::${sigs.join("||")}`);
}
