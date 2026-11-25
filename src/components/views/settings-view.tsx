"use client";
import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { updateSettings, ValidationError } from "@/lib/db/repos";
import { DB_SCHEMA_VERSION } from "@/lib/db/db";
import { PARSER_VERSION } from "@/lib/parser";
import { applyTheme } from "@/components/providers";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/feedback";
import { Field, Input, parseInputNumber } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils/cn";
import { InstallGuide } from "@/components/install-guide";
import { isIOS, isStandalone, notificationsSupported } from "@/lib/utils/platform";

export function SettingsView() {
  const settings = useSettings();
  const { run } = useAction();
  const [tol, setTol] = React.useState("");
  const [remind, setRemind] = React.useState("");
  const [storage, setStorage] = React.useState<{ persisted: boolean | null; usage: number | null; quota: number | null }>({ persisted: null, usage: null, quota: null });
  React.useEffect(() => {
    if (settings) {
      setTol(String(settings.calorieTolerancePct));
      setRemind(String(settings.backupReminderDays));
    }
  }, [settings]);
  React.useEffect(() => {
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
    })().catch(() => undefined);
  }, []);
  if (!settings) return <LoadingBlock />;

  const themes = [
    { v: "dark", label: "Dark", icon: Moon },
    { v: "light", label: "Light", icon: Sun },
    { v: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appearance" />
          <CardBody>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {themes.map((t) => (
                <button
                  key={t.v}
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === t.v}
                  onClick={() => {
                    applyTheme(t.v);
                    void run(() => updateSettings({ theme: t.v }));
                  }}
                  className={cn("flex flex-col items-center gap-2 rounded-[12px] border p-4 text-[13px] font-medium", settings.theme === t.v ? "border-accent-text bg-surface-2" : "border-line hover:bg-surface-2")}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Analytics" />
          <CardBody className="space-y-4">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseInputNumber(tol);
                if (n === null || !Number.isFinite(n) || n < 1 || n > 25) return void run(() => Promise.reject(new ValidationError("Tolerance must be between 1% and 25%.")));
                void run(() => updateSettings({ calorieTolerancePct: n }), "Calorie range saved");
              }}
            >
              <Field label="Calorie “within target” range (± %)" htmlFor="s-tol" hint="Used for calorie target checks across EVOLV" className="flex-1">
                <Input id="s-tol" inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} />
              </Field>
              <button type="submit" className="h-10 rounded-[10px] bg-surface-3 px-4 text-sm font-medium hover:bg-line">
                Save
              </button>
            </form>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-muted">Default Overview range</p>
              <Segmented label="Overview range" value={settings.dashboardRangeDays} onChange={(v) => void run(() => updateSettings({ dashboardRangeDays: v }))} options={[{ value: 7, label: "7 days" }, { value: 14, label: "14 days" }, { value: 30, label: "30 days" }]} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Backups" />
          <CardBody>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseInputNumber(remind);
                if (n === null || !Number.isFinite(n) || n < 0 || n > 90) return void run(() => Promise.reject(new ValidationError("Enter 0–90 days.")));
                void run(() => updateSettings({ backupReminderDays: Math.round(n) }), "Reminder saved");
              }}
            >
              <Field label="Remind me to back up every (days)" htmlFor="s-remind" hint="0 turns reminders off" className="flex-1">
                <Input id="s-remind" inputMode="numeric" value={remind} onChange={(e) => setRemind(e.target.value)} />
              </Field>
              <button type="submit" className="h-10 rounded-[10px] bg-surface-3 px-4 text-sm font-medium hover:bg-line">
                Save
              </button>
            </form>
            <p className="mt-3 text-[12.5px] text-muted">When a backup is due, a banner appears on the Overview and Data pages until you back up or snooze it. Reminders only appear when something changed since your last backup.</p>
            <NotificationOptIn enabled={!!settings.backupNotifications} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Install on this device" />
          <CardBody>
            <InstallGuide />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Privacy and storage" />
          <CardBody className="space-y-2 text-[13.5px] text-muted">
            <p>All EVOLV data is stored in this browser&apos;s IndexedDB on this device. There are no accounts, analytics, trackers or AI requests, and nothing is sent to a server.</p>
            <p>
              Clearing this site&apos;s data in your browser settings deletes your records permanently unless you have a backup.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <dt>Persistent storage</dt>
              <dd className="text-text">{storage.persisted === null ? "Unknown" : storage.persisted ? "Granted" : "Not granted (browser may evict under pressure)"}</dd>
              <dt>Space used</dt>
              <dd className="tabular text-text">{storage.usage !== null ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : "Unknown"}</dd>
              <dt>App version</dt>
              <dd className="tabular text-text">{process.env.NEXT_PUBLIC_APP_VERSION}</dd>
              <dt>Database schema</dt>
              <dd className="tabular text-text">v{DB_SCHEMA_VERSION}</dd>
              <dt>Report parser</dt>
              <dd className="tabular text-text">v{PARSER_VERSION}</dd>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Optional, permission-gated system notification for due backups. */
function NotificationOptIn({ enabled }: { enabled: boolean }) {
  const { run } = useAction();
  const [perm, setPerm] = React.useState<NotificationPermission | "unsupported">("default");
  const [iosBrowser, setIosBrowser] = React.useState(false);
  React.useEffect(() => {
    setPerm(notificationsSupported() ? Notification.permission : "unsupported");
    setIosBrowser(isIOS() && !isStandalone());
  }, []);
  if (perm === "unsupported") {
    return (
      <p className="mt-3 text-[12.5px] text-faint">
        {iosBrowser ? "System notifications on iPhone and iPad need EVOLV added to the Home Screen (iOS 16.4 or later). The in-app banner still works." : "This browser does not support notifications. The in-app banner still works."}
      </p>
    );
  }
  return (
    <label className="mt-3 flex items-start gap-2.5 text-[13px]">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--accent)]"
        checked={enabled && perm === "granted"}
        disabled={perm === "denied"}
        onChange={async (e) => {
          if (!e.target.checked) return void run(() => updateSettings({ backupNotifications: false }), "Backup notifications off");
          const p = perm === "granted" ? "granted" : await Notification.requestPermission();
          setPerm(p);
          if (p === "granted") await run(() => updateSettings({ backupNotifications: true }), "Backup notifications on");
        }}
      />
      <span>
        Also show a system notification when a backup is due
        <span className="block text-[12px] text-faint">
          {perm === "denied" ? "Notifications are blocked for this site in your browser settings." : "Optional. Shown at most once a day, and only while EVOLV is open; EVOLV has no server that could notify you otherwise."}
        </span>
      </span>
    </label>
  );
}
