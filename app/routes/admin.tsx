import bcrypt from "bcryptjs";

import {
  decryptPassword,
  encryptPassword,
} from "../lib/password.server";

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { requireAdmin } from "../lib/auth.server";
import { db } from "../lib/db.server";

type ActionData = {
  success?: string;
  error?: string;
};

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function getExpiry(accessDuration: string) {
  switch (accessDuration) {
    case "7":
      return addDays(7);

    case "30":
      return addDays(30);

    case "365":
      return addDays(365);

    case "infinite":
      return null;

    default:
      return addDays(30);
  }
}

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);

  const users = await db.user.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      exportEnabled: true,
      adsEnabled: true,
      accessExpiresAt: true,
      createdAt: true,
      passwordEncrypted: true,
    },
  });

  const usersWithPasswords = users.map((user) => {
    let password: string | null = null;

    if (user.passwordEncrypted) {
      try {
        password = decryptPassword(user.passwordEncrypted);
      } catch (error) {
        console.error(
          `Não foi possível desencriptar a password de ${user.email}:`,
          error,
        );
      }
    }

    const { passwordEncrypted, ...safeUser } = user;

    return {
      ...safeUser,
      password,
    };
  });

  return {
    admin: {
      name: admin.name,
      email: admin.email,
    },
    users: usersWithPasswords,
  };
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<ActionData> {
  await requireAdmin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "create") {
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "")
        .trim()
        .toLowerCase();

      const password = String(
        formData.get("password") || "",
      );

      const accessDuration = String(
        formData.get("accessDuration") || "30",
      );

      const exportEnabled =
        formData.get("exportEnabled") === "on";

      const adsEnabled =
        formData.get("adsEnabled") === "on";

      if (!email || !password) {
        return {
          error:
            "Preenche o email e a palavra-passe do cliente.",
        };
      }

      if (password.length < 6) {
        return {
          error:
            "A palavra-passe deve ter pelo menos 6 caracteres.",
        };
      }

      const existing = await db.user.findUnique({
        where: {
          email,
        },
      });

      if (existing) {
        return {
          error: "JÃ¡ existe um utilizador com esse email.",
        };
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const passwordEncrypted = encryptPassword(password);

      await db.user.create({
        data: {
          name: name || null,
          email,
          passwordHash,
          passwordEncrypted,
          role: "CUSTOMER",
          active: true,
          exportEnabled,
          adsEnabled,
          accessExpiresAt: getExpiry(accessDuration),
        },
      });

      return {
        success: "Cliente criado com sucesso.",
      };
    }

    const userId = String(formData.get("userId") || "");

    if (!userId) {
      return {
        error: "Cliente invÃ¡lido.",
      };
    }

    const user = await db.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return {
        error: "Cliente nÃ£o encontrado.",
      };
    }

    if (user.role === "ADMIN" && intent !== "renew") {
      return {
        error:
          "NÃ£o podes suspender ou eliminar a conta principal de administrador.",
      };
    }

    if (intent === "toggle-active") {
      await db.user.update({
        where: {
          id: userId,
        },
        data: {
          active: !user.active,
        },
      });

      return {
        success: user.active
          ? "Cliente suspenso."
          : "Cliente ativado.",
      };
    }

    if (intent === "toggle-export") {
      await db.user.update({
        where: {
          id: userId,
        },
        data: {
          exportEnabled: !user.exportEnabled,
        },
      });

      return {
        success: "Acesso ao SellForge Export atualizado.",
      };
    }

    if (intent === "toggle-ads") {
      await db.user.update({
        where: {
          id: userId,
        },
        data: {
          adsEnabled: !user.adsEnabled,
        },
      });

      return {
        success: "Acesso ao SellForge Ads atualizado.",
      };
    }

    if (intent === "renew") {
      const accessDuration = String(
        formData.get("accessDuration") || "30",
      );

      await db.user.update({
        where: {
          id: userId,
        },
        data: {
          accessExpiresAt: getExpiry(accessDuration),
          active: true,
        },
      });

      return {
        success:
          accessDuration === "infinite"
            ? "Acesso definido como infinito."
            : `Acesso renovado por ${accessDuration} dias.`,
      };
    }

    if (intent === "delete") {
      await db.user.delete({
        where: {
          id: userId,
        },
      });

      return {
        success: "Cliente eliminado.",
      };
    }

    return {
      error: "OperaÃ§Ã£o invÃ¡lida.",
    };
  } catch (error) {
    console.error("Erro no painel Admin:", error);

    return {
      error: "NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o.",
    };
  }
}

function formatAccess(value: string | Date | null) {
  if (!value) return "â™¾ï¸ Infinito";

  const date = new Date(value);
  const expired = date.getTime() < Date.now();

  return `${expired ? "ðŸ”´ Expirado: " : ""}${new Intl.DateTimeFormat(
    "pt-PT",
  ).format(date)}`;
}

