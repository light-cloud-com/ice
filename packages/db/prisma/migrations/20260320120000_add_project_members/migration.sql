-- CreateTable: Project Members (project-level access control)
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_member_project_id_user_id_key" ON "project_member"("project_id", "user_id");
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "canvas_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing project creators as project owners
INSERT INTO "project_member" ("id", "project_id", "user_id", "role", "granted_by")
SELECT gen_random_uuid()::text, p.id, p.created_by, 'owner', p.created_by
FROM "canvas_project" p
WHERE p.type = 'project';
