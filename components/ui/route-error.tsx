"use client";

import { PAGE_COPY } from "@/lib/constants";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="1.5" />
          <path d="M12 8v5M12 16h.01" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mb-1 text-base font-medium text-foreground">
        {PAGE_COPY.errors.generic}
      </p>
      <p className="mb-6 max-w-[260px] text-sm text-muted">
        {error.message || PAGE_COPY.errors.loadFailed}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-2xl bg-foreground px-8 py-3 text-sm font-medium text-background"
      >
        {PAGE_COPY.errors.retry}
      </button>
    </div>
  );
}
