-- AlterTable
ALTER TABLE "user" ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "onboarding_step" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN "default_provider" TEXT;
ALTER TABLE "user" ADD COLUMN "default_region" TEXT;

-- Mark existing users as having completed onboarding so they are not forced through it
UPDATE "user" SET "onboarding_completed" = true;
