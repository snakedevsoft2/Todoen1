import type { User } from "@prisma/client";
import { db } from "./db";
import { addDays, startOfMonth, todayIn } from "./dates";
import { money, shortDay } from "./format";
import { BUSINESS_LABEL, ITEM_NOUN } from "./nav";
import { getComparison, getDaySummary, getRangeTotals, getTopItems } from "./queries";
import { getInventorySummary, getLowStock } from "./inventory";
import { variantLabel } from "./variants";
import { saldo } from "./debts";

/**
 * Resumen del negocio para el asistente.
 *
 * Sin esto el asistente daria consejos de manual. Con las cifras de verdad
 * puede decir "te estas quedando sin la talla M" en vez de "revisa tu
 * inventario".
 *
 * Solo van numeros y nombres de productos: nada de datos de clientes, que no
 * hacen falta para aconsejar y no tienen por que salir del negocio.
 */
export async function businessSnapshot(user: User): Promise<string> {
  const hoy = todayIn(user.timezone);
  const mes = startOfMonth(hoy);
  const hace30 = addDays(hoy, -29);
  const noun = ITEM_NOUN[user.businessType];
  const esRopa = user.businessType === "ROPA";
  const esBarberia = user.businessType === "BARBERIA";

  const [dia, mesTotales, comparacion, top, deudas, servicios] = await Promise.all([
    getDaySummary(user.id, hoy),
    getRangeTotals(user.id, mes, hoy),
    getComparison(user.id, hace30, hoy),
    getTopItems(user.id, mes, hoy, 5),
    db.debt.findMany({
      where: { userId: user.id, status: "PENDIENTE" },
      include: { payments: { select: { amount: true } } },
    }),
    db.service.count({ where: { userId: user.id, active: true } }),
  ]);

  const lineas: string[] = [
    "NEGOCIO",
    "Nombre: " + user.businessName,
    "Tipo: " + BUSINESS_LABEL[user.businessType],
    "Moneda: " + user.currency,
    "Hoy es " + shortDay(hoy) + ".",
    // Sin adjetivo: "prendas activos" suena mal y el modelo lo repetiria.
    "Tiene " + servicios + " " + noun.plural + " en su catalogo.",
    "",
    "HOY",
    "Ventas: " + money(dia.totalSales, user.currency) + " en " + dia.salesCount +
      (dia.salesCount === 1 ? " venta." : " ventas."),
    "Gastos: " + money(dia.totalExpenses, user.currency) + ".",
    "Le queda limpio: " + money(dia.netTotal, user.currency) + ".",
    "Ticket promedio: " + money(dia.ticketAverage, user.currency) + ".",
    "",
    "ESTE MES (desde el " + shortDay(mes) + ")",
    "Vendido: " + money(mesTotales.totalSales, user.currency),
    "Gastado: " + money(mesTotales.totalExpenses, user.currency),
    "Ganancia: " + money(mesTotales.netTotal, user.currency),
    "Ventas cerradas: " + mesTotales.salesCount,
    "Efectivo: " + money(mesTotales.byMethod.EFECTIVO, user.currency) +
      " | Tarjeta: " + money(mesTotales.byMethod.TARJETA, user.currency) +
      " | Transferencia: " + money(mesTotales.byMethod.TRANSFERENCIA, user.currency),
    "",
    "COMPARADO CON LOS 30 DIAS ANTERIORES",
  ];

  for (const fila of comparacion.rows) {
    const valor = fila.money ? money(fila.now, user.currency) : String(fila.now);
    const antes = fila.money ? money(fila.before, user.currency) : String(fila.before);
    lineas.push(
      fila.label + ": " + valor + " (antes " + antes + ")" +
        (fila.pct === null ? "" : ", cambio " + (fila.pct > 0 ? "+" : "") + fila.pct + "%")
    );
  }

  if (top.length > 0) {
    lineas.push("", "LO MAS VENDIDO ESTE MES");
    for (const item of top) {
      lineas.push("- " + item.name + ": " + item.qty + " unidades, " + money(item.total, user.currency));
    }
  } else {
    lineas.push("", "LO MAS VENDIDO ESTE MES: todavia no hay ventas este mes.");
  }

  if (esRopa) {
    const [inv, bajos] = await Promise.all([
      getInventorySummary(user.id),
      getLowStock(user.id, 10),
    ]);
    lineas.push(
      "",
      "INVENTARIO",
      "Prendas en tienda: " + inv.units + " en " + inv.variantCount + " tallas.",
      "Valor al costo: " + money(inv.costValue, user.currency),
      "Valor de venta: " + money(inv.saleValue, user.currency),
      "Tallas agotadas: " + inv.outCount + " | por acabarse: " + inv.lowCount
    );
    if (bajos.length > 0) {
      lineas.push("Tallas en rojo:");
      for (const v of bajos) {
        lineas.push(
          "- " + v.service.name + " " + variantLabel(v) + ": quedan " + v.stock +
            " (minimo " + v.minStock + ")"
        );
      }
    }
  }

  if (esBarberia) {
    const [turnosHoy, turnosManana] = await Promise.all([
      db.appointment.count({ where: { userId: user.id, day: hoy, status: { not: "CANCELADO" } } }),
      db.appointment.count({
        where: { userId: user.id, day: addDays(hoy, 1), status: { not: "CANCELADO" } },
      }),
    ]);
    lineas.push(
      "",
      "AGENDA",
      "Turnos hoy: " + turnosHoy,
      "Turnos manana: " + turnosManana,
      "Horario: " + user.openHour + ":00 a " + user.closeHour + ":00"
    );
  }

  const pendientes = deudas.map((d) => saldo(d)).filter((s) => s > 0);
  const totalCartera = pendientes.reduce((s, v) => s + v, 0);
  const vencidas = deudas.filter((d) => d.dueDay && d.dueDay < hoy && saldo(d) > 0).length;
  lineas.push(
    "",
    "CARTERA",
    "Le deben " + money(totalCartera, user.currency) + " en " + pendientes.length + " deudas.",
    "Vencidas: " + vencidas
  );

  return lineas.join("\n");
}

