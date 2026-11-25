import {
  aggregate,
  explain,
  GradeCriterion,
  OwnReview,
  reliabilities,
  ReviewerReliability,
  reviewerGrades,
  SentReview,
} from '../src/grades/grade';

/** D-025: reliability and grades as pure functions. */

const ONE: GradeCriterion[] = [{ id: 'c', weight: 1, lowest: 1, highest: 5 }];

function review(submissionId: string, reviewerId: string, levels: Record<string, number>, calibration = false): SentReview {
  return { submissionId, reviewerId, calibration, levels };
}

function rel(map: Map<string, ReviewerReliability>, id: string) {
  return map.get(id)!;
}

describe('reliabilities (D-025)', () => {
  it("measures against the professor's level on a calibrated submission", () => {
    const result = reliabilities(ONE, [
      review('s1', 'prof', { c: 5 }, true),
      review('s1', 'a', { c: 5 }),
      review('s1', 'b', { c: 1 }),
    ]);
    expect(rel(result, 'a')).toEqual({ reviewerId: 'a', reliability: 1, flagged: false, measured: true });
    // Deviation 4 of a range of 4: reliability 0, raised to the 0.2 floor and flagged.
    expect(rel(result, 'b')).toEqual({ reviewerId: 'b', reliability: 0.2, flagged: true, measured: true });
    expect(result.has('prof')).toBe(false);
  });

  it("measures against the other reviewers' median elsewhere", () => {
    const result = reliabilities(ONE, [review('s2', 'a', { c: 4 }), review('s2', 'b', { c: 4 }), review('s2', 'c', { c: 2 })]);
    // c: others 4 and 4, median 4, deviation 2/4.
    expect(rel(result, 'c').reliability).toBeCloseTo(0.5);
    expect(rel(result, 'c').flagged).toBe(true);
    // a: others 4 and 2, median 3, deviation 1/4.
    expect(rel(result, 'a').reliability).toBeCloseTo(0.75);
    expect(rel(result, 'a').flagged).toBe(false);
  });

  it('is not flagged at exactly 0.6', () => {
    const range10: GradeCriterion[] = [{ id: 'c', weight: 1, lowest: 0, highest: 10 }];
    const result = reliabilities(range10, [review('s', 'prof', { c: 10 }, true), review('s', 'a', { c: 6 })]);
    expect(rel(result, 'a').reliability).toBeCloseTo(0.6);
    expect(rel(result, 'a').flagged).toBe(false);
  });

  it('averages the deviations with the criterion weights', () => {
    const two: GradeCriterion[] = [
      { id: 'x', weight: 3, lowest: 0, highest: 10 },
      { id: 'y', weight: 1, lowest: 0, highest: 10 },
    ];
    const result = reliabilities(two, [review('s', 'prof', { x: 10, y: 10 }, true), review('s', 'a', { x: 10, y: 0 })]);
    // (3 × 0 + 1 × 1) / 4
    expect(rel(result, 'a').reliability).toBeCloseTo(0.75);
  });

  it('averages the two middle levels for an even number of other reviewers', () => {
    const result = reliabilities(ONE, [review('s', 'a', { c: 3 }), review('s', 'b', { c: 2 }), review('s', 'c', { c: 4 })]);
    // a: others 2 and 4, median 3.
    expect(rel(result, 'a').reliability).toBe(1);
  });

  it('gives reliability 1, not measured, with nothing to compare against', () => {
    const result = reliabilities(ONE, [review('s3', 'd', { c: 1 })]);
    expect(rel(result, 'd')).toEqual({ reviewerId: 'd', reliability: 1, flagged: false, measured: false });
  });
});

describe('aggregate (D-025)', () => {
  const two: GradeCriterion[] = [
    { id: 'x', weight: 3, lowest: 1, highest: 5 },
    { id: 'y', weight: 1, lowest: 1, highest: 3 },
  ];

  function given(entries: [string, number][]) {
    return new Map(entries.map(([id, reliability]) => [id, { reviewerId: id, reliability, flagged: false, measured: true }]));
  }

  it('takes the reliability-weighted mean per criterion, then the criterion weights, on 1–10', () => {
    const grades = aggregate(
      two,
      [review('s', 'a', { x: 5, y: 3 }), review('s', 'b', { x: 1, y: 1 })],
      given([['a', 1], ['b', 0.2]]),
      ['s'],
    );
    // x: (5 + 0.2) / 1.2 → 0.8333 of the range; y the same; 1 + 9 × 0.8333 = 8.5
    expect(grades.get('s')).toBe(8.5);
  });

  it("counts the professor's calibration review at reliability 1", () => {
    const grades = aggregate(
      two,
      [review('s', 'prof', { x: 5, y: 3 }, true), review('s', 'b', { x: 1, y: 1 })],
      given([['b', 0.2]]),
      ['s'],
    );
    expect(grades.get('s')).toBe(8.5);
  });

  it('rounds to 2 decimals', () => {
    const range7: GradeCriterion[] = [{ id: 'c', weight: 1, lowest: 0, highest: 7 }];
    // 1 + 9 × 1/7 = 2.2857…
    expect(aggregate(range7, [review('s', 'a', { c: 1 })], given([['a', 1]]), ['s']).get('s')).toBe(2.29);
  });

  it('gives no grade to a submission without sent reviews', () => {
    const grades = aggregate(two, [review('s', 'a', { x: 5, y: 3 })], given([['a', 1]]), ['s', 'empty']);
    expect(grades.get('s')).toBe(10);
    expect(grades.get('empty')).toBeNull();
  });
});

