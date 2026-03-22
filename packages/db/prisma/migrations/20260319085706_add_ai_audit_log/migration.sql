-- CreateTable
CREATE TABLE "ai_audit_log" (
    "id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "canvas_before" JSONB NOT NULL,
    "operations" JSONB NOT NULL DEFAULT '[]',
    "raw_response" TEXT NOT NULL DEFAULT '',
    "parse_success" BOOLEAN NOT NULL DEFAULT false,
    "schema_validation" JSONB,
    "deploy_dry_run" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_audit_log_created_at_idx" ON "ai_audit_log"("created_at" DESC);
