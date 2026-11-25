import { ArrowDown, ArrowUp } from "lucide-react";

/** Signed change with a direction icon, so direction never relies on colour. */
export function Delta({ value, unit }: { value: number; unit: string }) {
  if (Math.abs(value) < 0.005) return <span>0 {unit}</span>;
  const down = value < 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      {down ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />}
      {down ? "−" : "+"}
      {Math.abs(value).toFixed(2)} {unit}
    </span>
  );
}
