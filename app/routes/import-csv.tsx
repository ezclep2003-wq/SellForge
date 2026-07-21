import { Form } from "react-router";

export default function ImportCsvPage() {
  return (
    <div className="main-content">
      <div
        style={{
          maxWidth: 700,
          margin: "60px auto",
          background: "#fff",
          padding: 40,
          borderRadius: 20,
          boxShadow: "0 10px 40px rgba(0,0,0,.08)",
        }}
      >
        <p
          style={{
            color: "#777",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          SELLFORGE EXPORT
        </p>

        <h1>Importar CSV Shopify</h1>

        <p>
          Exporte as encomendas da Shopify em CSV e carregue
          o ficheiro aqui.
        </p>

        <Form method="post" encType="multipart/form-data">
          <input
            type="file"
            name="csv"
            accept=".csv"
            required
            style={{
              marginTop: 30,
              marginBottom: 30,
            }}
          />

          <br />

          <button
            className="connect-button"
            type="submit"
          >
            Carregar CSV
          </button>
        </Form>
      </div>
    </div>
  );
}