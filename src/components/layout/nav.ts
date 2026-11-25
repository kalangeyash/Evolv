import {
  Activity,
  CalendarDays,
  ChartPie,
  ClipboardPaste,
  Database,
  Dumbbell,
  FileText,
  LayoutDashboard,
  NotebookPen,
  Scale,
  Settings,
  Target,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, mobile: true },
  { href: "/journal/", label: "Food Journal", icon: NotebookPen, mobile: true },
  { href: "/import/", label: "Import Report", icon: ClipboardPaste, mobile: true },
  { href: "/nutrition/", label: "Nutrition", icon: ChartPie },
  { href: "/activity/", label: "Activity", icon: Activity },
  { href: "/workouts/", label: "Workouts", icon: Dumbbell },
  { href: "/body/", label: "Body Analytics", icon: Scale, mobile: true },
  { href: "/progress/", label: "Progress", icon: TrendingUp },
  { href: "/calendar/", label: "Calendar", icon: CalendarDays },
  { href: "/reports/", label: "Reports", icon: FileText },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/goals/", label: "Goals & Targets", icon: Target },
  { href: "/profile/", label: "Profile", icon: UserRound },
  { href: "/settings/", label: "Settings", icon: Settings },
  { href: "/data/", label: "Data Management", icon: Database },
];

export function isActive(pathname: string, href: string) {
  const p = pathname.replace(/\/+$/, "/") || "/";
  if (href === "/") return p === "/" || p === "";
  return p.startsWith(href);
}
