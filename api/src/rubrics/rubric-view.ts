export type RubricStatus = 'draft' | 'active' | 'archived';

interface StoredRubric {
  id: string;
  title: string;
  createdAt: Date;
  lockedAt: Date | null;
  archivedAt: Date | null;
}

interface StoredCriterion {
  id: string;
  title: string;
  weight: number;
  position: number;
  levels: { id: string; score: number; descriptor: string }[];
}

/** A draft can be edited; sending locks it (active); archiving hides it (D-011, D-013). */
export function rubricStatus(rubric: { lockedAt: Date | null; archivedAt: Date | null }): RubricStatus {
  if (rubric.archivedAt) {
    return 'archived';
  }
  return rubric.lockedAt ? 'active' : 'draft';
}

export function rubricSummary(rubric: StoredRubric & { _count: { criteria: number } }) {
  return {
    id: rubric.id,
    title: rubric.title,
    status: rubricStatus(rubric),
    criteriaCount: rubric._count.criteria,
    createdAt: rubric.createdAt,
  };
}

export function rubricView(rubric: StoredRubric & { criteria: StoredCriterion[] }) {
  return {
    id: rubric.id,
    title: rubric.title,
    status: rubricStatus(rubric),
    createdAt: rubric.createdAt,
    lockedAt: rubric.lockedAt,
    archivedAt: rubric.archivedAt,
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      weight: criterion.weight,
      position: criterion.position,
      levels: criterion.levels.map((level) => ({ id: level.id, score: level.score, descriptor: level.descriptor })),
    })),
  };
}

/** Prisma include that loads criteria and levels in display order. */
export const RUBRIC_WITH_CRITERIA = {
  criteria: { orderBy: { position: 'asc' }, include: { levels: { orderBy: { score: 'asc' } } } },
} as const;
