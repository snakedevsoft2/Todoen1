import { utils, write } from "xlsx";
import { requireSession } from "@/lib/auth";
import { esAdminDeChopo } from "@/lib/chopo";
import { isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { carteraDe, consolidadoDe, type Consolidado } from "@/lib/reparto-datos";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Centavos a dolares, como numero para que Excel pueda sumarlos. */
const d = (c: number) => Math.round(c) / 100;

/** El consolidado de un vendedor como la hoja CONSOLID,MES: productos y despues el cuadre. */
function hojaConsolidado(c: Consolidado, titulo: string) {
  const filas: (string | number)[][] = [
    [titulo],
    [],
    ["CÓDIGO", "PRODUCTO", "CARGA", "DEVOL", "VENDIDA", "BASE O", "CADUCADO CANT", "CADUCADO", "DESCUENTOS", "TOTAL"],
    ...c.productos.map((p) => [p.code, p.name, p.carga, p.devolucion, p.vendida, d(p.base0), p.caducadoCant, d(p.caducadoValor), d(p.descuentos), d(p.total)]),
    ["", "TOTAL GENERAL POR VENTAS", "", "", "", "", "", "", "", d(c.cuadre.totalGeneral)],
    [],
    ["TOTAL VENTAS DIARIA", d(c.cuadre.ventasDiaria)],
    ["TOTAL VENTAS CREDITO", d(c.cuadre.credito)],
    ["TOTAL VENTAS CONTADO", d(c.cuadre.contado)],
    ["TOTAL RECAUDACION CARTERA", d(c.cuadre.cartera)],
    ["TOTAL EFECTIVO RECIBIDO", d(c.cuadre.recibido)],
    ["TOTAL PAGOS Y DESEMBOLSOS", d(c.cuadre.pagos)],
    ["TOTAL EFECTIVO CAJA VENTAS REPARTO", d(c.cuadre.caja)],
    ["TOTAL EFECTIVO ENTREGADO", d(c.cuadre.entregado)],
    ["FALTANTE CAJA", d(c.cuadre.faltante)],
    ["SOBRANTE CAJA", d(c.cuadre.sobrante)],
    ["TOTAL SOBRANTE / FALTANTE", d(c.cuadre.diferencia)],
  ];
  const ws = utils.aoa_to_sheet(filas);
  ws["!cols"] = [{ wch: 30 }, { wch: 36 }, ...Array(8).fill({ wch: 12 })];
  return ws;
}

/** Nombre de hoja valido para Excel: hasta 31 letras y sin los signos que no acepta. */
const nombreHoja = (s: string, usados: Set<string>) => {
  let n = s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Hoja";
  for (let i = 2; usados.has(n); i++) n = n.slice(0, 28) + " " + i;
  usados.add(n);
  return n;
};

/**
 * Reparto en Excel: el consolidado (una hoja por vendedor y la general), las
 * planillas del rango con su cuadre, o la cartera. Solo la administradora.
 */
export async function GET(request: Request) {
  const { user, staff } = await requireSession();
  if (!esAdminDeChopo(user, staff)) return new Response("No encontrado", { status: 404 });

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") ?? "consolidado";
  const hoy = todayIn(user.timezone);
  const desde = isValidDay(url.searchParams.get("desde") ?? "") ? url.searchParams.get("desde")! : startOfMonth(hoy);
  const hasta = isValidDay(url.searchParams.get("hasta") ?? "") ? url.searchParams.get("hasta")! : hoy;
  const v = url.searchParams.get("v") || undefined;
  const wb = utils.book_new();
  const usados = new Set<string>();
  let nombre = "reparto";

  if (tipo === "cartera") {
    const equipo = new Map((await db.staff.findMany({ where: { userId: user.id }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const cartera = (await carteraDe(user.id, hoy)).filter((c) => c.saldo > 0 && (!v || c.staffId === v));
    const filas: (string | number)[][] = [["CUENTAS POR COBRAR CLIENTES", "", "", "al " + hoy], [], ["FECHA", "DOCUM.", "CLIENTE", "VALOR", "COBRADO", "SALDO", "ACUMULADO", "DÍAS", "VENDEDOR"]];
    let acumulado = 0;
    for (const c of cartera) {
      for (const doc of c.documentos.filter((x) => x.saldo !== 0)) {
        acumulado += doc.saldo;
        filas.push([doc.day, doc.documento ?? "SN", c.name, d(doc.valor), d(doc.cobrado), d(doc.saldo), d(acumulado), doc.dias, c.staffId ? equipo.get(c.staffId) ?? "" : ""]);
      }
      if (c.abonosSinDocumento) {
        acumulado -= c.abonosSinDocumento;
        filas.push(["", "ABONO", c.name, "", "", -d(c.abonosSinDocumento), d(acumulado), "", ""]);
      }
    }
    const ws = utils.aoa_to_sheet(filas);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 34 }, ...Array(6).fill({ wch: 11 })];
    utils.book_append_sheet(wb, ws, "CARTERA");
    nombre = "cartera-reparto-" + hoy;
  } else {
    const datos = await consolidadoDe(user.id, desde, hasta, v);
    if (tipo === "planillas") {
      const filas: (string | number)[][] = [
        ["FECHA", "VENDEDOR", "ESTADO", "VENTAS", "CRÉDITO", "CONTADO", "CARTERA", "RECIBIDO", "PAGOS", "CAJA", "ENTREGADO", "SOBRANTE/FALTANTE", "ACOMPAÑANTE"],
        ...datos.planillas.map((p) => [
          p.day, p.staff.name, p.estado, d(p.cuadre.ventasDiaria), d(p.cuadre.credito), d(p.cuadre.contado), d(p.cuadre.cartera),
          d(p.cuadre.recibido), d(p.cuadre.pagos), d(p.cuadre.caja), d(p.cuadre.entregado), d(p.cuadre.diferencia), p.acompanante ?? "",
        ]),
      ];
      const ws = utils.aoa_to_sheet(filas);
      ws["!cols"] = [{ wch: 12 }, { wch: 18 }, ...Array(11).fill({ wch: 12 })];
      utils.book_append_sheet(wb, ws, "PLANILLAS");
      nombre = "planillas-reparto-" + desde + "-al-" + hasta;
    } else {
      for (const c of datos.porVendedor) {
        utils.book_append_sheet(wb, hojaConsolidado(c, "VENDEDOR " + c.vendedor!.name.toUpperCase() + " · " + desde + " al " + hasta + " · " + c.dias + " días"), nombreHoja(c.vendedor!.name.toUpperCase(), usados));
      }
      utils.book_append_sheet(wb, hojaConsolidado(datos.general, "CONSOLIDADO GENERAL · " + desde + " al " + hasta), nombreHoja("GENERAL", usados));
      nombre = "consolidado-reparto-" + desde + "-al-" + hasta;
    }
  }

  const archivo = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="' + nombre + '.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
