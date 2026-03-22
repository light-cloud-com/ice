import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
export { PrismaClient };
export type { Prisma } from '@prisma/client';
