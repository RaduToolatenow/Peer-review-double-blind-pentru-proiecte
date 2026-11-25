/**
 * D-025: reviewer reliability and submission grades, as pure functions of the sent reviews.
 * Nothing here reads the database, so the results page can explain every number.
 */

export interface GradeCriterion {
  id: string;
  weight: number;
  /** The scores of the criterion's lowest and highest levels. */
  lowest: number;
  highest: number;
}

/** A sent review: the level score given for each criterion id. */
export interface SentReview {
  submissionId: string;
  reviewerId: string;
  /** The professor's calibration review, counted at reliability 1 and used as the reference. */
  calibration: boolean;
  levels: Record<string, number>;
}

export interface ReviewerReliability {
  reviewerId: string;
  reliability: number;
  flagged: boolean;
  /** False when the reviewer had nothing to compare against. */
  measured: boolean;
}

export const RELIABILITY_FLOOR = 0.2;
export const FLAG_BELOW = 0.6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bySubmission(reviews: SentReview[]): Map<string, SentReview[]> {
  const groups = new Map<string, SentReview[]>();
  for (const review of reviews) {
    groups.set(review.submissionId, [...(groups.get(review.submissionId) ?? []), review]);
  }
  return groups;
}

/**
 * Each peer reviewer's reliability: 1 − the weighted mean of |level − reference| ÷ range, where the
 * reference is the professor's level on a calibrated submission, otherwise the other peers' median.
 */
export function reliabilities(criteria: GradeCriterion[], reviews: SentReview[]): Map<string, ReviewerReliability> {
  const groups = bySubmission(reviews);
  const sums = new Map<string, { deviation: number; weight: number }>();
  const result = new Map<string, ReviewerReliability>();

  for (const review of reviews) {
    if (review.calibration) continue;
    const sum = sums.get(review.reviewerId) ?? { deviation: 0, weight: 0 };
    sums.set(review.reviewerId, sum);
    const others = groups.get(review.submissionId)!.filter((r) => r !== review);
    const professor = others.find((r) => r.calibration);
    const peers = others.filter((r) => !r.calibration);
    for (const criterion of criteria) {
      const reference = professor
        ? professor.levels[criterion.id]
        : peers.length > 0
          ? median(peers.map((r) => r.levels[criterion.id]))
          : undefined;
      if (reference === undefined) continue;
      const deviation = Math.abs(review.levels[criterion.id] - reference) / (criterion.highest - criterion.lowest);
      sum.deviation += criterion.weight * deviation;
      sum.weight += criterion.weight;
    }
  }

  for (const [reviewerId, sum] of sums) {
    if (sum.weight === 0) {
      result.set(reviewerId, { reviewerId, reliability: 1, flagged: false, measured: false });
      continue;
    }
    const raw = 1 - sum.deviation / sum.weight;
    result.set(reviewerId, {
      reviewerId,
      reliability: Math.max(RELIABILITY_FLOOR, raw),
      // A small tolerance, so a deviation of exactly 0.4 is not flagged by a rounding error.
      flagged: raw < FLAG_BELOW - 1e-9,
      measured: true,
    });
  }
  return result;
}

export interface Explanation {
  /** The weight of each given review, in the same order: reliability, or 1 for the professor's calibration. */
  weights: number[];
  /** Per criterion: the weighted mean level and that mean scaled to 0–1; null without reviews. */
  criteria: { id: string; mean: number | null; scaled: number | null }[];
  grade: number | null;
}

/**
 * One submission's grade on 1–10, 2 decimals, and every step of it (D-026): per criterion the
 * reliability-weighted mean level scaled to 0–1, then averaged with the criterion weights.
 */
export function explain(
  criteria: GradeCriterion[],
  sent: SentReview[],
  reliability: Map<string, ReviewerReliability>,
): Explanation {
  const weights = sent.map((r) => (r.calibration ? 1 : (reliability.get(r.reviewerId)?.reliability ?? 1)));
  const readers = weights.reduce((sum, w) => sum + w, 0);
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (sent.length === 0 || totalWeight === 0) {
    return { weights, criteria: criteria.map((c) => ({ id: c.id, mean: null, scaled: null })), grade: null };
  }
  let score = 0;
  const steps = criteria.map((criterion) => {
    const mean = sent.reduce((sum, r, i) => sum + weights[i] * r.levels[criterion.id], 0) / readers;
    const scaled = (mean - criterion.lowest) / (criterion.highest - criterion.lowest);
    score += criterion.weight * scaled;
    return { id: criterion.id, mean, scaled };
  });
  return { weights, criteria: steps, grade: Math.round((1 + (9 * score) / totalWeight) * 100) / 100 };
}

