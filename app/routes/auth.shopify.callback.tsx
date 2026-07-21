import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { db } from "../lib/db.server";
import {
  commitSession,
  getSession,
} from "../lib/session.server";

import {
  exchangeCodeForToken,
  normalizeShop,
  verifyShopifyHmac,
} from "../lib/shopify.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const rawShop = url.searchParams.get("shop");

  const session = await getSession(
    request.headers.get("Cookie"),
  );

  const expectedState =
    session.get("shopifyOAuthState");

  const userId =
    session.get("shopifyOAuthUserId");

  const expectedShop =
    session.get("shopifyOAuthShop");

  if (
    !code ||
    !state ||
    !rawShop ||
    !expectedState ||
    !userId ||
    state !== expectedState ||
    !verifyShopifyHmac(url)
  ) {
    throw new Response(
      "Pedido de autorização Shopify inválido.",
      { status: 401 },
    );
  }

  const shop = normalizeShop(rawShop);

  if (shop !== expectedShop) {
    throw new Response(
      "A loja devolvida não corresponde à loja solicitada.",
      { status: 401 },
    );
  }

  const token = await exchangeCodeForToken(
    shop,
    code,
  );

  const tokenExpiresAt = token.expiresIn
    ? new Date(
        Date.now() + token.expiresIn * 1000,
      )
    : null;

  await db.shopifyStore.upsert({
    where: {
      shop,
    },
    update: {
      userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt,
      scopes: token.scopes,
    },
    create: {
      userId,
      shop,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt,
      scopes: token.scopes,
    },
  });

  session.unset("shopifyOAuthState");
  session.unset("shopifyOAuthUserId");
  session.unset("shopifyOAuthShop");

  return redirect("/export", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}