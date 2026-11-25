-- D-028: the professor's 1–5 rating of a sent peer review's feedback, one per review.
CREATE TABLE "review_ratings" (
    "review_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "rated_by_id" UUID NOT NULL,
    "rated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_ratings_pkey" PRIMARY KEY ("review_id")
);

ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_rated_by_id_fkey" FOREIGN KEY ("rated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Only a sent review that is not a calibration review is rated, and only by the professor who
-- created the assignment.
CREATE FUNCTION "review_ratings_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "reviews" r
    WHERE r."id" = NEW."review_id" AND r."status" = 'SUBMITTED' AND NOT r."is_calibration"
  ) THEN
    RAISE EXCEPTION 'review rating needs a sent peer review' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "reviews" r
    JOIN "submissions" s ON s."id" = r."submission_id"
    JOIN "assignments" a ON a."id" = s."assignment_id"
    WHERE r."id" = NEW."review_id" AND a."created_by_id" = NEW."rated_by_id"
  ) THEN
    RAISE EXCEPTION 'review is rated only by the assignment''s professor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "review_ratings_guard"
  BEFORE INSERT OR UPDATE ON "review_ratings"
  FOR EACH ROW EXECUTE FUNCTION "review_ratings_guard"();
