import { RubricScope } from '../generated/prisma/enums';

/**
 * Whether a team of the assignment's class is evaluated on the assignment's rubric (D-011, D-013).
 * A team left out is not allocated and gets no grade; its members may still review.
 */
export function teamIsEvaluated(
  assignment: { rubricAppliesTo: RubricScope; chosenTeamIds: readonly string[] },
  teamId: string,
): boolean {
  return assignment.rubricAppliesTo === RubricScope.ALL || assignment.chosenTeamIds.includes(teamId);
}
