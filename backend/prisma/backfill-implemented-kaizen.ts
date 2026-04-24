import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const IMPLEMENTED_PREFIX = 'KH-KZ';

async function main() {
  const connectionString = String(process.env.DATABASE_URL ?? '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg(connectionString);
  const prisma = new PrismaClient({ adapter });
  try {
    // Find all rewarded ideas that don't yet have an implemented_kaizen row.
    const rewarded = await prisma.suggestion.findMany({
      where: { status: 'Rewarded & Closed' },
      select: { id: true, code: true },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });

    let created = 0;
    for (const s of rewarded) {
      const existing = await prisma.implementedKaizen.findUnique({
        where: { suggestionId: s.id },
        select: { implementedCode: true },
      });
      if (existing?.implementedCode) continue;

      const year = new Date().getFullYear();
      const counter = await prisma.codeCounter.upsert({
        where: { prefix_year: { prefix: IMPLEMENTED_PREFIX, year } },
        update: { next: { increment: 1 } },
        create: { prefix: IMPLEMENTED_PREFIX, year, next: 1 },
      });
      const implementedCode = `${IMPLEMENTED_PREFIX}-${year}-${String(counter.next).padStart(4, '0')}`;

      await prisma.implementedKaizen.create({
        data: {
          suggestionId: s.id,
          ideaCode: String(s.code || ''),
          implementedCode,
          dataSnapshot: { suggestionId: s.id, ideaCode: s.code || null },
        },
      });
      created += 1;
    }

    // eslint-disable-next-line no-console
    console.log(`Backfill done. Created ${created} implemented_kaizen rows.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

