/**
 * Reviewer allocation as pure functions (D-022): no database, no clock. The random number
 * generator is passed in, so tests can repeat a case with a seed.
 */

export interface Reviewer {
  id: string;
  /** The reviewer's team in the assignment's class, or null for a reviewer who joined only by link. */
  teamId: string | null;
}

export interface SubmissionSlot {
  id: string;
  teamId: string;
}

export interface Allocated {
  submissionId: string;
  reviewerId: string;
}

/** An existing review; `started` means it was submitted and never moves. */
export interface Pair extends Allocated {
  started: boolean;
}

export interface AllocationState {
  submissions: SubmissionSlot[];
  /** Everyone who may still review: withdrawn reviewers are left out. */
  reviewers: Reviewer[];
  reviews: Pair[];
}

export interface Change {
  remove: Pair[];
  add: Allocated[];
}

export type Random = () => number;

const key = (submissionId: string, reviewerId: string) => `${submissionId}/${reviewerId}`;

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadsOf(reviewers: readonly Reviewer[], pairs: readonly Allocated[]): Map<string, number> {
  const loads = new Map(reviewers.map((r) => [r.id, 0]));
  for (const pair of pairs) {
    if (loads.has(pair.reviewerId)) loads.set(pair.reviewerId, loads.get(pair.reviewerId)! + 1);
  }
  return loads;
}

/**
 * Gives every submission k different reviewers outside its team, or every eligible reviewer
 * when there are fewer. The most constrained submissions go first, each to the reviewers with
 * the lowest load, so loads stay balanced and at most k+1 unless a submission would otherwise
 * get fewer than k. Ties are broken at random. A last pass moves reviews from a reviewer to one
 * with at least 2 fewer, while such a move exists.
 */
export function allocate(
  submissions: readonly SubmissionSlot[],
  reviewers: readonly Reviewer[],
  k: number,
  random: Random,
): Allocated[] {
  const order = shuffled(reviewers, random);
  const rank = new Map(order.map((r, i) => [r.id, i]));
  const loads = loadsOf(reviewers, []);
  const eligible = new Map(submissions.map((s) => [s.id, order.filter((r) => r.teamId !== s.teamId)]));
  const byConstraint = shuffled(submissions, random).sort((a, b) => eligible.get(a.id)!.length - eligible.get(b.id)!.length);

  const pairs: Allocated[] = [];
  for (const submission of byConstraint) {
    const chosen = [...eligible.get(submission.id)!]
      .sort((a, b) => loads.get(a.id)! - loads.get(b.id)! || rank.get(a.id)! - rank.get(b.id)!)
      .slice(0, k);
    for (const reviewer of chosen) {
      pairs.push({ submissionId: submission.id, reviewerId: reviewer.id });
      loads.set(reviewer.id, loads.get(reviewer.id)! + 1);
    }
  }

  rebalance(submissions, order, pairs, loads);
  return pairs;
}

/** Moves a review from a reviewer to an eligible one with at least 2 fewer, until none can move. */
function rebalance(
  submissions: readonly SubmissionSlot[],
  order: readonly Reviewer[],
  pairs: Allocated[],
  loads: Map<string, number>,
): void {
  const teamOfSubmission = new Map(submissions.map((s) => [s.id, s.teamId]));
  const taken = new Set(pairs.map((p) => key(p.submissionId, p.reviewerId)));
  let moved = true;
  while (moved) {
    moved = false;
    for (const pair of pairs) {
      const target = order.find(
        (r) =>
          r.teamId !== teamOfSubmission.get(pair.submissionId) &&
          !taken.has(key(pair.submissionId, r.id)) &&
          loads.get(pair.reviewerId)! - loads.get(r.id)! >= 2,
      );
      if (!target) continue;
      taken.delete(key(pair.submissionId, pair.reviewerId));
      taken.add(key(pair.submissionId, target.id));
      loads.set(pair.reviewerId, loads.get(pair.reviewerId)! - 1);
      loads.set(target.id, loads.get(target.id)! + 1);
      pair.reviewerId = target.id;
      moved = true;
    }
  }
}

