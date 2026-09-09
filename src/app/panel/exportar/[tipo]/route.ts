import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { buildCsv, csvResponse } from "@/lib/csv";
import { variantLabel } from "@/lib/variants";

/**
 * Exportar para el contador.
 *
 * Sale en CSV y no en .xlsx a proposito: Excel lo abre de una, pesa nada y no
 * necesita ninguna libreria. Todas las consultas filtran por el usuario de la
 * sesion, asi que nadie puede descargar los datos de otro negocio.
 */
const TIPOS = ["ventas", "gastos", "inventario", "movimientos"] as const;
type Tipo = (typeof TIPOS)[number];

const MOVE_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Conteo",
  VENTA: "Venta",
  DEVOLUCION: "Devolucion",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Necesitas iniciar sesion.", { status: 401 });

  const { tipo: rawTipo } = await params;
  if (!TIPOS.includes(rawTipo as Tipo)) {
    return new Response("No sabemos exportar eso.", { status: 404 });
  }
  const tipo = rawTipo as Tipo;

  const url = new URL(request.url);
  const hoy = todayIn(user.timezone);
  const desde = leerDia(url.searchParams.get("from"), startOfMonth(hoy));
  const hasta = leerDia(url.searchParams.get("to"), hoy);
  const rango = desde <= hasta ? { from: desde, to: hasta } : { from: hasta, to: desde };
  const sufijo = "-" + rango.from + "-a-" + rango.to;

  if (tipo === "ventas") {
    const ventas = await db.sale.findMany({
      where: { userId: user.id, day: { gte: rango.from, lte: rango.to } },
      orderBy: [{ day: "asc" }, { createdAt: "asc" }],
      include: { items: true, staff: { select: { name: true } } },
    });

    // Una fila por linea de venta: es lo que el contador necesita para cuadrar.
    const rows = ventas.flatMap((venta) =>
      (venta.items.length ? venta.items : [null]).map((item) => [
        venta.day,
        venta.id.slice(-8).toUpperCase(),
        item?.name ?? "Venta",
        item?.variantLabel ?? "",
        item?.qty ?? 1,
        item?.unitPrice ?? venta.total,
        (item?.unitPrice ?? venta.total) * (item?.qty ?? 1),
        venta.total,
        venta.paymentMethod,
        venta.origin,
        venta.clientName ?? "",
        venta.staff?.name ?? "",
        venta.notes ?? "",
      ])
    );

    return csvResponse(
      "ventas" + sufijo + ".csv",
      buildCsv(
        [
          "Dia",
          "Factura",
          "Producto",
          "Talla",
          "Cantidad",
          "Precio unitario",
          "Subtotal",
          "Total de la venta",
          "Forma de pago",
          "Origen",
          "Cliente",
          "Atendio",
          "Nota",
        ],
        rows
      )
    );
  }

  if (tipo === "gastos") {
    const gastos = await db.expense.findMany({
      where: { userId: user.id, day: { gte: rango.from, lte: rango.to } },
      orderBy: [{ day: "asc" }, { createdAt: "asc" }],
    });

    return csvResponse(
      "gastos" + sufijo + ".csv",
      buildCsv(
        ["Dia", "Descripcion", "Categoria", "Valor"],
        gastos.map((g) => [g.day, g.description, g.category, g.amount])
      )
    );
  }

  if (tipo === "inventario") {
    const variantes = await db.productVariant.findMany({
      where: { userId: user.id },
      orderBy: [{ service: { name: "asc" } }, { size: "asc" }, { color: "asc" }],
      include: {
        service: {
          select: {
            name: true,
            category: true,
            brand: true,
            price: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    return csvResponse(
      "inventario-" + hoy + ".csv",
      buildCsv(
        [
          "Prenda",
          "Categoria",
          "Marca",
          "Proveedor",
          "Talla",
          "Color",
          "Codigo de barras",
          "Stock",
          "Minimo",
          "Costo unitario",
          "Precio de venta",
          "Valor al costo",
          "Valor de venta",
          "Activa",
        ],
        variantes.map((v) => {
          const precio = v.price ?? v.service.price;
          const stock = Math.max(0, v.stock);
          return [
            v.service.name,
            v.service.category,
            v.service.brand ?? "",
            v.service.supplier?.name ?? "",
            v.size,
            v.color,
            v.sku ?? "",
            v.stock,
            v.minStock,
            v.cost,
            precio,
            stock * v.cost,
            stock * precio,
            v.active ? "Si" : "No",
          ];
        })
      )
    );
  }

  const movimientos = await db.stockMove.findMany({
    where: { userId: user.id, day: { gte: rango.from, lte: rango.to } },
    orderBy: [{ day: "asc" }, { createdAt: "asc" }],
    include: {
      variant: { include: { service: { select: { name: true } } } },
      supplier: { select: { name: true } },
    },
  });

  return csvResponse(
    "movimientos" + sufijo + ".csv",
    buildCsv(
      [
        "Dia",
        "Prenda",
        "Talla",
        "Movimiento",
        "Cantidad",
        "Stock despues",
        "Costo unitario",
        "Proveedor",
        "Motivo",
      ],
      movimientos.map((m) => [
        m.day,
        m.variant.service.name,
        variantLabel(m.variant),
        MOVE_LABEL[m.type] ?? m.type,
        m.delta,
        m.stockAfter,
        m.unitCost,
        m.supplier?.name ?? "",
        m.reason ?? "",
      ])
    )
  );
}

function leerDia(valor: string | null, porDefecto: string): string {
  return valor && isValidDay(valor) ? valor : porDefecto;
}
