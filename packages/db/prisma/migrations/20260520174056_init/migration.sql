-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar" TEXT,
    "organisation_id" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER NOT NULL DEFAULT 1,
    "default_provider" TEXT,
    "default_region" TEXT,
    "completed_tours" TEXT,
    "preferences" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "organisation_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organisation_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "organisation_member_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "accepted_at" DATETIME,
    CONSTRAINT "invitation_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "github_token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar_url" TEXT,
    "name" TEXT,
    "scope" TEXT,
    "connected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "github_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "canvas_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'project',
    "parent_id" TEXT,
    "provider" TEXT,
    "region" TEXT,
    "organisation_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "pr_previews_enabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "canvas_project_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "canvas_project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "granted_by" TEXT NOT NULL,
    "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "canvas_card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "viewport" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "canvas_card_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "environment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "environment_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "canvas_card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "provider_credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisation_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "project_id" TEXT,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "provider_credential_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "canvas_deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL,
    "action_type" TEXT NOT NULL DEFAULT 'apply',
    "provider" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "plan" JSONB,
    "results" JSONB,
    "summary" JSONB,
    "snapshot" JSONB,
    "duration_ms" INTEGER,
    "error" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "canvas_deployment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "canvas_deployment_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "canvas_card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deploy_event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deployment_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deploy_event_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "canvas_deployment" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "deployed_resource_mapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_name" TEXT NOT NULL,
    "provider_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deployed_resource_mapping_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "canvas_card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "block_requirement_status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "last_checked_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" DATETIME,
    "details" JSONB,
    CONSTRAINT "block_requirement_status_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "canvas_card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deploy_job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deployment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deploy_job_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "canvas_deployment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deployment_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "webhook_status" TEXT NOT NULL DEFAULT 'pending',
    "webhook_error" TEXT,
    "organisation_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deployment_rule_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deployment_event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rule_id" TEXT NOT NULL,
    "deployment_id" TEXT,
    "trigger" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "commit_message" TEXT,
    "commit_author" TEXT,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "deployment_stage" TEXT,
    "deployment_logs" JSONB DEFAULT [],
    "deployed_url" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "duration_seconds" INTEGER,
    "error" TEXT,
    CONSTRAINT "deployment_event_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "deployment_rule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "card_id" TEXT,
    "user_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ai_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "operations" JSONB,
    "operation_count" INTEGER NOT NULL DEFAULT 0,
    "suggestions" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "organisation_id" TEXT,
    "intent" TEXT NOT NULL,
    "canvas_before" JSONB NOT NULL,
    "operations" JSONB NOT NULL DEFAULT [],
    "raw_response" TEXT NOT NULL DEFAULT '',
    "parse_success" BOOLEAN NOT NULL DEFAULT false,
    "schema_validation" JSONB,
    "deploy_dry_run" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ai_audit_log_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_member_user_id_organisation_id_key" ON "organisation_member"("user_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_token_idx" ON "invitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "github_token_user_id_key" ON "github_token"("user_id");

-- CreateIndex
CREATE INDEX "canvas_project_organisation_id_idx" ON "canvas_project"("organisation_id");

-- CreateIndex
CREATE INDEX "canvas_project_parent_id_idx" ON "canvas_project"("parent_id");

-- CreateIndex
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_project_id_user_id_key" ON "project_member"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "environment_card_id_key" ON "environment"("card_id");

-- CreateIndex
CREATE INDEX "environment_project_id_idx" ON "environment"("project_id");

-- CreateIndex
CREATE INDEX "environment_pr_source_repo_pr_number_idx" ON "environment"("pr_source_repo", "pr_number");

-- CreateIndex
CREATE UNIQUE INDEX "environment_project_id_name_key" ON "environment"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credential_organisation_id_provider_key" ON "provider_credential"("organisation_id", "provider");

-- CreateIndex
CREATE INDEX "canvas_deployment_card_id_status_created_at_idx" ON "canvas_deployment"("card_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "canvas_deployment_card_id_environment_created_at_idx" ON "canvas_deployment"("card_id", "environment", "created_at");

-- CreateIndex
CREATE INDEX "canvas_deployment_card_id_action_type_created_at_idx" ON "canvas_deployment"("card_id", "action_type", "created_at");

-- CreateIndex
CREATE INDEX "canvas_deployment_user_id_idx" ON "canvas_deployment"("user_id");

-- CreateIndex
CREATE INDEX "deploy_event_card_id_created_at_idx" ON "deploy_event"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "deploy_event_deployment_id_seq_idx" ON "deploy_event"("deployment_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "deploy_event_deployment_id_seq_key" ON "deploy_event"("deployment_id", "seq");

-- CreateIndex
CREATE INDEX "deployed_resource_mapping_card_id_environment_idx" ON "deployed_resource_mapping"("card_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "deployed_resource_mapping_card_id_node_id_environment_key" ON "deployed_resource_mapping"("card_id", "node_id", "environment");

-- CreateIndex
CREATE INDEX "block_requirement_status_card_id_environment_idx" ON "block_requirement_status"("card_id", "environment");

-- CreateIndex
CREATE INDEX "block_requirement_status_status_last_checked_at_idx" ON "block_requirement_status"("status", "last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "block_requirement_status_card_id_node_id_environment_requirement_id_key" ON "block_requirement_status"("card_id", "node_id", "environment", "requirement_id");

-- CreateIndex
CREATE INDEX "deploy_job_status_started_at_idx" ON "deploy_job"("status", "started_at");

-- CreateIndex
CREATE INDEX "deployment_rule_repository_idx" ON "deployment_rule"("repository");

-- CreateIndex
CREATE INDEX "deployment_rule_card_id_idx" ON "deployment_rule"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_rule_card_id_node_id_branch_pattern_key" ON "deployment_rule"("card_id", "node_id", "branch_pattern");

-- CreateIndex
CREATE INDEX "deployment_event_rule_id_idx" ON "deployment_event"("rule_id");

-- CreateIndex
CREATE INDEX "deployment_event_commit_sha_idx" ON "deployment_event"("commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_delivery_id_key" ON "webhook_delivery"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_created_at_idx" ON "webhook_delivery"("created_at");

-- CreateIndex
CREATE INDEX "ai_conversation_project_id_user_id_idx" ON "ai_conversation"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_conversation_organisation_id_idx" ON "ai_conversation"("organisation_id");

-- CreateIndex
CREATE INDEX "ai_message_conversation_id_idx" ON "ai_message"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_audit_log_created_at_idx" ON "ai_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_audit_log_user_id_idx" ON "ai_audit_log"("user_id");

-- CreateIndex
CREATE INDEX "ai_audit_log_organisation_id_idx" ON "ai_audit_log"("organisation_id");
