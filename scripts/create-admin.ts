import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const connectionString = process.env.DATABASE_URL;

if (!email || !password || !connectionString) {
  throw new Error(
    "Faltam ADMIN_EMAIL, ADMIN_PASSWORD ou DATABASE_URL no ficheiro .env",
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const db = new PrismaClient({
  adapter,
});

try {
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.upsert({
    where: {
      email,
    },
    update: {
      name: "Administrador SellForge",
      passwordHash,
      role: "ADMIN",
      active: true,
      exportEnabled: true,
      adsEnabled: true,
      accessExpiresAt: null,
    },
    create: {
      email,
      name: "Administrador SellForge",
      passwordHash,
      role: "ADMIN",
      active: true,
      exportEnabled: true,
      adsEnabled: true,
      accessExpiresAt: null,
    },
  });

  console.log(`Administrador criado com sucesso: ${email}`);
} finally {
  await db.$disconnect();
}