"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Ellipsis, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useUI } from "@/stores/ui-store";
import { getDb } from "@/lib/db/db";
import { cn } from "@/lib/utils/cn";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav";
import { EvolvWordmark } from "./brand";
import { DateSwitcher } from "./date-switcher";
import { Dialog, DialogContent } from "@/components/ui/dialog";

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-[9px] px-2.5 text-[13.5px] font-medium transition-colors",
        active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
        collapsed && "justify-center px-0",
      )}
    >
      {active ? <span className="absolute left-0 top-2 h-5 w-[3px] rounded-r-full bg-accent" aria-hidden /> : null}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-accent-text" : "")} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

/** Today's logging status for the selected day: food, weight, activity. */
function DayStatus() {
  const date = useUI((s) => s.selectedDate);
  const status = useLiveQuery(async () => {
    const db = getDb();
    const [food, weight, activity, workouts] = await Promise.all([
      db.foodEntries.where("date").equals(date).count(),
      db.weightEntries.where("date").equals(date).count(),
      db.activityEntries.where("date").equals(date).count(),
      db.workoutSessions.where("date").equals(date).count(),
    ]);
    return { food, weight, activity, workouts };
  }, [date]);
  if (!status) return null;
  const chip = (on: boolean, label: string) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        on ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent-text" : "bg-surface-3 text-faint",
      )}
    >
      {on ? <Check className="size-3" aria-hidden /> : null}
      {label}
      <span className="sr-only">{on ? " recorded" : " not recorded"}</span>
    </span>
  );
  return (
    <div className="hidden items-center gap-1.5 md:flex" aria-label="Logging status for the selected day">
      {chip(status.food > 0, status.food ? `${status.food} food` : "Food")}
      {chip(status.activity > 0, "Activity")}
      {chip(status.weight > 0, "Weight")}
      {status.workouts > 0 ? chip(true, `${status.workouts} workout${status.workouts > 1 ? "s" : ""}`) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const pathname = usePathname();
  const isPrint = pathname.startsWith("/reports");

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only z-[60] rounded-md bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface pt-[env(safe-area-inset-top)] transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-[244px]",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-4")}>
          <Link href="/" aria-label="EVOLV overview">
            <EvolvWordmark collapsed={collapsed} />
          </Link>
        </div>
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
          <ul className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
          <div className="my-3 border-t border-line" />
          <ul className="space-y-0.5">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={toggle}
            className={cn("flex h-9 w-full items-center gap-3 rounded-[9px] px-2.5 text-[13px] text-muted hover:bg-surface-2 hover:text-text", collapsed && "justify-center px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[244px]")}>
        {/* Header */}
        <header
          className="no-print sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <Link href="/" className="lg:hidden" aria-label="EVOLV overview">
              <EvolvWordmark />
            </Link>
            {!isPrint ? <DateSwitcher className="lg:-ml-2" compact /> : <span />}
            <DayStatus />
          </div>
        </header>

        <main
          id="main"
          className="mx-auto max-w-[1280px] pb-28 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-8 lg:pb-12 lg:pt-8"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md safe-bottom lg:hidden" aria-label="Primary">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY_NAV.filter((i) => i.mobile).map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-accent-text" : "text-muted")}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate px-1">{item.label.replace(" Report", "").replace("Food ", "").replace(" Analytics", "")}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted">
              <Ellipsis className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="All sections">
          <ul className="grid grid-cols-2 gap-1.5">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={() => setMoreOpen(false)} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
