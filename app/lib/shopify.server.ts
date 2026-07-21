import crypto from "node:crypto";

const clientId = process.env.SHOPIFY_CLIENT_ID || "";
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "";
const scopes = process.env.SHOPIFY_SCOPES || "read_orders";
const appUrl = process.env.APP_URL || "http://localhost:5173";

export function normalizeShop(value: string) {
  let shop = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (shop && !shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Domínio Shopify inválido.");
  }

  return shop;
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString("hex");
}

export function getAuthorizationUrl(shop: string, state: string) {
  if (!clientId) {
    throw new Error("SHOPIFY_CLIENT_ID não está configurado.");
  }

  const redirectUri = `${appUrl}/auth/shopify/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyHmac(url: URL) {
  const receivedHmac = url.searchParams.get("hmac");

  if (!receivedHmac || !clientSecret) {
    return false;
  }

  const params = new URLSearchParams(url.searchParams);
  params.delete("hmac");
  params.delete("signature");

  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  if (calculatedHmac.length !== receivedHmac.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHmac),
    Buffer.from(receivedHmac),
  );
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
) {
  const response = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    },
  );

  const result = await response.json();

  if (
    !response.ok ||
    typeof result.access_token !== "string"
  ) {
    console.error("Erro OAuth Shopify:", result);

    throw new Error(
      "A Shopify não devolveu um token de acesso válido.",
    );
  }

  return {
    accessToken: result.access_token,
    scopes:
      typeof result.scope === "string"
        ? result.scope
        : scopes,
    refreshToken:
      typeof result.refresh_token === "string"
        ? result.refresh_token
        : null,
    expiresIn:
      typeof result.expires_in === "number"
        ? result.expires_in
        : null,
  };
}