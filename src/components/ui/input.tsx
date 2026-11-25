import * as React from "react";
import { cn } from "@/lib/utils/cn";

const field =
  "w-full rounded-[10px] border border-line bg-surface-2 px-3 text-[16px] sm:text-[14px] text-text placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent)_35%,transparent)] disabled:opacity-50 aria-[invalid=true]:border-bad";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(field, "h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23868d83' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)} {...props} />;
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-[12px] text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Convert an input string to number | null. Empty → null; invalid → NaN (caller validates). */
export function parseInputNumber(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  return Number(t.replace(/,/g, ""));
}

export function numToInput(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}
