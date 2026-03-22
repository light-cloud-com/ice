/**
 * Database Seed
 *
 * Creates a default user with no organisation.
 * The user creates their first team via the app.
 * Run: pnpm seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── User ─────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 10);

  // Ensure org exists
  const existingUser = await prisma.user.findUnique({ where: { email: 'test@ice-saas.dev' } });
  let orgId = existingUser?.organisation_id;

  if (!orgId) {
    const org = await prisma.organisation.create({
      data: { name: "Test User's Org" },
    });
    orgId = org.id;
    console.log(`  Created org: ${org.name} (${org.id})`);
  }

  const user = await prisma.user.upsert({
    where: { email: 'test@ice-saas.dev' },
    update: {
      password_hash: passwordHash,
      organisation_id: orgId,
      onboarding_completed: false,
      onboarding_step: 1,
    },
    create: {
      email: 'test@ice-saas.dev',
      name: 'Test User',
      password_hash: passwordHash,
      organisation_id: orgId,
      onboarding_completed: false,
      onboarding_step: 1,
    },
  });
  console.log(`  Upserted user: ${user.email} (${user.id}) — onboarding pending`);

  // Ensure org membership exists
  await prisma.organisationMember.upsert({
    where: { user_id_organisation_id: { user_id: user.id, organisation_id: orgId! } },
    update: { role: 'owner' },
    create: { user_id: user.id, organisation_id: orgId!, role: 'owner' },
  });
  console.log(`  Org membership: owner`);

  console.log('\nSeed complete!');
  console.log(`\n  Login: test@ice-saas.dev / password123\n`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
