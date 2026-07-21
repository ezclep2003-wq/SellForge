import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { requireUser } from "../lib/auth.server";
import { db } from "../lib/db.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const store = await db.shopifyStore.findFirst({
    where: {
      userId: user.id,
    },
    select: {
      shop: true,
    },
  });

  return {
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      exportEnabled: user.exportEnabled,
      adsEnabled: user.adsEnabled,
      accessExpiresAt: user.accessExpiresAt,
    },
    store,
  };
}

export default function HomePage() {
  const { user, store } = useLoaderData<typeof loader>();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">S</div>

          <div>
            <strong>SellForge</strong>
            <span>Business Platform</span>
          </div>
        </div>

        <nav className="nav">
          <Link className="active" to="/">
            Dashboard
          </Link>

          {user.exportEnabled && (
            <Link to="/export">
              SellForge Export
            </Link>
          )}

          {user.adsEnabled ? (
            <Link to="/ads">
              SellForge Ads
            </Link>
          ) : (
            <button type="button" disabled>
              SellForge Ads
              <span className="soon">Sem acesso</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <span>Loja Shopify</span>

          <strong>
            {store ? store.shop : "Não ligada"}
          </strong>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              SELLFORGE DASHBOARD
            </p>

            <h1>
              Bem-vindo, {user.name || "utilizador"}
            </h1>

            <p>
              Ligue a sua loja Shopify ou carregue um CSV
              para começar a exportar encomendas.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <Link
              className="connect-button"
              to="/connect-shopify"
            >
              {store
                ? "Gerir Shopify"
                : "Ligar Shopify"}
            </Link>

            <Link
              className="connect-button secondary"
              to="/export"
            >
              📂 Carregar CSV
            </Link>
          </div>
        </header>

        <section className="connection-banner">
          <div>
            <strong>
              {store
                ? `Loja ligada: ${store.shop}`
                : "Nenhuma loja Shopify ligada"}
            </strong>

            <p>
              {store
                ? "A sua loja está ligada ao SellForge."
                : "Pode ligar a Shopify ou carregar manualmente um CSV no SellForge Export."}
            </p>
          </div>

          <Link
            className="connect-button"
            to="/connect-shopify"
          >
            {store
              ? "Gerir ligação"
              : "Ligar agora"}
          </Link>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span>Loja Shopify</span>

            <strong>
              {store ? store.shop : "Não ligada"}
            </strong>
          </article>

          <article className="stat-card">
            <span>SellForge Export</span>

            <strong>
              {user.exportEnabled
                ? "Disponível"
                : "Sem acesso"}
            </strong>
          </article>

          <article className="stat-card">
            <span>SellForge Ads</span>

            <strong>
              {user.adsEnabled
                ? "Disponível"
                : "Sem acesso"}
            </strong>
          </article>
        </section>

        <section className="dashboard-modules">
          {user.exportEnabled ? (
            <Link
              className="module-card"
              to="/export"
            >
              <div className="module-icon">📦</div>

              <div>
                <span>SELLFORGE EXPORT</span>

                <h2>Exportar encomendas</h2>

                <p>
                  Carregue um CSV, selecione as encomendas
                  e descarregue o Excel da transportadora.
                </p>
              </div>

              <strong>Abrir →</strong>
            </Link>
          ) : (
            <article className="module-card disabled">
              <div className="module-icon">🔒</div>

              <div>
                <span>SELLFORGE EXPORT</span>

                <h2>Módulo sem acesso</h2>

                <p>
                  Contacte a SellForge para ativar o acesso ao Export.
                </p>
              </div>

              <strong>Bloqueado</strong>
            </article>
          )}

          {user.adsEnabled ? (
            <Link
              className="module-card"
              to="/ads"
            >
              <div className="module-icon">📢</div>

              <div>
                <span>SELLFORGE ADS</span>

                <h2>Gerir anúncios</h2>

                <p>
                  Crie e acompanhe campanhas dentro da plataforma.
                </p>
              </div>

              <strong>Abrir →</strong>
            </Link>
          ) : (
            <article className="module-card disabled">
              <div className="module-icon">🔒</div>

              <div>
                <span>SELLFORGE ADS</span>

                <h2>Módulo sem acesso</h2>

                <p>
                  Contacte a SellForge para ativar o acesso ao Ads.
                </p>
              </div>

              <strong>Bloqueado</strong>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}