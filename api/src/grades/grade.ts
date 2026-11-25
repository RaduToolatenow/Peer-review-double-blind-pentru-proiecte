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

/**
 * Each submission's grade on 1–10, 2 decimals: per criterion the reliability-weighted mean level
 * scaled to 0–1, then averaged with the criterion weights. Null without sent reviews.
 */
export function aggregate(
  criteria: GradeCriterion[],
  reviews: SentReview[],
  reliability: Map<string, ReviewerReliability>,
  submissionIds: string[],
): Map<string, number | null> {
  const groups = bySubmission(reviews);
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const grades = new Map<string, number | null>();

  for (const submissionId of submissionIds) {
    const sent = groups.get(submissionId) ?? [];
    if (sent.length === 0 || totalWeight === 0) {
      grades.set(submissionId, null);
      continue;
    }
    const weightOf = (r: SentReview) => (r.calibration ? 1 : (reliability.get(r.reviewerId)?.reliability ?? 1));
    const readers = sent.reduce((sum, r) => sum + weightOf(r), 0);
    let score = 0;
    for (const criterion of criteria) {
      const mean = sent.reduce((sum, r) => sum + weightOf(r) * r.levels[criterion.id], 0) / readers;
      score += (criterion.weight * (mean - criterion.lowest)) / (criterion.highest - criterion.lowest);
    }
    grades.set(submissionId, Math.round((1 + (9 * score) / totalWeight) * 100) / 100);
  }
  return grades;
}