/** Each submission's grade (see explain), or null without sent reviews. */
export function aggregate(
  criteria: GradeCriterion[],
  reviews: SentReview[],
  reliability: Map<string, ReviewerReliability>,
  submissionIds: string[],
): Map<string, number | null> {
  const groups = bySubmission(reviews);
  return new Map(submissionIds.map((id) => [id, explain(criteria, groups.get(id) ?? [], reliability).grade]));
}

/**
 * D-028: one of a reviewer's own peer reviews, as the reviewer grade sees it: the levels they gave
 * (never replaced by a dispute), the levels of upheld disputes, and the professor's 1–5 rating.
 * An unsent review is passed only when it counts against the reviewer.
 */
export interface OwnReview {
  id: string;
  submissionId: string;
  reviewerId: string;
  sent: boolean;
  levels: Record<string, number>;
  upheld: Record<string, number>;
  rating: number | null;
  /** False for an unsent review that does not count yet (before the review deadline). */
  counts?: boolean;
}

export interface ReviewGrade {
  id: string;
  sent: boolean;
  /** 0–1, or null without a reference or when unsent. */
  accuracy: number | null;
  rating: number | null;
  grade: number | null;
  counted: boolean;
}

export interface ReviewerGrade {
  reviewerId: string;
  grade: number | null;
  reviews: ReviewGrade[];
}

export const QUALITY_SHARE = 0.3;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1 + 9 × the given 0–1 score, not rounded. */
function onTen(score: number): number {
  return 1 + 9 * score;
}

/**
 * D-028: each reviewer's grade, the mean of their reviews' grades. A sent review's accuracy is
 * 1 − its weighted deviation from the D-025 reference, where an upheld dispute's level is the
 * reference for its criterion; its grade mixes accuracy and the professor's rating 70/30, uses
 * whichever of the two exists alone, and is left out with neither. A counted unsent review is 1.
 * `sent` holds every sent review as the grades see them (D-027 levels), for the references.
 */
export function reviewerGrades(criteria: GradeCriterion[], sent: SentReview[], own: OwnReview[]): Map<string, ReviewerGrade> {
  const groups = bySubmission(sent);
  const result = new Map<string, ReviewerGrade>();
  // The unrounded review grades, for the mean.
  const raw = new Map<ReviewGrade, number>();

  for (const review of own) {
    const entry = result.get(review.reviewerId) ?? { reviewerId: review.reviewerId, grade: null, reviews: [] };
    result.set(review.reviewerId, entry);
    if (!review.sent) {
      const counted = review.counts !== false;
      const unsent: ReviewGrade = { id: review.id, sent: false, accuracy: null, rating: null, grade: counted ? 1 : null, counted };
      entry.reviews.push(unsent);
      if (counted) raw.set(unsent, 1);
      continue;
    }
    const others = (groups.get(review.submissionId) ?? []).filter((r) => r.reviewerId !== review.reviewerId);
    const professor = others.find((r) => r.calibration);
    const peers = others.filter((r) => !r.calibration);
    let deviation = 0;
    let weight = 0;
    for (const criterion of criteria) {
      const reference =
        review.upheld[criterion.id] ??
        (professor
          ? professor.levels[criterion.id]
          : peers.length > 0
            ? median(peers.map((r) => r.levels[criterion.id]))
            : undefined);
      if (reference === undefined) continue;
      deviation += (criterion.weight * Math.abs(review.levels[criterion.id] - reference)) / (criterion.highest - criterion.lowest);
      weight += criterion.weight;
    }
    const accuracy = weight > 0 ? 1 - deviation / weight : null;
    const quality = review.rating === null ? null : (review.rating - 1) / 4;
    const grade =
      accuracy !== null && quality !== null
        ? onTen((1 - QUALITY_SHARE) * accuracy + QUALITY_SHARE * quality)
        : accuracy !== null
          ? onTen(accuracy)
          : quality !== null
            ? onTen(quality)
            : null;
    const graded: ReviewGrade = {
      id: review.id,
      sent: true,
      accuracy: accuracy === null ? null : round(accuracy),
      rating: review.rating,
      grade: grade === null ? null : round(grade),
      counted: grade !== null,
    };
    entry.reviews.push(graded);
    if (grade !== null) raw.set(graded, grade);
  }

  for (const entry of result.values()) {
    const grades = entry.reviews.flatMap((r) => (raw.has(r) ? [raw.get(r)!] : []));
    entry.grade = grades.length > 0 ? round(grades.reduce((sum, g) => sum + g, 0) / grades.length) : null;
  }
  return result;
}
