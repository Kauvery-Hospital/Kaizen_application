# Backend (NestJS + Prisma)
FROM node:20-bookworm-slim AS base

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Prisma CLI loads prisma.config.ts even for `prisma generate` (postinstall).
# During image build there is no backend/.env, so set a placeholder DATABASE_URL.
# It does not need to be reachable at build time; it just must be a non-empty string.
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/kaizen?schema=public

RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Fresh deployments: this repo's migrations are not a reliable bootstrap path yet (missing base schema),
# so we initialize from the Prisma schema directly.
CMD ["sh", "-c", "npx prisma db push && node dist/src/main.js"]
