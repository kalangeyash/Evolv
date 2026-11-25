/**
 * Low-level, side-effect-free text utilities for the report parser.
 * Everything here is deterministic and independently testable.
 */

/* --------------------------------------------------------------- cleaning */

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Normalise unicode punctuation and whitespace so later regexes stay simple. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[     ]/g, " ")
    .replace(/[​⁠﻿]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚′]/g, "'")
    .replace(/″/g, '"')
    .replace(/[‐‑‒]/g, "-")
    .replace(/\t/g, "  ");
}

/**
 * Strip markdown/emoji decoration from one line while keeping its content.
 * Returns the cleaned text plus structural hints the parser needs.
 */
export interface CleanLine {
  text: string;
  /** Markdown heading level (1–6) or 0. */
  heading: number;
  /** Line was entirely bold (e.g. "**Daily Totals**"), often a section title. */
  boldOnly: boolean;
  bullet: boolean;
  isTableRow: boolean;
  isRule: boolean;
}

export function cleanLine(raw: string): CleanLine {
  const trimmed = raw.trim();
  const isTableRow = /^\|.*\|?\s*$/.test(trimmed) && trimmed.split("|").length >= 3;
  const isRule = /^([-=_*━─—]\s*){3,}$/.test(trimmed);
  let text = trimmed;
  let heading = 0;
  const h = /^(#{1,6})\s*/.exec(text);
  if (h) {
    heading = h[1].length;
    text = text.slice(h[0].length);
  }
  const boldOnly = /^\*\*[^*]+\*\*:?$/.test(text) || /^__[^_]+__:?$/.test(text);
  let bullet = false;
  const b = /^([-*•·▪►➤]|•)\s+/.exec(text);
  if (b) {
    bullet = true;
    text = text.slice(b[0].length);
  }
  text = text
    .replace(EMOJI_RE, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$)/g, "$1$2")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Leading bullet may appear after emoji removal ("✅ - item").
  const b2 = /^([-*•·▪►➤])\s+/.exec(text);
  if (b2) {
    bullet = true;
    text = text.slice(b2[0].length);
  }
  return { text, heading, boldOnly, bullet, isTableRow, isRule };
}

/* ---------------------------------------------------------------- numbers */

export interface ParsedNumber {
  value: number;
  approximate: boolean;
  /** Present when the source gave a range like "340–360"; value is the midpoint. */
  range: [number, number] | null;
  /** Source said "<1" or ">2"; value is the stated bound. */
  bound: "lt" | "gt" | null;
}

