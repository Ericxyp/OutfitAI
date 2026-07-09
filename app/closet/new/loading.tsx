export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-6 flex animate-pulse items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent" />
        <div className="space-y-2">
          <div className="h-6 w-24 rounded-lg bg-accent" />
          <div className="h-4 w-32 rounded-lg bg-accent" />
        </div>
      </div>
      <div className="aspect-[3/4] animate-pulse rounded-2xl bg-accent" />
    </div>
  );
}
