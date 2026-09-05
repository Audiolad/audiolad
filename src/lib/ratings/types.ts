export type PracticeRatingAggregate = {
  totalStars: number;
  ratingCount: number;
};

export type PracticeRatingOwnState = {
  stars: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  ratingEligible: boolean;
  aggregate: PracticeRatingAggregate;
};

export type PracticeRatingPutState = {
  stars: number;
  createdAt: string;
  updatedAt: string;
  changed: boolean;
  aggregate: PracticeRatingAggregate;
};

export const EMPTY_RATING_AGGREGATE: PracticeRatingAggregate = {
  totalStars: 0,
  ratingCount: 0,
};
