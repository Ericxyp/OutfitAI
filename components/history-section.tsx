import { HistoryRecordCard } from "@/components/history-record-card";
import type { HistoryThumbnail } from "@/lib/history/get-history";

type HistorySectionRecord = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  items: HistoryThumbnail[];
  leadingImage?: string | null;
  leadingAlt?: string;
};

type HistorySectionProps = {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  records: HistorySectionRecord[];
};

export function HistorySection({
  title,
  emptyTitle,
  emptyDescription,
  records,
}: HistorySectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {records.length > 0 && (
          <span className="text-xs text-muted">{records.length} 条</span>
        )}
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl bg-card px-4 py-8 text-center shadow-sm ring-1 ring-border/60">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <HistoryRecordCard
              key={record.id}
              title={record.title}
              createdAt={record.createdAt}
              summary={record.summary}
              items={record.items}
              leadingImage={record.leadingImage}
              leadingAlt={record.leadingAlt}
            />
          ))}
        </div>
      )}
    </section>
  );
}