/**
 * Moves the given unstarted reviews, one by one, to the eligible reviewer with the lowest load:
 * outside the submission's team, not already reviewing it and not the review's current reviewer.
 * A review with nobody eligible is removed without a replacement. Used for a withdrawal (the
 * withdrawn reviewer is no longer in `state.reviewers`) and for a reviewer who joins the team
 * whose submission they were given.
 */
export function reassign(state: AllocationState, toMove: readonly Pair[], random: Random): Change {
  const order = shuffled(state.reviewers, random);
  const teamOfSubmission = new Map(state.submissions.map((s) => [s.id, s.teamId]));
  const moving = new Set(toMove.map((p) => key(p.submissionId, p.reviewerId)));
  const kept = state.reviews.filter((p) => !moving.has(key(p.submissionId, p.reviewerId)));
  const loads = loadsOf(state.reviewers, kept);
  const taken = new Set(kept.map((p) => key(p.submissionId, p.reviewerId)));

  const add: Allocated[] = [];
  for (const review of toMove) {
    let target: Reviewer | undefined;
    for (const r of order) {
      if (
        r.id !== review.reviewerId &&
        r.teamId !== teamOfSubmission.get(review.submissionId) &&
        !taken.has(key(review.submissionId, r.id)) &&
        (!target || loads.get(r.id)! < loads.get(target.id)!)
      ) {
        target = r;
      }
    }
    if (!target) continue;
    add.push({ submissionId: review.submissionId, reviewerId: target.id });
    taken.add(key(review.submissionId, target.id));
    loads.set(target.id, loads.get(target.id)! + 1);
  }
  return { remove: [...toMove], add };
}

/**
 * A reviewer who arrives after allocation takes unstarted reviews from the busiest reviewers,
 * one at a time, up to the average load. A review moves only from a reviewer with at least 2
 * more than the newcomer, and only for a submission the newcomer may review. Nothing else moves.
 */
export function addLateReviewer(state: AllocationState, newcomerId: string, random: Random): Change {
  const newcomer = state.reviewers.find((r) => r.id === newcomerId);
  if (!newcomer) return { remove: [], add: [] };
  const order = shuffled(state.reviewers, random);
  const teamOfSubmission = new Map(state.submissions.map((s) => [s.id, s.teamId]));
  const loads = loadsOf(state.reviewers, state.reviews);
  const average = Math.floor(state.reviews.length / state.reviewers.length);
  const mine = new Set(state.reviews.filter((p) => p.reviewerId === newcomerId).map((p) => p.submissionId));
  const remove: Pair[] = [];

  const movable = (p: Pair) =>
    !p.started &&
    p.reviewerId !== newcomerId &&
    !remove.includes(p) &&
    !mine.has(p.submissionId) &&
    teamOfSubmission.get(p.submissionId) !== newcomer.teamId;

  while (loads.get(newcomerId)! < average) {
    const busiest = order
      .filter((r) => loads.get(r.id)! - loads.get(newcomerId)! >= 2)
      .filter((r) => state.reviews.some((p) => p.reviewerId === r.id && movable(p)))
      .sort((a, b) => loads.get(b.id)! - loads.get(a.id)!)[0];
    if (!busiest) break;
    const options = state.reviews.filter((p) => p.reviewerId === busiest.id && movable(p));
    const review = options[Math.floor(random() * options.length)];
    remove.push(review);
    mine.add(review.submissionId);
    loads.set(busiest.id, loads.get(busiest.id)! - 1);
    loads.set(newcomerId, loads.get(newcomerId)! + 1);
  }
  return { remove, add: remove.map((p) => ({ submissionId: p.submissionId, reviewerId: newcomerId })) };
}
