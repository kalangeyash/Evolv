/** Stable random identifier for records. */
export function newId(prefix = ""): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * cyrb53-based 106-bit hash (two seeded 53-bit halves) rendered as hex.
 * Used for duplicate detection fingerprints — not for security.
 * Synchronous and deterministic in every environment (browser, worker, Node).
 */
export function hashString(input: string): string {
  const cyrb53 = (str: string, seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  return (
    cyrb53(input, 0).toString(16).padStart(14, "0") +
    cyrb53(input, 0x9e3779b9).toString(16).padStart(14, "0")
  );
}
