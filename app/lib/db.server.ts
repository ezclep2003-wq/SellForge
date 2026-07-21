import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  var __sellforgePrisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não está configurada.");
}

const adapter = new PrismaPg({
  connectionString,
});

export const db =
  global.__sellforgePrisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  global.__sellforgePrisma = db;
}