-- CreateTable: Organisation Members (role-based membership)
CREATE TABLE "organisation_member" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Invitations
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisation_member_user_id_organisation_id_key" ON "organisation_member"("user_id", "organisation_id");
CREATE INDEX "invitation_email_idx" ON "invitation"("email");
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");
CREATE INDEX "invitation_token_idx" ON "invitation"("token");

-- AddForeignKey
ALTER TABLE "organisation_member" ADD CONSTRAINT "organisation_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organisation_member" ADD CONSTRAINT "organisation_member_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing users into OrganisationMember as owners
INSERT INTO "organisation_member" ("id", "user_id", "organisation_id", "role")
SELECT gen_random_uuid()::text, u.id, u.organisation_id, 'owner'
FROM "user" u
WHERE u.organisation_id IS NOT NULL;