/**
 * Las reglas del asistente.
 *
 * Lo importante: que use las cifras que le damos y que no invente. Un consejo
 * de negocio con numeros inventados hace mas daño que no dar consejo.
 */
export function systemPrompt(snapshot: string, businessLabel: string): string {
  return [
    "Eres el asistente de Todoen1, una aplicacion para manejar negocios pequenos en Colombia.",
    "Le hablas al dueno o al empleado de un negocio de tipo: " + businessLabel + ".",
    "",
    "COMO RESPONDER",
    "- En espanol de Colombia, claro y directo. Tuteas.",
    "- Corto: maximo 6 frases o una lista de 5 puntos. Nada de parrafos largos.",
    "- Habla como le hablarias a alguien que maneja su negocio, no como un consultor.",
    "- Nada de tecnicismos de contabilidad sin explicarlos.",
    "- No uses tablas ni encabezados. Texto simple y listas con guiones.",
    "",
    "DE QUE PUEDES HABLAR",
    "- Como va el negocio, segun las cifras de abajo.",
    "- Que hacer para vender mas, cobrar mejor o cuidar el inventario.",
    "- Como se hace algo dentro de la aplicacion (registrar una venta, cerrar la caja,",
    "  anotar un fiado, cargar inventario, mandar el portafolio, cobrar una deuda).",
    "",
    "REGLAS QUE NO PUEDES ROMPER",
    "- Usa SOLO los numeros del resumen. Si te preguntan algo que no esta ahi, dilo:",
    '  "eso no lo tengo a la mano". NUNCA inventes cifras.',
    "- No prometas resultados ni des consejo legal, tributario ni medico.",
    "- Si la pregunta no tiene que ver con el negocio, redirige con amabilidad.",
    "",
    "RESUMEN DEL NEGOCIO (datos reales de hoy)",
    snapshot,
  ].join("\n");
}
