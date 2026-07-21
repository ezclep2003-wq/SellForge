import Papa from "papaparse";
import { useMemo, useState } from "react";

import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  redirect,
  useLoaderData,
} from "react-router";

import { requireUser } from "../lib/auth.server";
import { db } from "../lib/db.server";

type Order = {
  id: string;
  number: string;
  customer: string;
  country: "PT" | "ES";
  countryName: string;
  date: string;
  total: number;
  address1: string;
  address2?: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const user = await requireUser(request);

  if (!user.exportEnabled) {
    throw redirect("/");
  }

  const store = await db.shopifyStore.findFirst({
    where: {
      userId: user.id,
    },
    select: {
      shop: true,
    },
  });

  return {
    store,
  };
}

function readValue(
  row: Record<string, string>,
  possibleNames: string[],
) {
  for (const name of possibleNames) {
    const value = row[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseMoney(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".");

  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}

export default function ExportPage() {
  const { store } = useLoaderData<typeof loader>();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const filteredOrders = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) {
      return orders;
    }

    return orders.filter(
      (order) =>
        order.number.toLowerCase().includes(value) ||
        order.customer.toLowerCase().includes(value) ||
        order.countryName.toLowerCase().includes(value),
    );
  }, [orders, search]);

  const selectedOrders = useMemo(
    () =>
      orders.filter((order) =>
        selected.includes(order.id),
      ),
    [orders, selected],
  );

  const selectedTotal = selectedOrders.reduce(
    (sum, order) => sum + order.total,
    0,
  );

  function toggleOrder(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((orderId) => orderId !== id)
        : [...current, id],
    );
  }

  function toggleAll() {
    const visibleIds = filteredOrders.map(
      (order) => order.id,
    );

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selected.includes(id));

    if (allSelected) {
      setSelected((current) =>
        current.filter(
          (id) => !visibleIds.includes(id),
        ),
      );
    } else {
      setSelected((current) =>
        Array.from(
          new Set([...current, ...visibleIds]),
        ),
      );
    }
  }

  function handleCsvUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setSuccess("");

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,

      complete: (result) => {
        const uniqueOrders = new Map<string, Order>();

        for (const row of result.data) {
          const number = readValue(row, [
            "Name",
            "Order",
            "Order Name",
          ]);

          if (!number || uniqueOrders.has(number)) {
            continue;
          }

          const countryCode = readValue(row, [
            "Shipping Country Code",
            "Billing Country Code",
            "Shipping Country",
            "Billing Country",
          ]).toUpperCase();

          const country: "PT" | "ES" =
            countryCode === "ES" ||
            countryCode === "SPAIN" ||
            countryCode === "ESPANHA"
              ? "ES"
              : "PT";

          const total = parseMoney(
            readValue(row, [
              "Total",
              "Total Price",
              "Current Total Price",
            ]),
          );

          uniqueOrders.set(number, {
            id: number,
            number,
            customer:
              readValue(row, [
                "Shipping Name",
                "Billing Name",
                "Customer",
              ]) || "Sem nome",

            country,
            countryName:
              country === "ES"
                ? "Espanha"
                : "Portugal",

            date: readValue(row, [
              "Created at",
              "Paid at",
            ]),

            total,

            address1: readValue(row, [
              "Shipping Address1",
              "Billing Address1",
            ]),

            address2: readValue(row, [
              "Shipping Address2",
              "Billing Address2",
            ]),

            postalCode: readValue(row, [
              "Shipping Zip",
              "Billing Zip",
            ]),

            city: readValue(row, [
              "Shipping City",
              "Billing City",
            ]),

            phone: readValue(row, [
              "Shipping Phone",
              "Phone",
              "Billing Phone",
            ]),

            email: readValue(row, [
              "Email",
              "Contact Email",
            ]),
          });
        }

        const importedOrders = Array.from(
          uniqueOrders.values(),
        );

        if (importedOrders.length === 0) {
          setError(
            "Não foram encontradas encomendas válidas no CSV.",
          );

          return;
        }

        setOrders(importedOrders);
        setSelected([]);
        setSearch("");

        setSuccess(
          `${importedOrders.length} encomendas carregadas com sucesso.`,
        );
      },

      error: () => {
        setError("Não foi possível ler o ficheiro CSV.");
      },
    });

    event.target.value = "";
  }

  async function exportExcel() {
    if (selectedOrders.length === 0) {
      return;
    }

    setExporting(true);
    setSuccess("");
    setError("");

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orders: selectedOrders,
        }),
      });

      if (!response.ok) {
        const result = await response
          .json()
          .catch(() => null);

        throw new Error(
          result?.error ||
            "Não foi possível exportar o Excel.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = "SELLFORGE_EXPORT.xlsx";

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      setSuccess("Excel exportado com sucesso.");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Erro ao exportar o Excel.",
      );
    } finally {
      setExporting(false);
    }
  }

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
          <Link to="/">Dashboard</Link>

          <Link className="active" to="/export">
            SellForge Export
          </Link>

          <button type="button" disabled>
            SellForge Ads
            <span className="soon">Brevemente</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span>Origem das encomendas</span>

          <strong>
            {orders.length > 0
              ? "CSV carregado"
              : store
                ? store.shop
                : "Nenhuma origem"}
          </strong>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              SELLFORGE EXPORT
            </p>

            <h1>Exportação de encomendas</h1>

            <p>
              Carregue o CSV da Shopify, selecione as
              encomendas e crie o Excel da transportadora.
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
              Ligar Shopify
            </Link>

            <label className="connect-button secondary">
              📂 Carregar CSV

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                hidden
              />
            </label>
          </div>
        </header>

        <section className="connection-banner">
          <div>
            <strong>
              {orders.length > 0
                ? `${orders.length} encomendas carregadas`
                : "Nenhuma encomenda carregada"}
            </strong>

            <p>
              {orders.length > 0
                ? "Selecione as encomendas que pretende exportar."
                : "Exporte as encomendas da Shopify em CSV e carregue o ficheiro aqui."}
            </p>
          </div>

          <label className="connect-button">
            📂 Escolher CSV

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              hidden
            />
          </label>
        </section>

        {success && (
          <div
            style={{
              marginTop: "18px",
              padding: "14px 16px",
              border: "1px solid #a8d9b8",
              borderRadius: "12px",
              background: "#eaf8ef",
              color: "#17643a",
              fontWeight: 700,
            }}
          >
            ✅ {success}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "18px",
              padding: "14px 16px",
              border: "1px solid #efb5b0",
              borderRadius: "12px",
              background: "#fff1f0",
              color: "#8a1f17",
              fontWeight: 700,
            }}
          >
            ❌ {error}
          </div>
        )}

        <section className="stats-grid">
          <article className="stat-card">
            <span>Encomendas</span>
            <strong>{orders.length}</strong>
          </article>

          <article className="stat-card">
            <span>Selecionadas</span>
            <strong>{selected.length}</strong>
          </article>

          <article className="stat-card">
            <span>Valor selecionado</span>
            <strong>
              {selectedTotal.toFixed(2)} €
            </strong>
          </article>
        </section>

        {orders.length === 0 ? (
          <section
            className="orders-panel"
            style={{
              padding: "60px 24px",
              textAlign: "center",
            }}
          >
            <h2>Ainda não existem encomendas</h2>

            <p>
              Carregue o ficheiro CSV exportado pela
              Shopify para começar.
            </p>

            <label
              className="connect-button"
              style={{
                marginTop: "15px",
              }}
            >
              📂 Carregar CSV da Shopify

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                hidden
              />
            </label>
          </section>
        ) : (
          <section className="orders-panel">
            <div className="orders-toolbar">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.currentTarget.value)
                }
                placeholder="Pesquisar encomenda, cliente ou país..."
              />

              <button
                type="button"
                onClick={toggleAll}
                disabled={exporting}
              >
                Selecionar todas
              </button>

              <button
                className="export-button"
                type="button"
                disabled={
                  selected.length === 0 || exporting
                }
                onClick={exportExcel}
              >
                {exporting
                  ? "A exportar..."
                  : `Exportar Excel (${selected.length})`}
              </button>
            </div>

            <div className="table-header">
              <span />
              <span>Encomenda</span>
              <span>Cliente</span>
              <span>País</span>
              <span>Data</span>
              <span>Total</span>
            </div>

            {filteredOrders.map((order) => {
              const isSelected = selected.includes(
                order.id,
              );

              return (
                <label
                  className={`order-row ${
                    isSelected ? "selected" : ""
                  }`}
                  key={order.id}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={exporting}
                    onChange={() =>
                      toggleOrder(order.id)
                    }
                  />

                  <strong>{order.number}</strong>
                  <span>{order.customer}</span>
                  <span>{order.countryName}</span>
                  <span>{order.date}</span>

                  <strong>
                    {order.total.toFixed(2)} €
                  </strong>
                </label>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}