const NUM = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+`;
const APPROX = String.raw`(?:~|≈|±|approx(?:imately|\.)?|about|around|roughly|est(?:imated|\.)?|ca\.?|nearly)`;

export const MISSING_RE = /^(?:n\/?a|na|none reported|not (?:available|reported|provided|specified|known)|unknown|unavailable|-|—|–|\?|tbd|nil)$/i;

export function toNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

/**
 * Parse the first numeric quantity in a string.
 * Handles "1,757", "~340", "approx. 12.5", "340-360", "<1".
 * Returns null when no number is present or the value is a missing marker.
 */
export function parseNumber(raw: string | null | undefined): ParsedNumber | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s || MISSING_RE.test(s.replace(/[.\s]+$/, ""))) return null;
  const re = new RegExp(
    String.raw`(${APPROX}\s*)?([<>]\s*)?(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?`,
    "i",
  );
  const m = re.exec(s);
  if (!m) return null;
  const a = toNumber(m[3]);
  if (!Number.isFinite(a)) return null;
  const approxWord = !!m[1] || /\b(?:approx|estimate|est\.|about|around|roughly)\b|~|≈/i.test(s);
  if (m[4]) {
    const b = toNumber(m[4]);
    if (Number.isFinite(b) && b >= a) {
      return { value: (a + b) / 2, approximate: true, range: [a, b], bound: null };
    }
  }
  const bound = m[2] ? (m[2].trim() === "<" ? "lt" : "gt") : null;
  return { value: a, approximate: approxWord || !!bound, range: null, bound };
}

/** True when a value string explicitly says the data is missing. */
export function isMissingMarker(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return MISSING_RE.test(raw.trim().replace(/[.\s]+$/, ""));
}

/* ------------------------------------------------------------------ dates */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|rsday|urday)?\b/i;

export interface ParsedDate {
  iso: string;
  /** Explanations of assumptions made (ambiguous order, assumed year). */
  notes: string[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Find a calendar date in free text. Numeric dates are read as DD/MM/YYYY
 * (the Indian convention) unless that is impossible.
 * `fallbackYear` is used only when the text omits the year, and that
 * assumption is reported in `notes`.
 */
export function parseDateText(s: string, fallbackYear?: number): ParsedDate | null {
  const text = s.replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) {
    const iso = validYmd(+m[1], +m[2], +m[3]);
    if (iso) return { iso, notes: [] };
  }
  m = new RegExp(String.raw`\b(\d{1,2})\s+(?:of\s+)?${MONTH_RE}\.?,?\s+(\d{4})\b`, "i").exec(text);
  if (m) {
    const iso = validYmd(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
    if (iso) return { iso, notes: [] };
  }
  m = new RegExp(String.raw`\b${MONTH_RE}\.?\s+(\d{1,2}),?\s+(\d{4})\b`, "i").exec(text);
  if (m) {
    const iso = validYmd(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if (iso) return { iso, notes: [] };
  }
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    const notes: string[] = [];
    let iso = validYmd(y, b, a); // DD/MM
    if (iso && a <= 12 && b <= 12 && a !== b) {
      notes.push(`“${m[0]}” is ambiguous; read as day/month (Indian format).`);
    }
    if (!iso) {
      iso = validYmd(y, a, b); // MM/DD
      if (iso) notes.push(`“${m[0]}” read as month/day because day/month is impossible.`);
    }
    if (iso) return { iso, notes };
  }
  if (fallbackYear) {
    m = new RegExp(String.raw`\b(\d{1,2})\s+(?:of\s+)?${MONTH_RE}\b|\b${MONTH_RE}\.?\s+(\d{1,2})\b`, "i").exec(text);
    if (m) {
      const day = m[1] ? +m[1] : +m[4];
      const mon = MONTHS[(m[2] ?? m[3]).slice(0, 3).toLowerCase()];
      const iso = validYmd(fallbackYear, mon, day);
      if (iso) return { iso, notes: [`The report does not state a year; assumed ${fallbackYear}.`] };
    }
  }
  return null;
}

export function findWeekday(s: string): string | null {
  const m = WEEKDAY_RE.exec(s);
  if (!m) return null;
  const k = m[1].slice(0, 3).toLowerCase();
  return WEEKDAYS.find((d) => d.slice(0, 3).toLowerCase() === k) ?? null;
}

/* ------------------------------------------------------------------ times */

/**
 * Extract a clock time as "HH:mm". Accepts "8:10 AM", "8.10am", "8 pm",
 * "20:30", "20:30 hrs", "noon", "midnight". Returns null when absent.
 */
export function parseTimeText(s: string): string | null {
  const t = s.toLowerCase();
  let m = /\b(\d{1,2})[:.](\d{2})\s*([ap])\.?\s*m\b\.?/.exec(t);
  if (m) return to24(+m[1], +m[2], m[3]);
  m = /\b(\d{1,2})\s*([ap])\.?\s*m\b\.?/.exec(t);
  if (m) return to24(+m[1], 0, m[2]);
  m = /(?:^|[^\d.])([01]?\d|2[0-3]):([0-5]\d)(?![\d.])/.exec(t);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = /\b([01]?\d|2[0-3])\.([0-5]\d)\s*(?:hrs?|h)\b/.exec(t);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = /\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?|h)\b/.exec(t);
  if (m) return `${m[1]}:${m[2]}`;
  if (/\bnoon\b/.test(t)) return "12:00";
  if (/\bmidnight\b/.test(t)) return "00:00";
  return null;
}

function to24(h: number, min: number, ap: string): string | null {
  if (h < 1 || h > 12 || min > 59) return null;
  let hh = h % 12;
  if (ap === "p") hh += 12;
  return `${pad(hh)}:${pad(min)}`;
}

/** Remove time tokens from a string (used to tidy entry headers). */
export function stripTimes(s: string): string {
  return s
    .replace(/\b\d{1,2}[:.]\d{2}\s*[ap]\.?\s*m\b\.?/gi, " ")
    .replace(/\b\d{1,2}\s*[ap]\.?\s*m\b\.?/gi, " ")
    .replace(/(^|[^\d.])([01]?\d|2[0-3]):([0-5]\d)(\s*(?:hrs?|h)\b)?/g, "$1 ")
    .replace(/\b(?:at|@|around|approx\.?|~)\s*(?=[\s|,–—-]*$)/gi, " ");
}

/* --------------------------------------------------------------- duration */

/** Minutes from "46 min", "1 h 5 min", "1:05:30", "45:12" (mm:ss), "1.5 hours". */
export function parseDurationMinutes(s: string): number | null {
  const t = s.toLowerCase();
  let m = /\b(\d{1,2}):(\d{2}):(\d{2})\b/.exec(t);
  if (m) return round1(+m[1] * 60 + +m[2] + +m[3] / 60);
  const hm = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b(?:\s*(\d+)\s*(?:m|min|mins|minutes)\b)?/.exec(t);
  if (hm) return round1(parseFloat(hm[1]) * 60 + (hm[2] ? +hm[2] : 0));
  m = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes)\b(?!\w)/.exec(t);
  if (m) return round1(parseFloat(m[1]));
  m = /\b(\d{1,3}):(\d{2})\b/.exec(t);
  if (m && /min|duration|time/.test(t)) return round1(+m[1] + +m[2] / 60);
  return null;
}

/** Kilometres from "4.2 km", "2.6 mi", "800 m". */
export function parseDistanceKm(s: string): number | null {
  const t = s.toLowerCase();
  let m = new RegExp(String.raw`(${NUM})\s*(?:km|kms|kilomet(?:er|re)s?)\b`).exec(t);
  if (m) return round2(toNumber(m[1]));
  m = new RegExp(String.raw`(${NUM})\s*(?:mi|miles?)\b`).exec(t);
  if (m) return round2(toNumber(m[1]) * 1.609344);
  m = new RegExp(String.raw`(${NUM})\s*(?:m|met(?:er|re)s?)\b(?!\w)`).exec(t);
  if (m && !/min/.test(t.slice(m.index, m.index + m[0].length + 3))) return round2(toNumber(m[1]) / 1000);
  return null;
}

/** Kilograms from "90 kg", "198 lb". */
export function parseWeightKg(s: string): number | null {
  const t = s.toLowerCase();
  let m = new RegExp(String.raw`(${NUM})\s*(?:kg|kgs|kilo(?:gram)?s?)\b`).exec(t);
  if (m) return round1(toNumber(m[1]));
  m = new RegExp(String.raw`(${NUM})\s*(?:lb|lbs|pounds?)\b`).exec(t);
  if (m) return round1(toNumber(m[1]) * 0.45359237);
  const n = parseNumber(t);
  if (n && n.value >= 25 && n.value <= 350) return round1(n.value);
  return null;
}

/** Centimetres from "183 cm", "6'0\"", "6 ft 1 in", "6 feet". Prefers an explicit cm value. */
export function parseHeightCm(s: string): number | null {
  const t = s.toLowerCase();
  let m = new RegExp(String.raw`(${NUM})\s*cm\b`).exec(t);
  if (m) return round1(toNumber(m[1]));
  m = /(\d)\s*(?:'|ft|feet|foot)\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|''|in|inch|inches)?)?/.exec(t);
  if (m) return round1((+m[1] * 12 + (m[2] ? parseFloat(m[2]) : 0)) * 2.54);
  return null;
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
