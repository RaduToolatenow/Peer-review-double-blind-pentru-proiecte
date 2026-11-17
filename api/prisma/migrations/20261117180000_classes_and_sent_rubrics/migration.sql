-- D-012, D-013: teams belong to classes; an assignment is a rubric sent to a class.
-- Stop instead of dropping data: these tables have no class to map their rows to.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "assignments") OR EXISTS (SELECT 1 FROM "teams")
     OR EXISTS (SELECT 1 FROM "team_members") OR EXISTS (SELECT 1 FROM "submissions") THEN
    RAISE EXCEPTION 'assignments, teams, team_members or submissions has rows; move them by hand first';
  END IF;
END $$;

-- teams.rubric_id goes away: chosen teams now live in assignment_teams.
DROP TRIGGER "teams_guard_archived_rubric" ON "teams";

-- DropForeignKey
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_team_id_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "teams" DROP CONSTRAINT "teams_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "teams" DROP CONSTRAINT "teams_rubric_id_fkey";

-- DropIndex
DROP INDEX "submissions_team_id_key";

-- DropIndex
DROP INDEX "team_members_assignment_id_user_id_key";

-- DropIndex
DROP INDEX "teams_id_assignment_id_key";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "class_id" UUID NOT NULL,
ALTER COLUMN "rubric_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "assignment_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "team_members" DROP COLUMN "assignment_id",
ADD COLUMN     "class_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "teams" DROP COLUMN "assignment_id",
DROP COLUMN "rubric_id",
ADD COLUMN     "class_id" UUID NOT NULL,
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "join_code" TEXT NOT NULL,
ADD COLUMN     "member_names" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_teams" (
    "assignment_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,

    CONSTRAINT "assignment_teams_pkey" PRIMARY KEY ("assignment_id","team_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assignments_id_class_id_key" ON "assignments"("id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignment_id_team_id_key" ON "submissions"("assignment_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_class_id_user_id_key" ON "team_members"("class_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_join_code_key" ON "teams"("join_code");

-- CreateIndex
CREATE UNIQUE INDEX "teams_id_class_id_key" ON "teams"("id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_class_id_name_key" ON "teams"("class_id", "name");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_teams" ADD CONSTRAINT "assignment_teams_assignment_id_class_id_fkey" FOREIGN KEY ("assignment_id", "class_id") REFERENCES "assignments"("id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_teams" ADD CONSTRAINT "assignment_teams_team_id_class_id_fkey" FOREIGN KEY ("team_id", "class_id") REFERENCES "teams"("id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_class_id_fkey" FOREIGN KEY ("team_id", "class_id") REFERENCES "teams"("id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A rubric sent to a class is locked (D-013).
CREATE FUNCTION "assignments_lock_rubric"() RETURNS TRIGGER AS $$
BEGIN
  UPDATE "rubrics" SET "locked_at" = now() WHERE "id" = NEW."rubric_id" AND "locked_at" IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assignments_lock_rubric"
  AFTER INSERT ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION "assignments_lock_rubric"();

-- Archiving now looks only at the assignments the rubric was sent with.
CREATE OR REPLACE FUNCTION "rubrics_guard_update"() RETURNS TRIGGER AS $$
DECLARE
  latest_deadline TIMESTAMPTZ;
BEGIN
  IF OLD."locked_at" IS NOT NULL AND NEW."locked_at" IS DISTINCT FROM OLD."locked_at" THEN
    RAISE EXCEPTION 'rubric is locked and cannot be unlocked' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."archived_at" IS NOT NULL AND OLD."archived_at" IS NULL THEN
    SELECT max("review_deadline") INTO latest_deadline FROM "assignments" WHERE "rubric_id" = NEW."id";

    IF latest_deadline IS NOT NULL AND now() < latest_deadline + INTERVAL '2 days' THEN
      RAISE EXCEPTION 'cannot archive rubric before %', latest_deadline + INTERVAL '2 days'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The server's clock decides when a rubric was archived, not the caller.
    NEW."archived_at" := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
