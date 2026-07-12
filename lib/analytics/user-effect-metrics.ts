export function normalizeRecommendationScore(
  value: unknown
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < 1 || value > 5) {
    return null;
  }

  return value;
}

export function computeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export type RatingMetrics = {
  averageRating: number | null;
  totalRatings: number;
  highRatingRate: number;
  lowRatingRate: number;
};

export function computeRatingMetrics(ratings: number[]): RatingMetrics {
  const totalRatings = ratings.length;

  if (totalRatings === 0) {
    return {
      averageRating: null,
      totalRatings: 0,
      highRatingRate: 0,
      lowRatingRate: 0,
    };
  }

  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  const highCount = ratings.filter((rating) => rating >= 4).length;
  const lowCount = ratings.filter((rating) => rating <= 2).length;

  return {
    averageRating: sum / totalRatings,
    totalRatings,
    highRatingRate: highCount / totalRatings,
    lowRatingRate: lowCount / totalRatings,
  };
}

export type UserEffectMetrics = {
  totalWearConfirmations: number;
  wearRate: number;
  totalRegenerations: number;
  regenerationRate: number;
  averageRating: number | null;
  totalRatings: number;
  highRatingRate: number;
  lowRatingRate: number;
};

export function buildUserEffectMetrics(input: {
  totalOutfitGenerated: number;
  totalWearConfirmations: number;
  totalRegenerations: number;
  ratings: number[];
}): UserEffectMetrics {
  const ratingMetrics = computeRatingMetrics(input.ratings);

  return {
    totalWearConfirmations: input.totalWearConfirmations,
    wearRate: computeRate(
      input.totalWearConfirmations,
      input.totalOutfitGenerated
    ),
    totalRegenerations: input.totalRegenerations,
    regenerationRate: computeRate(
      input.totalRegenerations,
      input.totalOutfitGenerated
    ),
    averageRating: ratingMetrics.averageRating,
    totalRatings: ratingMetrics.totalRatings,
    highRatingRate: ratingMetrics.highRatingRate,
    lowRatingRate: ratingMetrics.lowRatingRate,
  };
}