describe('explain (D-026)', () => {
  const two: GradeCriterion[] = [
    { id: 'x', weight: 3, lowest: 1, highest: 5 },
    { id: 'y', weight: 1, lowest: 1, highest: 3 },
  ];
  const reliability = new Map([['b', { reviewerId: 'b', reliability: 0.2, flagged: true, measured: true }]]);

  it("gives each reviewer's weight, each criterion's weighted mean and scaled value, and the grade", () => {
    const sent = [review('s', 'prof', { x: 5, y: 3 }, true), review('s', 'b', { x: 1, y: 1 })];
    const result = explain(two, sent, reliability);

    expect(result.weights).toEqual([1, 0.2]);
    expect(result.criteria.map((c) => c.id)).toEqual(['x', 'y']);
    expect(result.criteria[0].mean).toBeCloseTo(5.2 / 1.2);
    expect(result.criteria[0].scaled).toBeCloseTo(0.8333, 4);
    expect(result.criteria[1].mean).toBeCloseTo(3.2 / 1.2);
    expect(result.grade).toBe(8.5);
    expect(result.grade).toBe(aggregate(two, sent, reliability, ['s']).get('s'));
  });

  it('gives no grade and no means without sent reviews', () => {
    const result = explain(two, [], reliability);
    expect(result.grade).toBeNull();
    expect(result.weights).toEqual([]);
    expect(result.criteria.map((c) => [c.mean, c.scaled])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
});

describe('reviewerGrades (D-028)', () => {
  /** A peer review as the reviewer grade sees it: original levels, upheld levels and the rating. */
  function own(
    id: string,
    submissionId: string,
    reviewerId: string,
    levels: Record<string, number> | null,
    extra: Partial<OwnReview> = {},
  ): OwnReview {
    return { id, submissionId, reviewerId, sent: levels !== null, levels: levels ?? {}, upheld: {}, rating: null, ...extra };
  }

  it('gives 10 to a reviewer who matches the reference and a low grade to one who gives every top level', () => {
    const sent = [
      review('s1', 'prof', { c: 2 }, true),
      review('s1', 'a', { c: 2 }),
      review('s1', 'tens', { c: 5 }),
    ];
    const result = reviewerGrades(ONE, sent, [
      own('r1', 's1', 'a', { c: 2 }),
      own('r2', 's1', 'tens', { c: 5 }),
    ]);
    expect(result.get('a')!.grade).toBe(10);
    // Deviation 3 of 4: accuracy 0.25, grade 1 + 9 × 0.25 = 3.25.
    expect(result.get('tens')!.grade).toBe(3.25);
    expect(result.get('tens')!.reviews[0]).toMatchObject({ id: 'r2', accuracy: 0.25, rating: null, grade: 3.25, counted: true });
    expect(result.has('prof')).toBe(false);
  });

  it("mixes accuracy and the professor's rating 70/30", () => {
    const sent = [review('s1', 'prof', { c: 2 }, true), review('s1', 'a', { c: 2 })];
    const result = reviewerGrades(ONE, sent, [own('r1', 's1', 'a', { c: 2 }, { rating: 1 })]);
    // 1 + 9 × (0.7 × 1 + 0.3 × 0) = 7.3
    expect(result.get('a')!.grade).toBe(7.3);
    const rated5 = reviewerGrades(ONE, sent, [own('r1', 's1', 'a', { c: 2 }, { rating: 5 })]);
    expect(rated5.get('a')!.grade).toBe(10);
  });

  it('counts an unsent review as 1 and gives no grade without any review', () => {
    const sent = [review('s1', 'prof', { c: 2 }, true), review('s1', 'a', { c: 2 })];
    const result = reviewerGrades(ONE, sent, [own('r1', 's1', 'a', { c: 2 }), own('r2', 's2', 'a', null), own('r3', 's3', 'b', null)]);
    // (10 + 1) / 2
    expect(result.get('a')!.grade).toBe(5.5);
    expect(result.get('a')!.reviews[1]).toMatchObject({ id: 'r2', sent: false, accuracy: null, grade: 1, counted: true });
    expect(result.get('b')!.grade).toBe(1);
    expect(reviewerGrades(ONE, [], []).size).toBe(0);
  });

  it("measures the reviewer's original level against an upheld dispute's new level", () => {
    // The reviewer gave 5; the professor upheld a dispute with 2. The grade uses 2 (D-027),
    // and the reviewer grade measures the original 5 against it.
    const sent = [review('s1', 'a', { c: 2 })];
    const result = reviewerGrades(ONE, sent, [own('r1', 's1', 'a', { c: 5 }, { upheld: { c: 2 } })]);
    expect(result.get('a')!.reviews[0].accuracy).toBe(0.25);
    expect(result.get('a')!.grade).toBe(3.25);
  });

  it("uses the other peers' median, and leaves out a review with no reference and no rating", () => {
    const sent = [review('s1', 'a', { c: 4 }), review('s1', 'b', { c: 4 }), review('s1', 'c', { c: 2 }), review('s2', 'd', { c: 1 })];
    const result = reviewerGrades(ONE, sent, [
      own('r1', 's1', 'c', { c: 2 }),
      own('r2', 's2', 'd', { c: 1 }),
      own('r3', 's2', 'e', null),
    ]);
    // c: others 4 and 4, deviation 2/4, accuracy 0.5, grade 5.5.
    expect(result.get('c')!.grade).toBe(5.5);
    expect(result.get('d')!.reviews[0]).toMatchObject({ accuracy: null, grade: null, counted: false });
    expect(result.get('d')!.grade).toBeNull();
    // A rating alone still grades the review: 1 + 9 × 0.75.
    const rated = reviewerGrades(ONE, sent, [own('r2', 's2', 'd', { c: 1 }, { rating: 4 })]);
    expect(rated.get('d')!.grade).toBe(7.75);
  });
});
