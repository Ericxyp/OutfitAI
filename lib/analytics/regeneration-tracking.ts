export const REGENERATION_WINDOW_MINUTES = 30;

export type PriorRecommendation = {
  id: string;
  createdAt: string;
};

export type RegenerationTrackingInput = {
  previousRecommendations: PriorRecommendation[];
  currentRecommendationId: string;
  currentCreatedAt: string;
};

export type RegenerationTrackingResult = {
  shouldTrack: boolean;
  previousRecommendationId?: string;
  elapsedSeconds?: number;
};

export function resolveRegenerationTracking(
  input: RegenerationTrackingInput
): RegenerationTrackingResult {
  const previous = input.previousRecommendations
    .filter((row) => row.id !== input.currentRecommendationId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

  if (!previous) {
    return { shouldTrack: false };
  }

  const currentMs = new Date(input.currentCreatedAt).getTime();
  const previousMs = new Date(previous.createdAt).getTime();
  const elapsedSeconds = Math.max(
    0,
    Math.round((currentMs - previousMs) / 1000)
  );

  return {
    shouldTrack: true,
    previousRecommendationId: previous.id,
    elapsedSeconds,
  };
}

export function getRegenerationWindowStartIso(
  now: Date = new Date(),
  windowMinutes: number = REGENERATION_WINDOW_MINUTES
): string {
  const start = new Date(now.getTime() - windowMinutes * 60 * 1000);
  return start.toISOString();
}
