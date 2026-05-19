-- AlterTable
-- SQLite has no array type; store the user's completed tour ids as a
-- JSON-encoded string. Null is the fresh-install state, treated as [] at the
-- application layer. Migration must NOT default to a non-empty value.
ALTER TABLE "user" ADD COLUMN "completed_tours" TEXT;
