import 'dotenv/config';
import { PrismaClient, RoleCode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

const ROLE_DISPLAY_NAME: Partial<Record<RoleCode, string>> = {
  [RoleCode.EMPLOYEE]: 'Employee',
  [RoleCode.UNIT_COORDINATOR]: 'Unit Coordinator',
  [RoleCode.SELECTION_COMMITTEE]: 'Selection Committee',
  [RoleCode.IMPLEMENTER]: 'Implementer',
  [RoleCode.BUSINESS_EXCELLENCE]: 'Business Excellence',
  [RoleCode.BUSINESS_EXCELLENCE_HEAD]: 'Business Excellence Head',
  [RoleCode.HOD_FINANCE]: 'HOD Finance',
  [RoleCode.HOD_HR]: 'HOD HR',
  [RoleCode.HOD_QUALITY]: 'HOD Quality',
  [RoleCode.ADMIN]: 'Admin',
  [RoleCode.SUPER_ADMIN]: 'Super Admin',
  [RoleCode.BE_MEMBER]: 'BE Member',
  [RoleCode.BE_HEAD]: 'BE Head',
};

async function main() {
  const codes = Object.values(RoleCode);

  for (const code of codes) {
    const name = ROLE_DISPLAY_NAME[code] ?? code;
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: {
        code,
        name,
        description: `System role: ${code}`,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

