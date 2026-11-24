-- D-023: a review is sent once, complete and final.

-- A score's level must belong to the scored criterion.
ALTER TABLE "review_scores" DROP CONSTRAINT "review_scores_level_id_fkey";

CREATE UNIQUE INDEX "criterion_levels_id_criterion_id_key" ON "criterion_levels"("id", "criterion_id");

ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_level_id_criterion_id_fkey" FOREIGN KEY ("level_id", "criterion_id") REFERENCES "criterion_levels"("id", "criterion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Feedback for every criterion, at least 20 characters after trimming.
ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_feedback_length" CHECK (char_length(btrim("feedback")) >= 20);

-- A score is written only on an unsent review, for a criterion of the review's rubric.
CREATE FUNCTION "review_scores_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT "status" FROM "reviews" WHERE "id" = NEW."review_id") = 'SUBMITTED'
     OR (TG_OP = 'UPDATE' AND (SELECT "status" FROM "reviews" WHERE "id" = OLD."review_id") = 'SUBMITTED') THEN
    RAISE EXCEPTION 'review is already sent';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "reviews" r
    JOIN "submissions" s ON s."id" = r."submission_id"
    JOIN "assignments" a ON a."id" = s."assignment_id"
    JOIN "rubric_criteria" c ON c."rubric_id" = a."rubric_id"
    WHERE r."id" = NEW."review_id" AND c."id" = NEW."criterion_id"
  ) THEN
    RAISE EXCEPTION 'criterion is not in the review rubric';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "review_scores_guard"
  BEFORE INSERT OR UPDATE ON "review_scores"
  FOR EACH ROW EXECUTE FUNCTION "review_scores_guard"();

-- A review becomes SUBMITTED only with every criterion of its rubric scored; a sent review
-- never changes. Deleting it (a cascade from its submission) is still allowed.
CREATE FUNCTION "reviews_guard_update"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'SUBMITTED' THEN
    RAISE EXCEPTION 'review is already sent';
  END IF;
  IF NEW."status" = 'SUBMITTED' AND (
    SELECT count(*)
    FROM "submissions" s
    JOIN "assignments" a ON a."id" = s."assignment_id"
    JOIN "rubric_criteria" c ON c."rubric_id" = a."rubric_id"
    WHERE s."id" = NEW."submission_id"
  ) <> (SELECT count(*) FROM "review_scores" WHERE "review_id" = NEW."id") THEN
    RAISE EXCEPTION 'review is incomplete';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reviews_guard_update"
  BEFORE UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "reviews_guard_update"();
