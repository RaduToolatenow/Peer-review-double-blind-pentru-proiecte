-- D-016: a submission always has a cleaned PDF or DOCX file, and an optional description.
-- Stop instead of guessing a file type for rows that have none.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "submissions") THEN
    RAISE EXCEPTION 'submissions has rows; give them a file_key and file_type by hand first';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "description" TEXT,
ADD COLUMN     "file_type" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "file_key" SET NOT NULL;


ALTER TABLE "submissions" ADD CONSTRAINT "submissions_file_type_known" CHECK ("file_type" IN ('pdf', 'docx'));
