import {
  addLateReviewer,
  allocate,
  AllocationState,
  Pair,
  reassign,
  Reviewer,
  SubmissionSlot,
} from '../src/allocation/allocate';

/** A small seeded random number generator (mulberry32), so every case can be repeated. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Teams t0, t1, ... with the given number of members (r<team>-<n>); every team submits (s<team>).
 * `missing` lists teams whose members are not reviewers (they withdrew); `linkReviewers` adds
 * reviewers without a team.
 */
function world(sizes: number[], options: { missing?: number[]; linkReviewers?: number } = {}) {
  const submissions: SubmissionSlot[] = sizes.map((_, t) => ({ id: `s${t}`, teamId: `t${t}` }));
  const reviewers: Reviewer[] = [];
  sizes.forEach((size, t) => {
    if (options.missing?.includes(t)) return;
    for (let m = 0; m < size; m += 1) reviewers.push({ id: `r${t}-${m}`, teamId: `t${t}` });
  });
  for (let l = 0; l < (options.linkReviewers ?? 0); l += 1) reviewers.push({ id: `link${l}`, teamId: null });
  return { submissions, reviewers };
}

function loads(reviewers: Reviewer[], pairs: { reviewerId: string }[]): Map<string, number> {
  const map = new Map(reviewers.map((r) => [r.id, 0]));
  for (const pair of pairs) map.set(pair.reviewerId, (map.get(pair.reviewerId) ?? 0) + 1);
  return map;
}

function eligible(submission: SubmissionSlot, reviewers: Reviewer[]): Reviewer[] {
  return reviewers.filter((r) => r.teamId !== submission.teamId);
}

