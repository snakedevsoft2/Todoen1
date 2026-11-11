import { money, prettyDay } from "./format";
import { cobroDelDia, planDeDeuda, type OpcionesPlan } from "./prestamos";
import { esc, tirillaHtml, type Linea } from "./tirilla";
import { formatReceiptSeq } from "./receipt-seq";
import { MARCA_VERSION_GRATIS } from "./plan";

/**
 * El cobro de un dia: a quien hay que cobrarle, con sus recibos y la planilla
 * para el cobrador. Lo pidio EM Inversiones (ver lib/em-inversiones.ts):
 *
 * - "que me tire todos los recibos del dia de cobrar y me los ponga todos para
 *   imprimir en fila, no uno por uno"
 * - "que diga en que cuota va"
 * - "una hoja de todos los que tengo que cobrar, para darsela al cobrador"
 *
 * Archivo puro: la pantalla lo arma en el servidor y el boton de imprimir lo
 * vuelve a usar en el navegador, sin base de datos.
 */

/** Lo que hace falta de cada deuda para saber que se le cobra ese dia. */
export type DeudaParaCobro = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
  amount: number;
  day: string;
  installments: number | null;
  frequency: string | null;
  status: string;
  receiptSeq: number | null;
  payments: { amount: number }[];
};

export type FilaCobro = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
  /** El numero del prestamo, el mismo de su constancia. */
  prestamoNo: string | null;
  /** La cuota que va a pagar y de cuantas. */
  cuotaN: number;
  totalCuotas: number;
  /** El valor de esa cuota. */
  valorCuota: number;
  /** Lo de dias anteriores que no ha pagado. */
  atraso: number;
  cuotasAtrasadas: number;
  /** Lo que le falta de la cuota de ese dia. */
  cuotaDelDia: number;
  /** Lo que hay que cobrarle: atraso + cuota del dia. */
  aCobrar: number;
  /** Lo que debe hoy, antes de pagar. */
  saldo: number;
};

/**
 * A quien hay que cobrarle ese dia y cuanto.
 *
 * Sale quien tiene cuota ese dia sin cubrir o viene atrasado. Quien ya pago
 * la de hoy (o se adelanto) no sale: el cobrador no tiene nada que buscarle.
 * Los fiados sueltos, sin cuotas, tampoco: no tienen dia de cobro.
 */
export function filasDeCobro(deudas: DeudaParaCobro[], dia: string, opciones: OpcionesPlan): FilaCobro[] {
  const filas: FilaCobro[] = [];
  for (const d of deudas) {
    if (d.status !== "PENDIENTE") continue;
    const pagado = d.payments.reduce((s, p) => s + p.amount, 0);
    const debe = Math.max(0, d.amount - pagado);
    if (debe <= 0) continue;
    const plan = planDeDeuda(d, opciones);
    if (plan.length === 0) continue;

    const c = cobroDelDia(plan, pagado, dia);
    if (c.aCobrar <= 0 || c.cuotaN === null) continue;

    filas.push({
      id: d.id,
      clientName: d.clientName,
      clientPhone: d.clientPhone,
      clientAddress: d.clientAddress,
      prestamoNo: d.receiptSeq ? formatReceiptSeq(d.receiptSeq) : null,
      cuotaN: c.cuotaN,
      totalCuotas: plan.length,
      valorCuota: plan[c.cuotaN - 1]?.monto ?? plan[0].monto,
      atraso: c.atraso,
      cuotasAtrasadas: c.cuotasAtrasadas,
      cuotaDelDia: c.cuotaDelDia,
      aCobrar: Math.min(c.aCobrar, debe),
      saldo: debe,
    });
  }
  return filas.sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
}

export type NegocioCobro = {
  businessName: string;
  businessPhone: string | null;
  currency: string;
  /** Version gratis: el papel sale con la marca. */
  marcaGratis?: boolean;
};

/** "2 cuotas" / "1 cuota". */
function cuotas(n: number): string {
  return n + (n === 1 ? " cuota" : " cuotas");
}

/** "Domingo 16 nov": corto, para el papel. */
function diaCorto(dia: string): string {
  const largo = prettyDay(dia);
  // "domingo 16 de noviembre de 2026" -> "domingo 16 de noviembre"
  return largo.replace(/ de \d{4}$/, "");
}

