-- D-025: a calibration review is written only by the professor who created the assignment,
-- and that professor writes only calibration reviews.
CREATE FUNCTION "reviews_guard_calibration"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."is_calibration" IS DISTINCT FROM (NEW."reviewer_id" = (
    SELECT a."created_by_id"
    FROM "submissions" s
    JOIN "assignments" a ON a."id" = s."assignment_id"
    WHERE s."id" = NEW."submission_id"
  )) THEN
    RAISE EXCEPTION 'calibration review is only by the assignment''s professor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reviews_guard_calibration"
  BEFORE INSERT OR UPDATE OF "submission_id", "reviewer_id", "is_calibration" ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "reviews_guard_calibration"();
