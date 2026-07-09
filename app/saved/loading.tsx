export default function Loading() {
  return (
    <div className="px-4 pt-6">
      <div className="mb-6 animate-pulse space-y-2">
        <div className="h-7 w-40 rounded-lg bg-accent" />
        <div className="h-4 w-24 rounded-lg bg-accent" />
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse overflow-hidden rounded-2xl bg-accent">
            <div className="h-16 bg-accent" />
            <div className="flex gap-2 p-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-20 w-16 rounded-xl bg-background/50" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
