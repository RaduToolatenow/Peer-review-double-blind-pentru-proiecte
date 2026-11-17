import { RubricScope } from '../generated/prisma/enums';

/**
 * The rubric a team is evaluated on (D-011), or null when the team is not evaluated.
 * A rubric given to the team wins; otherwise the assignment's rubric, if it applies to all teams.
 */
export function effectiveRubricId(
  assignment: { rubricId: string | null; rubricAppliesTo: RubricScope },
  team: { rubricId: string | null },
): string | null {
  if (team.rubricId) {
    return team.rubricId;
  }
  return assignment.rubricAppliesTo === RubricScope.ALL ? assignment.rubricId : null;
}
