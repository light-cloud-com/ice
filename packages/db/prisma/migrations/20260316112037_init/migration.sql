-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar" TEXT,
    "organisation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar_url" TEXT,
    "name" TEXT,
    "scope" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'project',
    "parent_id" TEXT,
    "organisation_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "viewport" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credential" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "project_id" TEXT,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_deployment" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "plan" JSONB,
    "results" JSONB,
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_job" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deploy_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "github_token_user_id_key" ON "github_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credential_organisation_id_provider_key" ON "provider_credential"("organisation_id", "provider");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_token" ADD CONSTRAINT "github_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_project" ADD CONSTRAINT "canvas_project_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_project" ADD CONSTRAINT "canvas_project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_card" ADD CONSTRAINT "canvas_card_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credential" ADD CONSTRAINT "provider_credential_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_job" ADD CONSTRAINT "deploy_job_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "canvas_deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
