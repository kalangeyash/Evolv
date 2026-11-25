"use client";
import * as React from "react";
import Link from "next/link";
import { Toaster, toast } from "sonner";
import { useBackupStatus } from "@/components/backup-banner";
import { updateSettings } from "@/lib/db/repos";
import { notificationsSupported } from "@/lib/utils/platform";
import { getDb, requestPersistentStorage } from "@/lib/db/db";
import { useSettings } from "@/hooks/use-data";

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

/**
 * Optional system notification when a backup is due. Opt-in from Settings,
 * at most once every 20 hours, and only while EVOLV is open: without a
 * server, a static web app cannot wake itself up to notify.
 */
function BackupNotifier() {
  const s = useBackupStatus();
  React.useEffect(() => {
    if (!s?.status.due || !s.settings.backupNotifications) return;
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    const last = s.settings.lastBackupNotifiedAt ? Date.parse(s.settings.lastBackupNotifiedAt) : 0;
    if (Date.now() - last < 20 * 3600_000) return;
    const body = s.status.daysSince === null ? "You have not backed up EVOLV yet." : `Your last backup was ${s.status.daysSince} days ago.`;
    const show = async () => {
      const reg = await navigator.serviceWorker?.getRegistration?.(`${BASE}/`);
      if (reg) await reg.showNotification("EVOLV backup due", { body, icon: `${BASE}/icons/icon-192.png`, tag: "evolv-backup" });
      else new Notification("EVOLV backup due", { body, icon: `${BASE}/icons/icon-192.png`, tag: "evolv-backup" });
      await updateSettings({ lastBackupNotifiedAt: new Date().toISOString() });
    };
    void show().catch(() => undefined);
  }, [s]);
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
      <BackupNotifier />
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
