import { cn } from "@/lib/utils/cn";

/**
 * Horizontal progress toward a target. Values above 100% extend into an
 * overflow segment rather than breaking the bar.
 */
export function ProgressBar({
  value,
  target,
  color,
  className,
  label,
}: {
  value: number | null;
  target: number | null;
  color: string;
  className?: string;
  label: string;
}) {
  const ratio = value !== null && target ? value / target : 0;
  const main = Math.min(ratio, 1);
  const over = ratio > 1 ? Math.min(ratio - 1, 1) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target ?? undefined}
      aria-valuenow={value ?? undefined}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${main * 100}%`, background: color }} />
      {over > 0 ? (
        <div
          className="absolute inset-y-0 right-0 rounded-full opacity-90"
          style={{ width: `${(over / (1 + over)) * 100}%`, background: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)` }}
          title="Above target"
        />
      ) : null}
    </div>
  );
}