/**
 * El recibo de un cliente, corto: lo que el cliente mira (cuanto paga, en que
 * cuota va y cuanto le queda) y nada mas. Se imprime antes de salir a cobrar y
 * el cobrador lo entrega cuando le pagan.
 */
export function reciboDeCobro(f: FilaCobro, negocio: NegocioCobro, dia: string): Linea[] {
  const lineas: Linea[] = [{ t: "titulo", text: negocio.businessName }];
  if (negocio.businessPhone) lineas.push({ t: "centro", text: "Tel " + negocio.businessPhone, tenue: true });
  lineas.push(
    { t: "sep" },
    { t: "centro", text: "RECIBO DE PAGO", fuerte: true },
    { t: "centro", text: diaCorto(dia), tenue: true },
    { t: "sep" },
    { t: "par", label: "Cliente", value: f.clientName, fuerte: true },
    { t: "par", label: "Cuota", value: f.cuotaN + " de " + f.totalCuotas },
    { t: "par", label: "Valor cuota", value: money(f.valorCuota, negocio.currency) }
  );
  if (f.atraso > 0) {
    lineas.push({
      t: "par",
      label: "Atrasado (" + cuotas(f.cuotasAtrasadas) + ")",
      value: money(f.atraso, negocio.currency),
    });
  }
  lineas.push(
    { t: "total", label: "PAGA", value: money(f.aCobrar, negocio.currency) },
    { t: "par", label: "Queda debiendo", value: money(Math.max(0, f.saldo - f.aCobrar), negocio.currency) }
  );
  if (f.prestamoNo) lineas.push({ t: "texto", text: "Préstamo No. " + f.prestamoNo, tenue: true });
  lineas.push({ t: "espacio" }, { t: "texto", text: "Recibió: ____________________" });
  if (negocio.marcaGratis) lineas.push({ t: "centro", text: MARCA_VERSION_GRATIS, fuerte: true });
  return lineas;
}

/** Todos los recibos del dia en un solo rollo, uno detras de otro. */
export function recibosDeCobro(filas: FilaCobro[], negocio: NegocioCobro, dia: string): Linea[] {
  const out: Linea[] = [];
  filas.forEach((f, i) => {
    if (i > 0) out.push({ t: "corte" });
    out.push(...reciboDeCobro(f, negocio, dia));
  });
  return out;
}

/** Los mismos recibos en hoja normal: tres por fila, cada uno en su recuadro para recortar. */
export function recibosDeCobroHoja(filas: FilaCobro[], negocio: NegocioCobro, dia: string): string {
  const celdas = filas
    .map((f) => '<div class="ti-celda">' + tirillaHtml(reciboDeCobro(f, negocio, dia), "58") + "</div>")
    .join("");
  return '<div class="ti-rejilla">' + celdas + "</div>";
}

/** El texto de la cuota en la planilla: "7/20", con el atraso si hay. */
function cuotaPlanilla(f: FilaCobro): string {
  return f.cuotaN + "/" + f.totalCuotas;
}

/**
 * La planilla del cobrador en hoja normal: una fila por cliente, con lo que
 * tiene que cobrar y dos columnas en blanco para anotar lo que recibio.
 */
