-- CreateTable
CREATE TABLE "deployment_rule" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL DEFAULT 'push',
    "branch_pattern" TEXT NOT NULL DEFAULT 'main',
    "environment" TEXT NOT NULL DEFAULT 'production',
    "build_command" TEXT,
    "install_command" TEXT,
    "output_dir" TEXT,
    "framework" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "webhook_id" INTEGER,
    "webhook_secret" TEXT,
    "organisation_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployment_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_event" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "deployment_id" TEXT,
    "trigger" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "commit_message" TEXT,
    "commit_author" TEXT,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "deployment_stage" TEXT,
    "deployment_logs" JSONB DEFAULT '[]',
    "deployed_url" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "error" TEXT,

    CONSTRAINT "deployment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployment_rule_repository_idx" ON "deployment_rule"("repository");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_rule_card_id_node_id_branch_pattern_key" ON "deployment_rule"("card_id", "node_id", "branch_pattern");

-- CreateIndex
CREATE INDEX "deployment_event_rule_id_idx" ON "deployment_event"("rule_id");

-- CreateIndex
CREATE INDEX "deployment_event_commit_sha_idx" ON "deployment_event"("commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_delivery_id_key" ON "webhook_delivery"("delivery_id");

-- AddForeignKey
ALTER TABLE "deployment_rule" ADD CONSTRAINT "deployment_rule_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_event" ADD CONSTRAINT "deployment_event_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "deployment_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