export default function AdminPage() {
  const { admin, users } =
    useLoaderData<typeof loader>();

  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const submitting = navigation.state === "submitting";

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">SELLFORGE ADMIN</p>
          <h1>GestÃ£o de clientes</h1>

          <p>
            SessÃ£o iniciada como{" "}
            <strong>{admin.name || admin.email}</strong>
          </p>
        </div>

        <div className="admin-actions">
          <Link to="/">Abrir Dashboard</Link>

          <Form method="post" action="/logout">
            <button type="submit">Sair</button>
          </Form>
        </div>
      </header>

      {actionData?.success && (
        <div className="admin-message success">
          âœ… {actionData.success}
        </div>
      )}

      {actionData?.error && (
        <div className="admin-message error">
          âŒ {actionData.error}
        </div>
      )}

      <section className="admin-stats">
        <article>
          <span>Utilizadores</span>
          <strong>{users.length}</strong>
        </article>

        <article>
          <span>Ativos</span>
          <strong>
            {users.filter((user) => user.active).length}
          </strong>
        </article>

        <article>
          <span>Com Export</span>
          <strong>
            {
              users.filter(
                (user) => user.exportEnabled,
              ).length
            }
          </strong>
        </article>

        <article>
          <span>Com Ads</span>
          <strong>
            {
              users.filter((user) => user.adsEnabled)
                .length
            }
          </strong>
        </article>
      </section>

      <section className="admin-panel admin-create-panel">
        <div className="admin-panel-title">
          <div>
            <h2>Adicionar cliente</h2>
            <p>
              Cria o login e escolhe os mÃ³dulos disponÃ­veis.
            </p>
          </div>
        </div>

        <Form method="post" className="admin-create-form">
          <input type="hidden" name="intent" value="create" />

          <label>
            Nome
            <input
              type="text"
              name="name"
              placeholder="Nome do cliente ou empresa"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              name="email"
              required
              placeholder="cliente@email.com"
            />
          </label>

          <label>
            Palavra-passe
            <input
              type="password"
              name="password"
              required
              minLength={6}
              placeholder="MÃ­nimo 6 caracteres"
            />
          </label>

          <label>
            DuraÃ§Ã£o
            <select
              name="accessDuration"
              defaultValue="30"
            >
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="365">1 ano</option>
              <option value="infinite">
                Infinito
              </option>
            </select>
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              name="exportEnabled"
              defaultChecked
            />
            SellForge Export
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              name="adsEnabled"
            />
            SellForge Ads
          </label>

          <button type="submit" disabled={submitting}>
            {submitting
              ? "A guardar..."
              : "Criar cliente"}
          </button>
        </Form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <h2>Clientes</h2>
            <p>
              Controla o estado, os mÃ³dulos e a validade.
            </p>
          </div>
        </div>

        <div className="admin-client-list">
          {users.map((user) => (
            <article className="admin-client-card" key={user.id}>
              <div className="admin-client-details">
                <strong>{user.name || "Sem nome"}</strong>
                <span>{user.email}</span>

                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      fontWeight: 700,
                    }}
                  >
                    Password:
                  </span>

                  <code
                    style={{
                      padding: "5px 8px",
                      borderRadius: "7px",
                      background: "#f3f4f6",
                      color: "#111827",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {user.password || "Não disponível"}
                  </code>
                </div>

                <div className="admin-client-badges">
                  <span>
                    {user.role === "ADMIN"
                      ? "ðŸ‘‘ Administrador"
                      : "ðŸ‘¤ Cliente"}
                  </span>

                  <span>
                    {user.active
                      ? "ðŸŸ¢ Ativo"
                      : "ðŸ”´ Suspenso"}
                  </span>

                  <span>
                    {formatAccess(user.accessExpiresAt)}
                  </span>
                </div>
              </div>

              <div className="admin-client-modules">
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="toggle-export"
                  />

                  <input
                    type="hidden"
                    name="userId"
                    value={user.id}
                  />

                  <button
                    type="submit"
                    className={
                      user.exportEnabled
                        ? "module-active"
                        : ""
                    }
                  >
                    Export:{" "}
                    {user.exportEnabled
                      ? "Ativo"
                      : "Inativo"}
                  </button>
                </Form>

                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="toggle-ads"
                  />

                  <input
                    type="hidden"
                    name="userId"
                    value={user.id}
                  />

                  <button
                    type="submit"
                    className={
                      user.adsEnabled
                        ? "module-active"
                        : ""
                    }
                  >
                    Ads:{" "}
                    {user.adsEnabled
                      ? "Ativo"
                      : "Inativo"}
                  </button>
                </Form>
              </div>

              <div className="admin-client-renew">
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="renew"
                  />

                  <input
                    type="hidden"
                    name="userId"
                    value={user.id}
                  />

                  <select
                    name="accessDuration"
                    defaultValue="30"
                  >
                    <option value="7">+7 dias</option>
                    <option value="30">+30 dias</option>
                    <option value="365">+1 ano</option>
                    <option value="infinite">
                      Infinito
                    </option>
                  </select>

                  <button type="submit">
                    Renovar
                  </button>
                </Form>
              </div>

              <div className="admin-client-actions">
                {user.role !== "ADMIN" && (
                  <>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="toggle-active"
                      />

                      <input
                        type="hidden"
                        name="userId"
                        value={user.id}
                      />

                      <button type="submit">
                        {user.active
                          ? "Suspender"
                          : "Ativar"}
                      </button>
                    </Form>

                    <Form
                      method="post"
                      onSubmit={(event) => {
                        const confirmed =
                          window.confirm(
                            `Eliminar definitivamente ${user.email}?`,
                          );

                        if (!confirmed) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input
                        type="hidden"
                        name="intent"
                        value="delete"
                      />

                      <input
                        type="hidden"
                        name="userId"
                        value={user.id}
                      />

                      <button
                        type="submit"
                        className="delete-button"
                      >
                        Eliminar
                      </button>
                    </Form>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}