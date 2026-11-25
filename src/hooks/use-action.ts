"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { describeDbError } from "@/lib/db/db";
import { ValidationError } from "@/lib/db/repos";

export type ActionResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Run a mutation with consistent feedback: a success toast, or an error
 * toast whose text tells the user what happened. Never fails silently.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<ActionResult<T>> => {
    setBusy(true);
    try {
      const value = await fn();
      if (success) toast.success(success);
      return { ok: true, value };
    } catch (err) {
      const msg = err instanceof ValidationError || (err as Error)?.name === "ImportBlockedError" ? (err as Error).message : describeDbError(err);
      toast.error(msg);
      if (process.env.NODE_ENV !== "production") console.error(err);
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy };
}
