import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";

import { requireUser } from "../lib/auth.server";
import {
  commitSession,
  getSession,
} from "../lib/session.server";

import {
  createOAuthState,
  getAuthorizationUrl,
  normalizeShop,
} from "../lib/shopify.server";

type ActionData = {
  error?: string;
};

export async function loader({
  request,
}: LoaderFunctionArgs) {
  await requireUser(request);

  return null;
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<ActionData | Response> {
  const user = await requireUser(request);
  const formData = await request.formData();

  try {
    const shop = normalizeShop(
      String(formData.get("shop") || ""),
    );

    const state = createOAuthState();

    const session = await getSession(
      request.headers.get("Cookie"),
    );

    session.set("shopifyOAuthState", state);
    session.set("shopifyOAuthUserId", user.id);
    session.set("shopifyOAuthShop", shop);

    return redirect(
      getAuthorizationUrl(shop, state),
      {
        headers: {
          "Set-Cookie": await commitSession(session),
        },
      },
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível ligar a loja.",
    };
  }
}

export default function ConnectShopifyPage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const submitting =
    navigation.state === "submitting";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">S</div>

        <p className="eyebrow">LIGAR SHOPIFY</p>

        <h1>Ligue a sua loja</h1>

        <p className="login-description">
          Introduza o domínio permanente da loja,
          por exemplo loja.myshopify.com.
        </p>

        {actionData?.error && (
          <div className="login-error">
            ❌ {actionData.error}
          </div>
        )}

        <Form method="post" className="login-form">
          <label>
            Domínio Shopify

            <input
              name="shop"
              required
              autoComplete="off"
              placeholder="loja.myshopify.com"
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting
              ? "A ligar..."
              : "Continuar para a Shopify"}
          </button>
        </Form>
      </section>
    </main>
  );
}