import { cn } from "@/lib/utils/cn";

export interface RingSpec {
  key: string;
  label: string;
  value: number | null;
  goal: number | null;
  color: string;
  unit: string;
}

/**
 * Concentric activity rings. A ring past 100% keeps going round with a
 * darker overlap cap, so 140% reads as one full lap plus 40%.
 */
export function ActivityRings({ rings, size = 148, stroke = 14, className }: { rings: RingSpec[]; size?: number; stroke?: number; className?: string }) {
  const gap = 3;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0 -rotate-90", className)} role="img" aria-label={rings.map((r) => `${r.label} ${r.value ?? "no data"} of ${r.goal ?? "no goal"} ${r.unit}`).join(", ")}>
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + gap);
        const circ = 2 * Math.PI * radius;
        const ratio = r.value !== null && r.goal ? r.value / r.goal : 0;
        const first = Math.min(ratio, 1);
        const extra = ratio > 1 ? Math.min(ratio - 1, 1) : 0;
        return (
          <g key={r.key}>
            <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity={0.16} strokeWidth={stroke} />
            {r.value !== null && r.goal ? (
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${first * circ} ${circ}`} className="transition-[stroke-dasharray] duration-700" />
            ) : null}
            {extra > 0 ? (
              <circle
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                stroke={`color-mix(in oklab, ${r.color} 70%, black)`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${extra * circ} ${circ}`}
              >
                <title>{`${Math.round(ratio * 100)}% of goal`}</title>
              </circle>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Single circular progress indicator with centred content. */
export function CircleProgress({ value, target, color, size = 72, stroke = 7, children, label }: { value: number | null; target: number | null; color: string; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const r = size / 2 - stroke / 2;
  const circ = 2 * Math.PI * r;
  const ratio = value !== null && target ? Math.min(value / target, 1) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${ratio * circ} ${circ}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
}
