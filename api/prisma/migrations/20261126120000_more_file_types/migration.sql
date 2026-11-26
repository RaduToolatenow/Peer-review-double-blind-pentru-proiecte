-- D-032: a submission's file may also be PPTX, ODT, ODP or a ZIP of source code.
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_file_type_known";
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_file_type_known"
  CHECK ("file_type" IN ('pdf', 'docx', 'pptx', 'odt', 'odp', 'zip'));
