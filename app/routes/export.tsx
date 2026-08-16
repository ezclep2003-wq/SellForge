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

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
}

function parseMoney(value: string) {
  if (!value) {
    return 0;
  }

  let normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^\d,.-]/g, "");

  /*
   * Suporta:
   * 23.00
   * 23,00
   * 1.234,56
   * 1,234.56
   */
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > lastDot) {
    normalized = normalized
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (lastDot > lastComma && lastComma !== -1) {
    normalized = normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }

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
  const [editingTotalId, setEditingTotalId] = useState<string | null>(null);
  const [editingTotalValue, setEditingTotalValue] = useState("");

  const filteredOrders = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) {
      return orders;
    }

    return orders.filter(
      (order) =>
        order.number
          .toLowerCase()
          .includes(value) ||
        order.customer
          .toLowerCase()
          .includes(value) ||
        order.countryName
          .toLowerCase()
          .includes(value),
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
        ? current.filter(
            (orderId) => orderId !== id,
          )
        : [...current, id],
    );
  }

  function toggleAll() {
    const visibleIds = filteredOrders.map(
      (order) => order.id,
    );

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) =>
        selected.includes(id),
      );

    if (allSelected) {
      setSelected((current) =>
        current.filter(
          (id) => !visibleIds.includes(id),
        ),
      );
    } else {
      setSelected((current) =>
        Array.from(
          new Set([
            ...current,
            ...visibleIds,
          ]),
        ),
      );
    }
  }

  function startEditingTotal(order: Order) {
    setEditingTotalId(order.id);
    setEditingTotalValue(order.total.toFixed(2).replace(".", ","));
  }

  function cancelEditingTotal() {
    setEditingTotalId(null);
    setEditingTotalValue("");
  }

  function saveEditingTotal(orderId: string) {
    const value = parseMoney(editingTotalValue);

    if (!Number.isFinite(value) || value < 0) {
      setError("Introduza um valor válido.");
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              total: Math.round(value * 100) / 100,
            }
          : order,
      ),
    );

    setEditingTotalId(null);
    setEditingTotalValue("");
    setError("");
    setSuccess("Valor da encomenda atualizado.");
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
        try {
          /*
           * Uma encomenda da Shopify pode ocupar
           * várias linhas no CSV.
           *
           * Primeiro juntamos TODAS as linhas
           * pertencentes à mesma encomenda.
           */
          const groupedOrders = new Map<
            string,
            Record<string, string>[]
          >();

          for (const row of result.data) {
            const number = readValue(row, [
              "Name",
              "Order",
              "Order Name",
            ]);

            if (!number) {
              continue;
            }

            const existing =
              groupedOrders.get(number) || [];

            existing.push(row);

            groupedOrders.set(
              number,
              existing,
            );
          }

          const importedOrders: Order[] = [];

          for (
            const [number, rows]
            of groupedOrders
          ) {
            /*
             * Procura o primeiro valor não vazio
             * em todas as linhas da encomenda.
             */
            function firstValue(
              names: string[],
            ) {
              for (const row of rows) {
                const value = readValue(
                  row,
                  names,
                );

                if (value) {
                  return value;
                }
              }

              return "";
            }

            /*
             * Procura do fim para o início.
             * É útil para campos que podem ter
             * valores atualizados nas linhas
             * posteriores.
             */
            function lastValue(
              names: string[],
            ) {
              for (
                let i = rows.length - 1;
                i >= 0;
                i--
              ) {
                const value = readValue(
                  rows[i],
                  names,
                );

                if (value) {
                  return value;
                }
              }

              return "";
            }

            /*
             * =========================
             * MORADA DE ENVIO
             * =========================
             *
             * Para a transportadora usamos
             * exclusivamente os dados Shipping.
             *
             * Nunca misturamos dados Billing
             * com a morada de envio.
             */

            const address1 = firstValue([
              "Shipping Address1",
              "Shipping Address 1",
            ]);

            const address2 = firstValue([
              "Shipping Address2",
              "Shipping Address 2",
            ]);

            const postalCode = firstValue([
              "Shipping Zip",
              "Shipping Postal Code",
            ]);

            const city = firstValue([
              "Shipping City",
            ]);

            const customer =
              firstValue([
                "Shipping Name",
              ]) || "Sem nome";

            const phone = firstValue([
              "Shipping Phone",
              "Phone",
            ]);

            const countryRaw = firstValue([
              "Shipping Country Code",
              "Shipping Country",
            ]);

            const countryCode =
              countryRaw
                .trim()
                .toUpperCase();

            const country: "PT" | "ES" =
              countryCode === "ES" ||
              countryCode === "SPAIN" ||
              countryCode === "ESPANHA" ||
              countryCode === "ESPAÑA"
                ? "ES"
                : "PT";

            /*
             * =========================
             * TOTAL DA ENCOMENDA
             * =========================
             *
             * O CSV da Shopify pode manter o campo
             * "Total" antigo depois de uma edição.
             *
             * Por isso, quando existem linhas de
             * produtos, reconstruímos o valor atual
             * através das linhas ativas:
             *
             * (preço × quantidade) - desconto da linha
             * + portes
             *
             * Linhas sem quantidade/preço válidos não
             * entram no cálculo. Se não existirem
             * line items utilizáveis, fazemos fallback
             * para o total exportado pela Shopify.
             */

            let lineItemsTotal = 0;
            let usableLineItems = 0;

            for (const row of rows) {
              const quantityValue = readValue(row, [
                "Lineitem quantity",
                "Lineitem Quantity",
              ]);

              const priceValue = readValue(row, [
                "Lineitem price",
                "Lineitem Price",
              ]);

              if (!quantityValue || !priceValue) {
                continue;
              }

              const quantity = Number(quantityValue);
              const price = parseMoney(priceValue);

              if (
                !Number.isFinite(quantity) ||
                quantity <= 0 ||
                price < 0
              ) {
                continue;
              }

              const lineDiscount = parseMoney(
                readValue(row, [
                  "Lineitem discount",
                  "Lineitem Discount",
                ]),
              );

              lineItemsTotal +=
                price * quantity - lineDiscount;

              usableLineItems += 1;
            }

            const shipping = parseMoney(
              firstValue([
                "Shipping",
                "Shipping Price",
              ]),
            );

            const exportedTotal = parseMoney(
              lastValue([
                "Current Total Price",
                "Current Total",
                "Total",
                "Total Price",
              ]),
            );

            const total =
              usableLineItems > 0
                ? Math.max(
                    0,
                    Math.round(
                      (lineItemsTotal + shipping) * 100,
                    ) / 100,
                  )
                : exportedTotal;

            const date =
              firstValue([
                "Created at",
                "Paid at",
              ]);

            const email =
              firstValue([
                "Email",
                "Contact Email",
              ]);

            importedOrders.push({
              id: number,
              number,
              customer,

              country,

              countryName:
                country === "ES"
                  ? "Espanha"
                  : "Portugal",

              date,
              total,

              address1,
              address2,
              postalCode,
              city,
              phone,
              email,
            });
          }

          if (
            importedOrders.length === 0
          ) {
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
        } catch (
          processingError
        ) {
          console.error(
            "Erro ao processar CSV:",
            processingError,
          );

          setError(
            "Não foi possível processar o CSV da Shopify.",
          );
        }
      },

      error: () => {
        setError(
          "Não foi possível ler o ficheiro CSV.",
        );
      },
    });

    event.target.value = "";
  }

  async function exportExcel() {
    if (
      selectedOrders.length === 0
    ) {
      return;
    }

    setExporting(true);
    setSuccess("");
    setError("");

    try {
      const response = await fetch(
        "/api/export",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            orders: selectedOrders,
          }),
        },
      );

      if (!response.ok) {
        const result = await response
          .json()
          .catch(() => null);

        throw new Error(
          result?.error ||
            "Não foi possível exportar o Excel.",
        );
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;
      link.download =
        "SELLFORGE_EXPORT.xlsx";

      document.body.appendChild(link);

      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      setSuccess(
        "Excel exportado com sucesso.",
      );
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
          <div className="brand-logo">
            S
          </div>

          <div>
            <strong>SellForge</strong>
            <span>
              Business Platform
            </span>
          </div>
        </div>

        <nav className="nav">
          <Link to="/">
            Dashboard
          </Link>

          <Link
            className="active"
            to="/export"
          >
            SellForge Export
          </Link>

          <button
            type="button"
            disabled
          >
            SellForge Ads

            <span className="soon">
              Brevemente
            </span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span>
            Origem das encomendas
          </span>

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

            <h1>
              Exportação de encomendas
            </h1>

            <p>
              Carregue o CSV da Shopify,
              selecione as encomendas e
              crie o Excel da transportadora.
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
                onChange={
                  handleCsvUpload
                }
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
              onChange={
                handleCsvUpload
              }
              hidden
            />
          </label>
        </section>

        {success && (
          <div
            style={{
              marginTop: "18px",
              padding: "14px 16px",
              border:
                "1px solid #a8d9b8",
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
              border:
                "1px solid #efb5b0",
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
            <span>
              Encomendas
            </span>

            <strong>
              {orders.length}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Selecionadas
            </span>

            <strong>
              {selected.length}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Valor selecionado
            </span>

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
            <h2>
              Ainda não existem
              encomendas
            </h2>

            <p>
              Carregue o ficheiro CSV
              exportado pela Shopify
              para começar.
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
                onChange={
                  handleCsvUpload
                }
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
                  setSearch(
                    event.currentTarget
                      .value,
                  )
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
                  selected.length ===
                    0 || exporting
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
              <span>
                Encomenda
              </span>
              <span>
                Cliente
              </span>
              <span>
                País
              </span>
              <span>
                Data
              </span>
              <span>
                Total
              </span>
            </div>

            {filteredOrders.map(
              (order) => {
                const isSelected =
                  selected.includes(
                    order.id,
                  );

                return (
                  <label
                    className={`order-row ${
                      isSelected
                        ? "selected"
                        : ""
                    }`}
                    key={order.id}
                  >
                    <input
                      type="checkbox"
                      checked={
                        isSelected
                      }
                      disabled={
                        exporting
                      }
                      onChange={() =>
                        toggleOrder(
                          order.id,
                        )
                      }
                    />

                    <strong>
                      {order.number}
                    </strong>

                    <span>
                      {order.customer}
                    </span>

                    <span>
                      {order.countryName}
                    </span>

                    <span>
                      {order.date}
                    </span>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "8px",
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      {editingTotalId === order.id ? (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editingTotalValue}
                            onChange={(event) =>
                              setEditingTotalValue(
                                event.currentTarget.value,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveEditingTotal(order.id);
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEditingTotal();
                              }
                            }}
                            autoFocus
                            style={{
                              width: "92px",
                              padding: "7px 9px",
                              border: "1px solid #b7b7b7",
                              borderRadius: "8px",
                              fontWeight: 700,
                              textAlign: "right",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              saveEditingTotal(order.id)
                            }
                            style={{
                              border: 0,
                              background: "#111827",
                              color: "#fff",
                              borderRadius: "8px",
                              padding: "7px 9px",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                            title="Guardar valor"
                          >
                            ✓
                          </button>

                          <button
                            type="button"
                            onClick={cancelEditingTotal}
                            style={{
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              borderRadius: "8px",
                              padding: "7px 9px",
                              cursor: "pointer",
                            }}
                            title="Cancelar"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>
                            {order.total.toFixed(2)} €
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              startEditingTotal(order)
                            }
                            style={{
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              borderRadius: "8px",
                              padding: "5px 8px",
                              cursor: "pointer",
                            }}
                            title="Editar total"
                          >
                            ✎
                          </button>
                        </>
                      )}
                    </div>
                  </label>
                );
              },
            )}
          </section>
        )}
      </main>
    </div>
  );
}