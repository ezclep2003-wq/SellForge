import bcrypt from "bcryptjs";
import { redirect } from "react-router";

import { db } from "./db.server";
import { getUserId } from "./session.server";

export async function verifyLogin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.user.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (!user || !user.active) {
    return null;
  }

  const passwordValid = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  if (!passwordValid) {
    return null;
  }

  if (
    user.accessExpiresAt &&
    user.accessExpiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  return user;
}

export async function requireUser(request: Request) {
  const userId = await getUserId(request);

  if (!userId) {
    throw redirect("/login");
  }

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user || !user.active) {
    throw redirect("/login");
  }

  if (
    user.accessExpiresAt &&
    user.accessExpiresAt.getTime() < Date.now()
  ) {
    throw redirect("/login");
  }

  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);

  if (user.role !== "ADMIN") {
    throw redirect("/");
  }

  return user;
}