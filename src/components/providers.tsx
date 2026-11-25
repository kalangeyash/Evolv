"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import { getDb, requestPersistentStorage } from "@/lib/db/db";
import { useSettings } from "@/hooks/use-data";
import { daysBetween, todayISO, toISODate } from "@/lib/utils/dates";

export const THEME_KEY = "evolv-theme";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Inline script run before paint so the stored theme applies without a flash. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

export function applyTheme(theme: "dark" | "light" | "system") {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be blocked; theme still applies for this session */
  }
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101211" : "#f3f4ef");
}

function ThemeSync() {
  const settings = useSettings();
  React.useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme);
  }, [settings?.theme]);
  return null;
}

function BackupReminder() {
  const settings = useSettings();
  const router = useRouter();
  const shown = React.useRef(false);
  React.useEffect(() => {
    if (!settings || shown.current || settings.backupReminderDays <= 0) return;
    const last = settings.lastBackupAt ? toISODate(new Date(settings.lastBackupAt)) : null;
    const since = last ? daysBetween(last, todayISO()) : null;
    const created = toISODate(new Date(settings.createdAt));
    const age = daysBetween(created, todayISO());
    if ((since === null && age >= settings.backupReminderDays) || (since !== null && since >= settings.backupReminderDays)) {
      shown.current = true;
      toast(since === null ? "You have not backed up EVOLV yet" : `Last backup was ${since} days ago`, {
        description: "Your data lives only in this browser. Export a backup to keep it safe.",
        action: { label: "Back up", onClick: () => router.push("/data/") },
        duration: 12000,
      });
    }
  }, [settings, router]);
  return null;
}

function ServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).then((reg) => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            toast("A new version of EVOLV is ready", {
              action: { label: "Reload", onClick: () => window.location.reload() },
              duration: 20000,
            });
          }
        });
      });
    }).catch(() => {
      /* offline support unavailable; the app still works online */
    });
  }, []);
  return null;
}

type DbState = "checking" | "ready" | "error";

/** Opens IndexedDB once and blocks the UI with an explanation if it is unavailable. */
function DatabaseGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DbState>("checking");
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    getDb()
      .open()
      .then(() => {
        setState("ready");
        void requestPersistentStorage();
      })
      .catch((err: Error) => {
        setState("error");
        setMessage(err?.message ?? "Unknown error");
      });
  }, []);
  if (state === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-[14px] border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-semibold">EVOLV cannot open its local database</h1>
          <p className="mt-2 text-sm text-muted">
            EVOLV stores everything in this browser&apos;s IndexedDB. It is unavailable, which usually happens in private browsing or when site storage is blocked.
            Open EVOLV in a normal window or allow site data, then reload.
          </p>
          <p className="mt-3 rounded-md bg-surface-2 p-2 text-xs text-faint">{message}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent-text" onClick={() => window.location.reload()}>
            Reload
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DatabaseGate>
      <ThemeSync />
      <BackupReminder />
      <ServiceWorker />
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "!bg-surface !border-line !text-text !rounded-[12px] !shadow-xl",
            description: "!text-muted",
            actionButton: "!bg-accent !text-accent-ink !font-semibold",
          },
        }}
      />
    </DatabaseGate>
  );
}
