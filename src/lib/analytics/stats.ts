/** Small numeric helpers that treat null as "no data", never as zero. */

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function sum(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0);
}

export function maxBy<T>(items: T[], f: (t: T) => number | null): T | null {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const it of items) {
    const v = f(it);
    if (v !== null && v > bestV) {
      best = it;
      bestV = v;
    }
  }
  return best;
}

export function minBy<T>(items: T[], f: (t: T) => number | null): T | null {
  let best: T | null = null;
  let bestV = Infinity;
  for (const it of items) {
    const v = f(it);
    if (v !== null && v < bestV) {
      best = it;
      bestV = v;
    }
  }
  return best;
}

/** Ordinary least-squares slope of y over x. Null when fewer than two points or no spread. */
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const my = points.reduce((a, p) => a + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Population standard deviation. */
export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ??= []).push(it);
  }
  return out;
}
