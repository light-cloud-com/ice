-- AlterTable
ALTER TABLE "canvas_project" ADD COLUMN     "pr_previews_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "environment" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'development',
    "region" TEXT,
    "is_protected" BOOLEAN NOT NULL DEFAULT false,
    "pr_number" INTEGER,
    "pr_branch" TEXT,
    "pr_source_repo" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "environment_card_id_key" ON "environment"("card_id");

-- CreateIndex
CREATE INDEX "environment_project_id_idx" ON "environment"("project_id");

-- CreateIndex
CREATE INDEX "environment_pr_source_repo_pr_number_idx" ON "environment"("pr_source_repo", "pr_number");

-- CreateIndex
CREATE UNIQUE INDEX "environment_project_id_name_key" ON "environment"("project_id", "name");

-- AddForeignKey
ALTER TABLE "environment" ADD CONSTRAINT "environment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment" ADD CONSTRAINT "environment_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "canvas_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
