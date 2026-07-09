import Link from "next/link";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-card px-6 py-12 text-center shadow-sm ring-1 ring-border/60">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        {icon}
      </div>
      <h2 className="mb-2 text-base font-medium text-foreground">{title}</h2>
      <p className="mb-8 max-w-[260px] text-sm leading-relaxed text-muted">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="rounded-2xl bg-foreground px-8 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-2xl bg-foreground px-8 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel ?? "返回"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border/60 transition-colors hover:bg-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="#111111"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </header>
  );
}

export function PageLoading() {
  return (
    <div className="animate-pulse space-y-4 px-4 pt-6">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded-lg bg-accent" />
        <div className="h-4 w-48 rounded-lg bg-accent" />
      </div>
      <div className="h-10 w-full rounded-full bg-accent" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl bg-accent">
            <div className="aspect-[3/4] bg-accent" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 rounded bg-background/60" />
              <div className="h-3 w-1/2 rounded bg-background/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-red-50 px-4 py-3 text-center ring-1 ring-red-100">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium text-red-800 underline-offset-2 hover:underline"
        >
          重试
        </button>
      )}
    </div>
  );
}

export function DemoBanner({
  message,
  href,
  linkText,
}: {
  message: string;
  href: string;
  linkText: string;
}) {
  return (
    <Link
      href={href}
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-accent/80 px-4 py-3 ring-1 ring-border/60 transition-colors hover:bg-accent"
    >
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
      <span className="shrink-0 text-sm font-medium text-foreground">
        {linkText} →
      </span>
    </Link>
  );
}
