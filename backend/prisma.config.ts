// Prisma 7: URL lives in prisma.config.ts (not in schema). Load .env from this package root
// so it works from `backend/`, from monorepo root, and in Docker (env is injected; .env is optional).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Must match prisma.config.ts location (this file lives next to package.json in backend/)
const configDir = __dirname;

for (const p of [
  join(configDir, ".env"),
  join(process.cwd(), ".env"),
  join(process.cwd(), "backend", ".env"),
]) {
  if (existsSync(p)) {
    loadEnv({ path: p });
    break;
  }
}

const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to backend/.env, the shell environment, or your Docker/Compose env (see docker.env.example).",
  );
}

export default defineConfig({
  // Include .prisma extension (Prisma 7 migrate can fail to pick up the config URL without it)
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    // Plain string: some Prisma 7.x builds do not treat `env("X")` as a resolved url for migrate deploy
    url: databaseUrl,
  },
});
