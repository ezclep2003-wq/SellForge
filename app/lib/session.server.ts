import {
  createCookieSessionStorage,
  redirect,
} from "react-router";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET não está configurada.");
}

const storage = createCookieSessionStorage({
  cookie: {
    name: "__sellforge_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
});

export const {
  getSession,
  commitSession,
  destroySession,
} = storage;

export async function createUserSession(
  request: Request,
  userId: string,
  redirectTo = "/",
) {
  const session = await getSession(
    request.headers.get("Cookie"),
  );

  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function getUserId(request: Request) {
  const session = await getSession(
    request.headers.get("Cookie"),
  );

  const userId = session.get("userId");

  return typeof userId === "string" ? userId : null;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);

  if (!userId) {
    const url = new URL(request.url);

    throw redirect(
      `/login?redirectTo=${encodeURIComponent(url.pathname)}`,
    );
  }

  return userId;
}

export async function logout(request: Request) {
  const session = await getSession(
    request.headers.get("Cookie"),
  );

  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}