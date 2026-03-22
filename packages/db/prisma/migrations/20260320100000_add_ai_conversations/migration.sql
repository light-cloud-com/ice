-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "card_id" TEXT,
    "user_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "operations" JSONB,
    "operation_count" INTEGER NOT NULL DEFAULT 0,
    "suggestions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversation_project_id_user_id_idx" ON "ai_conversation"("project_id", "user_id");
CREATE INDEX "ai_conversation_organisation_id_idx" ON "ai_conversation"("organisation_id");
CREATE INDEX "ai_message_conversation_id_idx" ON "ai_message"("conversation_id");

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
