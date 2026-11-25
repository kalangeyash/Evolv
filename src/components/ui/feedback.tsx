import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { RecordSource } from "@/lib/db/types";
import { Badge } from "./badge";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 text-faint [&_svg]:size-6">{icon}</div> : null}
      <p className="font-medium text-text">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? (
        action.href ? (
          <Link href={action.href} className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[10px] bg-surface-3", className)} />;
}

export function LoadingBlock({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("space-y-3", className)}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

const ICONS = { info: Info, good: CheckCircle2, warn: AlertTriangle, bad: XCircle };
const TONES = {
  info: "border-line bg-surface-2 text-muted",
  good: "border-transparent bg-good-bg text-good",
  warn: "border-transparent bg-warn-bg text-warn",
  bad: "border-transparent bg-bad-bg text-bad",
};

/** Inline message. Status is always conveyed by icon + text, never colour alone. */
export function Callout({ tone = "info", title, children, className }: { tone?: keyof typeof ICONS; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("flex gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px]", TONES[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : "", "text-text/85 [&_p+p]:mt-1")}>{children}</div> : null}
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<RecordSource, string> = {
  import: "Imported",
  manual: "Manual",
  profile: "Profile",
  backup: "Restored",
};

/** Provenance chip shown wherever a record's origin matters. */
export function SourceBadge({ source, corrected }: { source: RecordSource; corrected?: boolean }) {
  if (corrected) return <Badge tone="warn" title="Imported, then corrected by you">Corrected</Badge>;
  return (
    <Badge tone={source === "manual" ? "outline" : "neutral"} title={`Source: ${SOURCE_LABEL[source]}`}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

export function EstimateBadge({ label = "Estimate" }: { label?: string }) {
  return (
    <Badge tone="outline" title="This value is estimated, not measured">
      {label}
    </Badge>
  );
}
