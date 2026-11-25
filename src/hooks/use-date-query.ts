"use client";
import { useEffect } from "react";
import { useUI } from "@/stores/ui-store";
import { isISODate } from "@/lib/utils/dates";

/**
 * Honour a `?date=yyyy-MM-dd` deep link once on mount. Read from
 * window.location (not useSearchParams) so static export needs no Suspense
 * boundary. Dates in URLs are not personal health data.
 */
export function useDateFromQuery() {
  const setDate = useUI((s) => s.setSelectedDate);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && isISODate(d)) setDate(d);
  }, [setDate]);
}
