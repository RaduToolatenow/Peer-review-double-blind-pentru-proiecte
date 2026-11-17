-- D-011: reusable rubrics. Criteria move from assignments to rubrics.
-- Stop instead of dropping data: rubric_criteria.assignment_id has no rubric to map to.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rubric_criteria") THEN
    RAISE EXCEPTION 'rubric_criteria has rows; move them to rubrics by hand before this migration';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "RubricScope" AS ENUM ('ALL', 'SELECTED');

-- DropForeignKey
ALTER TABLE "rubric_criteria" DROP CONSTRAINT "rubric_criteria_assignment_id_fkey";

-- DropIndex
DROP INDEX "rubric_criteria_assignment_id_position_key";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "rubric_applies_to" "RubricScope" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "rubric_id" UUID;

-- AlterTable
ALTER TABLE "rubric_criteria" DROP COLUMN "assignment_id",
ADD COLUMN     "rubric_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "rubric_id" UUID;

-- CreateTable
CREATE TABLE "rubrics" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_rubric_id_position_key" ON "rubric_criteria"("rubric_id", "position");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A rubric has at most 100 criteria: positions are unique per rubric and between 1 and 100.
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_position_range" CHECK ("position" BETWEEN 1 AND 100);

-- A locked rubric keeps its criteria and levels unchanged.
CREATE FUNCTION "rubric_is_locked"(rubric UUID) RETURNS BOOLEAN AS $$
  SELECT "locked_at" IS NOT NULL FROM "rubrics" WHERE "id" = rubric;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION "rubric_criteria_guard_locked"() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND rubric_is_locked(OLD."rubric_id"))
     OR (TG_OP <> 'DELETE' AND rubric_is_locked(NEW."rubric_id")) THEN
    RAISE EXCEPTION 'rubric is locked: change a copy instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rubric_criteria_guard_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "rubric_criteria"
  FOR EACH ROW EXECUTE FUNCTION "rubric_criteria_guard_locked"();

CREATE FUNCTION "criterion_levels_guard_locked"() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND rubric_is_locked((SELECT "rubric_id" FROM "rubric_criteria" WHERE "id" = OLD."criterion_id")))
     OR (TG_OP <> 'DELETE' AND rubric_is_locked((SELECT "rubric_id" FROM "rubric_criteria" WHERE "id" = NEW."criterion_id"))) THEN
    RAISE EXCEPTION 'rubric is locked: change a copy instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "criterion_levels_guard_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "criterion_levels"
  FOR EACH ROW EXECUTE FUNCTION "criterion_levels_guard_locked"();

-- The first saved score locks the rubric it was given against.
CREATE FUNCTION "review_scores_lock_rubric"() RETURNS TRIGGER AS $$
BEGIN
  UPDATE "rubrics" SET "locked_at" = now()
  WHERE "locked_at" IS NULL
    AND "id" = (SELECT "rubric_id" FROM "rubric_criteria" WHERE "id" = NEW."criterion_id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "review_scores_lock_rubric"
  AFTER INSERT ON "review_scores"
  FOR EACH ROW EXECUTE FUNCTION "review_scores_lock_rubric"();

-- A rubric is never unlocked. It may be archived 2 days after the latest review deadline
-- of the assignments that use it, directly or through one of their teams.
CREATE FUNCTION "rubrics_guard_update"() RETURNS TRIGGER AS $$
DECLARE
  latest_deadline TIMESTAMPTZ;
BEGIN
  IF OLD."locked_at" IS NOT NULL AND NEW."locked_at" IS DISTINCT FROM OLD."locked_at" THEN
    RAISE EXCEPTION 'rubric is locked and cannot be unlocked' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."archived_at" IS NOT NULL AND OLD."archived_at" IS NULL THEN
    SELECT max(a."review_deadline") INTO latest_deadline
    FROM "assignments" a
    WHERE a."rubric_id" = NEW."id"
       OR EXISTS (SELECT 1 FROM "teams" t WHERE t."assignment_id" = a."id" AND t."rubric_id" = NEW."id");

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

CREATE TRIGGER "rubrics_guard_update"
  BEFORE UPDATE ON "rubrics"
  FOR EACH ROW EXECUTE FUNCTION "rubrics_guard_update"();

-- An archived rubric cannot be chosen for an assignment or a team.
CREATE FUNCTION "guard_archived_rubric"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."rubric_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."rubric_id" IS DISTINCT FROM OLD."rubric_id")
     AND EXISTS (SELECT 1 FROM "rubrics" WHERE "id" = NEW."rubric_id" AND "archived_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'rubric is archived and cannot be chosen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assignments_guard_archived_rubric"
  BEFORE INSERT OR UPDATE OF "rubric_id" ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION "guard_archived_rubric"();

CREATE TRIGGER "teams_guard_archived_rubric"
  BEFORE INSERT OR UPDATE OF "rubric_id" ON "teams"
  FOR EACH ROW EXECUTE FUNCTION "guard_archived_rubric"();