/** The rules every allocation keeps, whatever the case. */
function expectHardRules(
  submissions: SubmissionSlot[],
  reviewers: Reviewer[],
  pairs: { submissionId: string; reviewerId: string }[],
  k: number,
) {
  const teamOf = new Map(reviewers.map((r) => [r.id, r.teamId]));
  const keys = pairs.map((p) => `${p.submissionId}/${p.reviewerId}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const pair of pairs) {
    const submission = submissions.find((s) => s.id === pair.submissionId)!;
    expect(teamOf.has(pair.reviewerId)).toBe(true);
    expect(teamOf.get(pair.reviewerId)).not.toBe(submission.teamId);
  }
  for (const submission of submissions) {
    const count = pairs.filter((p) => p.submissionId === submission.id).length;
    expect(count).toBe(Math.min(k, eligible(submission, reviewers).length));
  }
}

/** No review can move from a reviewer to one with at least 2 fewer reviews. */
function expectLocallyBalanced(
  submissions: SubmissionSlot[],
  reviewers: Reviewer[],
  pairs: { submissionId: string; reviewerId: string }[],
) {
  const load = loads(reviewers, pairs);
  const taken = new Set(pairs.map((p) => `${p.submissionId}/${p.reviewerId}`));
  for (const pair of pairs) {
    const submission = submissions.find((s) => s.id === pair.submissionId)!;
    for (const other of eligible(submission, reviewers)) {
      if (taken.has(`${submission.id}/${other.id}`)) continue;
      expect(load.get(pair.reviewerId)! - load.get(other.id)!).toBeLessThan(2);
    }
  }
}

describe('allocate (D-022)', () => {
  it('gives every submission k different reviewers', () => {
    const { submissions, reviewers } = world([1, 1, 1, 1, 1, 1]);
    const pairs = allocate(submissions, reviewers, 2, seeded(1));

    expect(pairs).toHaveLength(12);
    expectHardRules(submissions, reviewers, pairs, 2);
  });

  it("never gives a reviewer their own team's submission", () => {
    const { submissions, reviewers } = world([3, 2, 2, 1]);
    const pairs = allocate(submissions, reviewers, 3, seeded(2));

    expectHardRules(submissions, reviewers, pairs, 3);
  });

  it('keeps loads at most k+1 and within 1 of each other', () => {
    const solo = world([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const soloLoads = [...loads(solo.reviewers, allocate(solo.submissions, solo.reviewers, 3, seeded(3))).values()];
    expect(soloLoads.every((l) => l === 3)).toBe(true);

    const mixed = world([2, 2, 2, 1, 1], { linkReviewers: 1 });
    const mixedLoads = [...loads(mixed.reviewers, allocate(mixed.submissions, mixed.reviewers, 2, seeded(4))).values()];
    expect(Math.max(...mixedLoads)).toBeLessThanOrEqual(3);
    expect(Math.max(...mixedLoads) - Math.min(...mixedLoads)).toBeLessThanOrEqual(1);
  });

  it('goes over k+1 only when a submission would otherwise get fewer than k reviews', () => {
    // Five solo teams submitted, but only the members of t0 and t1 are still reviewers.
    const { submissions, reviewers } = world([1, 1, 1, 1, 1], { missing: [2, 3, 4] });
    const pairs = allocate(submissions, reviewers, 2, seeded(5));

    expectHardRules(submissions, reviewers, pairs, 2);
    // s2, s3, s4 get both reviewers; s0 and s1 get the one reviewer outside their team.
    expect([...loads(reviewers, pairs).values()]).toEqual([4, 4]);
  });

  it("gives a large team's submission every eligible reviewer when there are fewer than k", () => {
    const { submissions, reviewers } = world([5, 1, 1]);
    const pairs = allocate(submissions, reviewers, 3, seeded(6));

    expect(pairs.filter((p) => p.submissionId === 's0').map((p) => p.reviewerId).sort()).toEqual(['r1-0', 'r2-0']);
    expectHardRules(submissions, reviewers, pairs, 3);
  });

  it('gives the same result for the same seed and a different one for another seed', () => {
    const { submissions, reviewers } = world([1, 1, 1, 1, 1, 1, 1, 1]);
    const key = (pairs: Pair[] | { submissionId: string; reviewerId: string }[]) =>
      pairs.map((p) => `${p.submissionId}/${p.reviewerId}`).sort().join(',');

    expect(key(allocate(submissions, reviewers, 2, seeded(7)))).toBe(key(allocate(submissions, reviewers, 2, seeded(7))));
    expect(key(allocate(submissions, reviewers, 2, seeded(7)))).not.toBe(key(allocate(submissions, reviewers, 2, seeded(8))));
  });

  it('keeps every rule in 200 random cases', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed * 7919);
      const teamCount = 3 + Math.floor(random() * 10);
      const sizes = Array.from({ length: teamCount }, () => 1 + Math.floor(random() * 4));
      const k = 1 + Math.floor(random() * 4);
      const { submissions, reviewers } = world(sizes, { linkReviewers: Math.floor(random() * 4) });

      const pairs = allocate(submissions, reviewers, k, random);

      expectHardRules(submissions, reviewers, pairs, k);
      expectLocallyBalanced(submissions, reviewers, pairs);
      expect(Math.max(...loads(reviewers, pairs).values())).toBeLessThanOrEqual(k + 1);
    }
  });
});

describe('withdrawal and late arrival (D-022)', () => {
  /** An allocated world in which the first review of every third reviewer is already submitted. */
  function allocated(sizes: number[], k: number, seed: number, linkReviewers = 0): AllocationState {
    const { submissions, reviewers } = world(sizes, { linkReviewers });
    const startedBy = new Set(reviewers.filter((_, i) => i % 3 === 0).map((r) => r.id));
    const seen = new Set<string>();
    const reviews: Pair[] = allocate(submissions, reviewers, k, seeded(seed)).map((p) => {
      const started = startedBy.has(p.reviewerId) && !seen.has(p.reviewerId);
      seen.add(p.reviewerId);
      return { ...p, started };
    });
    return { submissions, reviewers, reviews };
  }

  function applyChange(state: AllocationState, change: { remove: Pair[]; add: { submissionId: string; reviewerId: string }[] }) {
    const removed = new Set(change.remove.map((p) => `${p.submissionId}/${p.reviewerId}`));
    return [
      ...state.reviews.filter((p) => !removed.has(`${p.submissionId}/${p.reviewerId}`)),
      ...change.add.map((p) => ({ ...p, started: false })),
    ];
  }

  function withdrawn(state: AllocationState, reviewerId: string, seed: number): AllocationState {
    const remaining = { ...state, reviewers: state.reviewers.filter((r) => r.id !== reviewerId) };
    const change = reassign(remaining, state.reviews.filter((p) => p.reviewerId === reviewerId && !p.started), seeded(seed));
    return { ...remaining, reviews: applyChange(state, change) };
  }

  it("moves only the withdrawn reviewer's unstarted reviews, and keeps their submitted ones", () => {
    const state = allocated([1, 1, 1, 1, 1, 1, 1], 2, 11);
    const reviewerId = 'r0-0'; // index 0, so one of their reviews is submitted
    const remaining = { ...state, reviewers: state.reviewers.filter((r) => r.id !== reviewerId) };
    const unstarted = state.reviews.filter((p) => p.reviewerId === reviewerId && !p.started);

    const change = reassign(remaining, unstarted, seeded(12));

    expect(change.remove).toEqual(unstarted);
    expect(change.add).toHaveLength(unstarted.length);
    expect(change.add.every((p) => p.reviewerId !== reviewerId)).toBe(true);
    const after = applyChange(state, change);
    expect(after.filter((p) => p.reviewerId === reviewerId)).toEqual(
      state.reviews.filter((p) => p.reviewerId === reviewerId && p.started),
    );
    // Every other review stays where it was.
    const untouched = state.reviews.filter((p) => p.reviewerId !== reviewerId);
    expect(after).toEqual(expect.arrayContaining(untouched));
  });

  it('keeps every rule after two withdrawals one after the other', () => {
    const start = allocated([1, 1, 1, 1, 1, 1, 1, 1], 2, 13);
    const once = withdrawn(start, 'r1-0', 14);
    const twice = withdrawn(once, 'r2-0', 15);

    const unstarted = twice.reviews.filter((p) => !p.started);
    for (const pair of twice.reviews) {
      const submission = twice.submissions.find((s) => s.id === pair.submissionId)!;
      expect(pair.reviewerId).not.toBe(`r${submission.teamId.slice(1)}-0`);
    }
    for (const submission of twice.submissions) {
      expect(twice.reviews.filter((p) => p.submissionId === submission.id)).toHaveLength(2);
    }
    expect(unstarted.some((p) => p.reviewerId === 'r1-0' || p.reviewerId === 'r2-0')).toBe(false);
    const keys = twice.reviews.map((p) => `${p.submissionId}/${p.reviewerId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("moves a review to someone else when its reviewer joins the submission's team", () => {
    const state = allocated([1, 1, 1, 1, 1], 2, 16, 1);
    const review = state.reviews.find((p) => p.reviewerId === 'link0')!;
    const team = state.submissions.find((s) => s.id === review.submissionId)!.teamId;
    const joined = { ...state, reviewers: state.reviewers.map((r) => (r.id === 'link0' ? { ...r, teamId: team } : r)) };

    const change = reassign(joined, [review], seeded(17));

    expect(change.remove).toEqual([review]);
    expect(change.add).toHaveLength(1);
    expect(change.add[0].submissionId).toBe(review.submissionId);
    expect(joined.reviewers.find((r) => r.id === change.add[0].reviewerId)!.teamId).not.toBe(team);
  });

  it('gives a late arrival unstarted reviews from the busiest reviewers, up to the average load', () => {
    const state = allocated([2, 1, 1, 1, 1, 1, 1], 3, 18);
    const newcomer: Reviewer = { id: 'late', teamId: null };
    const joined = { ...state, reviewers: [...state.reviewers, newcomer] };
    const before = loads(joined.reviewers, state.reviews);
    const average = Math.floor(state.reviews.length / joined.reviewers.length);

    const change = addLateReviewer(joined, newcomer.id, seeded(19));

    expect(change.add).toHaveLength(average);
    expect(change.add.every((p) => p.reviewerId === 'late')).toBe(true);
    expect(change.remove.every((p) => !p.started)).toBe(true);
    expect(change.remove.map((p) => p.submissionId).sort()).toEqual(change.add.map((p) => p.submissionId).sort());
    const busiest = Math.max(...before.values());
    expect(change.remove.every((p) => before.get(p.reviewerId)! >= busiest - 1)).toBe(true);
    const after = applyChange(state, change);
    expect(Math.max(...loads(joined.reviewers, after).values())).toBeLessThanOrEqual(busiest);
    expect(after).toHaveLength(state.reviews.length);
  });

  it("never gives a late arrival their own team's submission", () => {
    const state = allocated([1, 1, 1, 1, 1, 1], 3, 20);
    const newcomer: Reviewer = { id: 'late', teamId: 't0' };
    const joined = { ...state, reviewers: [...state.reviewers, newcomer] };

    const change = addLateReviewer(joined, newcomer.id, seeded(21));

    expect(change.add.length).toBeGreaterThan(0);
    expect(change.add.some((p) => p.submissionId === 's0')).toBe(false);
  });

  it('gives a late arrival nothing when nobody has an unstarted review to spare', () => {
    const state = allocated([1, 1, 1], 1, 22);
    const done = { ...state, reviews: state.reviews.map((p) => ({ ...p, started: true })) };
    const joined = { ...done, reviewers: [...done.reviewers, { id: 'late', teamId: null }] };

    expect(addLateReviewer(joined, 'late', seeded(23))).toEqual({ remove: [], add: [] });
  });
});
