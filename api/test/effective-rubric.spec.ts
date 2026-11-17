import { RubricScope } from '../src/generated/prisma/enums';
import { effectiveRubricId } from '../src/rubrics/effective-rubric';

describe('effectiveRubricId (D-011)', () => {
  it("uses the team's own rubric before the assignment's", () => {
    const assignment = { rubricId: 'assignment-rubric', rubricAppliesTo: RubricScope.ALL };
    expect(effectiveRubricId(assignment, { rubricId: 'team-rubric' })).toBe('team-rubric');
  });

  it("gives every team the assignment's rubric when it applies to all", () => {
    const assignment = { rubricId: 'assignment-rubric', rubricAppliesTo: RubricScope.ALL };
    expect(effectiveRubricId(assignment, { rubricId: null })).toBe('assignment-rubric');
  });

  it('leaves a team out when the rubric applies only to chosen teams and it was not chosen', () => {
    const assignment = { rubricId: 'assignment-rubric', rubricAppliesTo: RubricScope.SELECTED };
    expect(effectiveRubricId(assignment, { rubricId: null })).toBeNull();
  });

  it('leaves every team out when the assignment has no rubric yet', () => {
    const assignment = { rubricId: null, rubricAppliesTo: RubricScope.ALL };
    expect(effectiveRubricId(assignment, { rubricId: null })).toBeNull();
  });
});
