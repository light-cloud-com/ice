/**
 * Database Seed (development only)
 *
 * Creates a default user with no organisation.
 * Reads credentials from env: ICE_SEED_EMAIL, ICE_SEED_PASSWORD.
 * Generates a random password if ICE_SEED_PASSWORD is unset and prints it.
 * Run: pnpm seed
 */

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

async function main() {
  const email = process.env.ICE_SEED_EMAIL ?? 'dev@example.local';
  const password = process.env.ICE_SEED_PASSWORD ?? generatePassword();
  const generated = !process.env.ICE_SEED_PASSWORD;

  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  let orgId = existingUser?.organisation_id;

  if (!orgId) {
    const org = await prisma.organisation.create({
      data: { name: "Test User's Org" },
    });
    orgId = org.id;
    console.log(`  Created org: ${org.name} (${org.id})`);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password_hash: passwordHash,
      organisation_id: orgId,
      onboarding_completed: false,
      onboarding_step: 1,
    },
    create: {
      email,
      name: 'Test User',
      password_hash: passwordHash,
      organisation_id: orgId,
      onboarding_completed: false,
      onboarding_step: 1,
    },
  });
  console.log(`  Upserted user: ${user.email} (${user.id}) — onboarding pending`);

  await prisma.organisationMember.upsert({
    where: { user_id_organisation_id: { user_id: user.id, organisation_id: orgId! } },
    update: { role: 'owner' },
    create: { user_id: user.id, organisation_id: orgId!, role: 'owner' },
  });
  console.log(`  Org membership: owner`);

  console.log('\nSeed complete!');
  console.log(`\n  Login: ${email}`);
  if (generated) {
    console.log(`  Password (generated, save it): ${password}\n`);
  } else {
    console.log(`  Password: (from ICE_SEED_PASSWORD env)\n`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
