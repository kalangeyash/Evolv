"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUI } from "@/stores/ui-store";
import { formatDay, isISODate, shiftDate, todayISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

/** Global day selector: previous / next / today, plus a native date picker. */
export function DateSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const date = useUI((s) => s.selectedDate);
  const setDate = useUI((s) => s.setSelectedDate);
  const today = todayISO();
  const isToday = date === today;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Previous day">
        <ChevronLeft className="size-4" />
      </button>
      <label className="relative cursor-pointer rounded-md px-2 py-1 text-[13.5px] font-medium text-text hover:bg-surface-2">
        <span>{isToday ? `Today, ${formatDay(date, "d MMM")}` : formatDay(date, compact ? "d MMM yyyy" : "EEE, d MMM yyyy")}</span>
        <input
          type="date"
          value={date}
          aria-label="Choose date"
          onChange={(e) => isISODate(e.target.value) && setDate(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Next day">
        <ChevronRight className="size-4" />
      </button>
      {!isToday ? (
        <button type="button" onClick={() => setDate(today)} className="ml-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent-text hover:bg-surface-2">
          Today
        </button>
      ) : null}
    </div>
  );
}
