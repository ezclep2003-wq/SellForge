import type { ActionFunctionArgs } from "react-router";
import ExcelJS from "exceljs";
import path from "node:path";

type ExportOrder = {
  number: string;
  customer: string;
  address1: string;
  address2?: string;
  postalCode: string;
  city: string;
  phone: string;
  country: string;
  email: string;
  total: number;
};

function normalizePhone(phone: string, country: string) {
  let value = String(phone || "").replace(/\s+/g, "");

  if (country === "ES" && value && !value.startsWith("+34")) {
    value = `+34${value}`;
  }

  if (country === "PT" && value && !value.startsWith("+351")) {
    value = `+351${value}`;
  }

  return value;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const orders = body.orders as ExportOrder[];

    if (!Array.isArray(orders) || orders.length === 0) {
      return Response.json(
        { error: "Nenhuma encomenda selecionada." },
        { status: 400 },
      );
    }

    const templatePath = path.join(
      process.cwd(),
      "public",
      "ATT_IMPORT.xlsx",
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return Response.json(
        { error: "O template Excel não contém nenhuma folha." },
        { status: 500 },
      );
    }

    orders.forEach((order, index) => {
      const row = worksheet.getRow(index + 2);

      const fullAddress = [
        order.address1,
        order.address2,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const phone = normalizePhone(
        order.phone,
        order.country,
      );

      row.getCell(1).value = order.number;
      row.getCell(2).value = order.total;
      row.getCell(3).value = order.customer;
      row.getCell(4).value = fullAddress;
      row.getCell(5).value = order.postalCode;
      row.getCell(6).value = order.city;
      row.getCell(7).value = phone;
      row.getCell(8).value = order.country;

      // Volume
      row.getCell(9).value = 0;

      // Peso
      row.getCell(10).value = 1;

      row.getCell(11).value = 1;
      row.getCell(12).value = order.email;

      // Observações
      row.getCell(13).value = "";

      row.getCell(14).value = order.customer;

      // Serviço
      row.getCell(15).value =
        order.country === "ES" ? "24ES" : "24PT";

      row.commit();
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="SELLFORGE_EXPORT.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar o Excel:", error);

    return Response.json(
      {
        error:
          "Não foi possível gerar o ficheiro Excel.",
      },
      { status: 500 },
    );
  }
}