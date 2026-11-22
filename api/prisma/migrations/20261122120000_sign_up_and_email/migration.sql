-- D-010, D-020: sign-up with a confirmed university email, password reset, assignment links.
-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY', 'RESET');

-- AlterTable: every assignment, including existing ones, gets a random sign-up link code (D-010).
ALTER TABLE "assignments" ADD COLUMN     "join_code" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ;

-- Accounts created before D-020 (the seeded test accounts) count as confirmed.
UPDATE "users" SET "email_verified_at" = now();

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "assignment_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_requests" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_reviewers" (
    "assignment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_reviewers_pkey" PRIMARY KEY ("assignment_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_requests_email_created_at_idx" ON "email_requests"("email", "created_at");

-- CreateIndex
CREATE INDEX "email_requests_ip_created_at_idx" ON "email_requests"("ip", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_join_code_key" ON "assignments"("join_code");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_reviewers" ADD CONSTRAINT "assignment_reviewers_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_reviewers" ADD CONSTRAINT "assignment_reviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

