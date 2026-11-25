-- D-027: disputes per criterion of a received review, decided by the assignment's professor.
ALTER TABLE "disputes" ADD COLUMN "criterion_id" UUID NOT NULL;
ALTER TABLE "disputes" ADD COLUMN "new_level_id" UUID;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "rubric_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- An upheld dispute's new level belongs to the disputed criterion.
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_new_level_id_criterion_id_fkey" FOREIGN KEY ("new_level_id", "criterion_id") REFERENCES "criterion_levels"("id", "criterion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once per review and criterion.
CREATE UNIQUE INDEX "disputes_review_id_criterion_id_key" ON "disputes"("review_id", "criterion_id");

-- An argument of at least 20 characters; a decision of at least 20 characters once decided;
-- a new level exactly when upheld.
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_argument_length" CHECK (char_length(btrim("argument")) >= 20);
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decision_state" CHECK (
  ("status" = 'OPEN' AND "decision" IS NULL AND "decided_at" IS NULL AND "new_level_id" IS NULL)
  OR ("status" = 'UPHELD' AND "new_level_id" IS NOT NULL AND "decided_at" IS NOT NULL AND char_length(btrim("decision")) >= 20)
  OR ("status" = 'REJECTED' AND "new_level_id" IS NULL AND "decided_at" IS NOT NULL AND char_length(btrim("decision")) >= 20)
);

-- A dispute is filed by a member of the reviewed team, on a sent review, for a criterion of its
-- rubric; it is decided once, by the assignment's professor, and never changes afterwards.
CREATE FUNCTION "disputes_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" <> 'OPEN' THEN
      RAISE EXCEPTION 'dispute is already decided';
    END IF;
    IF NEW."review_id" <> OLD."review_id" OR NEW."criterion_id" <> OLD."criterion_id"
       OR NEW."author_id" <> OLD."author_id" OR NEW."argument" <> OLD."argument" THEN
      RAISE EXCEPTION 'dispute is already filed';
    END IF;
    IF NEW."status" <> 'OPEN' AND NOT EXISTS (
      SELECT 1 FROM "reviews" r
      JOIN "submissions" s ON s."id" = r."submission_id"
      JOIN "assignments" a ON a."id" = s."assignment_id"
      WHERE r."id" = NEW."review_id" AND a."created_by_id" = NEW."decided_by_id"
    ) THEN
      RAISE EXCEPTION 'dispute is decided only by the assignment''s professor';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "reviews" r
    JOIN "submissions" s ON s."id" = r."submission_id"
    JOIN "team_members" m ON m."team_id" = s."team_id"
    WHERE r."id" = NEW."review_id" AND m."user_id" = NEW."author_id"
  ) THEN
    RAISE EXCEPTION 'dispute author is not in the reviewed team' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "reviews" r
    JOIN "submissions" s ON s."id" = r."submission_id"
    JOIN "assignments" a ON a."id" = s."assignment_id"
    JOIN "rubric_criteria" c ON c."rubric_id" = a."rubric_id"
    WHERE r."id" = NEW."review_id" AND r."status" = 'SUBMITTED' AND c."id" = NEW."criterion_id"
  ) THEN
    RAISE EXCEPTION 'dispute is not on a sent review of the rubric' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "disputes_guard"
  BEFORE INSERT OR UPDATE ON "disputes"
  FOR EACH ROW EXECUTE FUNCTION "disputes_guard"();

-- D-024: a fourth event, a dispute decided, one row per student and dispute.
ALTER TYPE "NotificationKind" ADD VALUE 'DISPUTE_DECIDED';
ALTER TABLE "notifications" ADD COLUMN "dispute_id" UUID;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "notifications_user_id_assignment_id_kind_key";
CREATE UNIQUE INDEX "notifications_user_id_assignment_id_kind_key" ON "notifications"("user_id", "assignment_id", "kind") WHERE "dispute_id" IS NULL;
CREATE UNIQUE INDEX "notifications_user_id_dispute_id_key" ON "notifications"("user_id", "dispute_id") WHERE "dispute_id" IS NOT NULL;
