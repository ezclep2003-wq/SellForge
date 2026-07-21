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

import { verifyLogin } from "../lib/auth.server";
import {
  createUserSession,
  getUserId,
} from "../lib/session.server";

type ActionData = {
  error?: string;
};

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const userId = await getUserId(request);

  if (userId) {
    throw redirect("/");
  }

  return null;
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<ActionData | Response> {
  const formData = await request.formData();

  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const redirectTo = String(
    formData.get("redirectTo") || "/",
  );

  if (!email || !password) {
    return {
      error: "Preenche o email e a palavra-passe.",
    };
  }

  const user = await verifyLogin(email, password);

  if (!user) {
    return {
      error:
        "Email ou palavra-passe incorretos, conta suspensa ou acesso expirado.",
    };
  }

  const safeRedirect =
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//")
      ? redirectTo
      : "/";

const destination =
  user.role === "ADMIN"
    ? "/admin"
    : safeRedirect;

return createUserSession(
  request,
  user.id,
  destination,
);
}

export default function LoginPage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const submitting =
    navigation.state === "submitting";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">S</div>

        <p className="eyebrow">SELLFORGE PLATFORM</p>

        <h1>Bem-vindo</h1>

        <p className="login-description">
          Inicia sessão para aceder ao SellForge Export e
          SellForge Ads.
        </p>

        {actionData?.error && (
          <div className="login-error">
            ❌ {actionData.error}
          </div>
        )}

        <Form method="post" className="login-form">
          <label>
            Email

            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="cliente@email.com"
            />
          </label>

          <label>
            Palavra-passe

            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting
              ? "A iniciar sessão..."
              : "Entrar"}
          </button>
        </Form>
      </section>
    </main>
  );
}