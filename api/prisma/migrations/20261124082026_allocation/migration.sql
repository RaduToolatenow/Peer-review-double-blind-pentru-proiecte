-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "allocated_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "assignment_withdrawals" (
    "assignment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_withdrawals_pkey" PRIMARY KEY ("assignment_id","user_id")
);

-- AddForeignKey
ALTER TABLE "assignment_withdrawals" ADD CONSTRAINT "assignment_withdrawals_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_withdrawals" ADD CONSTRAINT "assignment_withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D-022: nobody reviews a submission of their own team, whatever route or script writes the review.
CREATE FUNCTION "reviews_guard_own_team"() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "submissions" s
    JOIN "team_members" m ON m."team_id" = s."team_id"
    WHERE s."id" = NEW."submission_id" AND m."user_id" = NEW."reviewer_id"
  ) THEN
    RAISE EXCEPTION 'reviewer is in the submission''s team' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reviews_guard_own_team"
  BEFORE INSERT OR UPDATE OF "submission_id", "reviewer_id" ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "reviews_guard_own_team"();