export function planillaHoja(
  filas: FilaCobro[],
  negocio: NegocioCobro,
  dia: string,
  cobrador?: string | null
): string {
  const m = (v: number) => esc(money(v, negocio.currency));
  const total = filas.reduce((s, f) => s + f.aCobrar, 0);
  const atrasados = filas.filter((f) => f.atraso > 0).length;

  const cuerpo = filas
    .map((f, i) => {
      const contacto = [f.clientPhone, f.clientAddress].filter(Boolean).map((x) => esc(String(x))).join("<br>");
      return (
        "<tr>" +
        '<td class="tp-num">' + (i + 1) + "</td>" +
        "<td><b>" + esc(f.clientName) + "</b>" + (contacto ? '<div class="tp-chico">' + contacto + "</div>" : "") + "</td>" +
        '<td class="tp-num">' + cuotaPlanilla(f) + "</td>" +
        '<td class="tp-num">' + m(f.valorCuota) + "</td>" +
        '<td class="tp-num">' + (f.atraso > 0 ? m(f.atraso) + '<div class="tp-chico">' + cuotas(f.cuotasAtrasadas) + "</div>" : "-") + "</td>" +
        '<td class="tp-num"><b>' + m(f.aCobrar) + "</b></td>" +
        '<td class="tp-num">' + m(f.saldo) + "</td>" +
        '<td class="tp-blanco"></td>' +
        "</tr>"
      );
    })
    .join("");

  return (
    '<div class="tp">' +
    '<p class="tp-titulo">' + esc(negocio.businessName) + " · Planilla de cobro</p>" +
    '<p class="tp-sub">' + esc(prettyDay(dia)) +
    (cobrador ? " · Cobrador: " + esc(cobrador) : " · Cobrador: ____________________") +
    " · " + filas.length + (filas.length === 1 ? " cliente" : " clientes") +
    (atrasados > 0 ? " (" + atrasados + (atrasados === 1 ? " atrasado" : " atrasados") + ")" : "") +
    "</p>" +
    "<table><thead><tr>" +
    "<th>#</th><th>Cliente</th><th>Cuota</th><th>Valor cuota</th><th>Atrasado</th><th>A cobrar</th><th>Saldo</th><th>Recibió</th>" +
    "</tr></thead><tbody>" +
    cuerpo +
    "</tbody><tfoot><tr>" +
    '<td colspan="5">Total a cobrar</td><td class="tp-num">' + m(total) + "</td><td></td><td></td>" +
    "</tr></tfoot></table>" +
    (negocio.marcaGratis ? '<p class="tp-sub">' + esc(MARCA_VERSION_GRATIS) + "</p>" : "") +
    "</div>"
  );
}

/** La misma planilla en el rollo de la termica, para el cobrador que sale con la impresora de bolsillo. */
export function planillaTirilla(filas: FilaCobro[], negocio: NegocioCobro, dia: string): Linea[] {
  const total = filas.reduce((s, f) => s + f.aCobrar, 0);
  const lineas: Linea[] = [
    { t: "titulo", text: negocio.businessName },
    { t: "centro", text: "PLANILLA DE COBRO", fuerte: true },
    { t: "centro", text: diaCorto(dia), tenue: true },
    { t: "sep" },
  ];
  filas.forEach((f, i) => {
    lineas.push(
      { t: "par", label: i + 1 + ". " + f.clientName, value: money(f.aCobrar, negocio.currency), fuerte: true },
      {
        t: "texto",
        text:
          "Cuota " + cuotaPlanilla(f) +
          (f.atraso > 0 ? " · atrasado " + cuotas(f.cuotasAtrasadas) : "") +
          (f.clientPhone ? " · " + f.clientPhone : ""),
        tenue: true,
      }
    );
    if (f.clientAddress) lineas.push({ t: "texto", text: f.clientAddress, tenue: true });
    lineas.push({ t: "texto", text: "Recibió: ________" });
    if (i < filas.length - 1) lineas.push({ t: "espacio" });
  });
  lineas.push(
    { t: "total", label: "TOTAL", value: money(total, negocio.currency) },
    { t: "centro", text: filas.length + (filas.length === 1 ? " cliente" : " clientes"), tenue: true }
  );
  if (negocio.marcaGratis) lineas.push({ t: "centro", text: MARCA_VERSION_GRATIS, fuerte: true });
  lineas.push({ t: "espacio" });
  return lineas;
}

/** La planilla como texto, para mandarsela al cobrador por WhatsApp. */
export function planillaTexto(filas: FilaCobro[], negocio: NegocioCobro, dia: string): string {
  const total = filas.reduce((s, f) => s + f.aCobrar, 0);
  const renglones = filas.map((f, i) => {
    const partes = [
      i + 1 + ". *" + f.clientName + "*: " + money(f.aCobrar, negocio.currency),
      "   Cuota " + cuotaPlanilla(f) + (f.atraso > 0 ? " · atrasado " + cuotas(f.cuotasAtrasadas) : ""),
    ];
    const contacto = [f.clientPhone, f.clientAddress].filter(Boolean).join(" · ");
    if (contacto) partes.push("   " + contacto);
    return partes.join("\n");
  });
  return [
    "*" + negocio.businessName + "* · Cobro del " + prettyDay(dia),
    "",
    ...renglones,
    "",
    "Total a cobrar: *" + money(total, negocio.currency) + "* (" + filas.length + (filas.length === 1 ? " cliente)" : " clientes)"),
  ].join("\n");
}
