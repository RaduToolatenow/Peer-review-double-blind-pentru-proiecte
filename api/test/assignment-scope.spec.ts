import { teamIsEvaluated } from '../src/assignments/assignment-scope';
import { RubricScope } from '../src/generated/prisma/enums';

describe('teamIsEvaluated (D-011, D-013)', () => {
  it('evaluates every team of the class when the rubric applies to all', () => {
    const assignment = { rubricAppliesTo: RubricScope.ALL, chosenTeamIds: [] };
    expect(teamIsEvaluated(assignment, 'team-a')).toBe(true);
  });

  it('evaluates a chosen team when the rubric applies only to chosen teams', () => {
    const assignment = { rubricAppliesTo: RubricScope.SELECTED, chosenTeamIds: ['team-a'] };
    expect(teamIsEvaluated(assignment, 'team-a')).toBe(true);
  });

  it('leaves out a team that was not chosen', () => {
    const assignment = { rubricAppliesTo: RubricScope.SELECTED, chosenTeamIds: ['team-a'] };
    expect(teamIsEvaluated(assignment, 'team-b')).toBe(false);
  });
});
