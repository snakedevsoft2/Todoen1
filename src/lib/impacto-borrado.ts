import { money, prettyDay } from "./format";
import { formatReceiptSeq } from "./receipt-seq";

/**
 * Lo que se le muestra al dueño antes de borrar algo: que se borra y que
 * cambia en los numeros si lo borra.
 *
 * Se arma en el servidor, con los datos de verdad del registro, y lo pinta
 * components/BotonBorrar.tsx. Cada "efecto" dice algo que de verdad hace la
 * accion de borrar correspondiente (deleteSaleAction, deleteWashJobAction...):
 * si una accion cambia lo que hace, cambia aqui tambien.
 */

export type AvisoBorrado = {
  titulo: string;
  /** Los datos de lo que se borra, una linea cada uno. */
  que: string[];
  /** Lo que cambia en el resto de la aplicacion si se borra. */
  efectos: string[];
  /** El texto del boton que borra. Por defecto "Sí, borrar". */
  boton?: string;
};

const PAGO: Record<string, string> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
  OTRO: "otro medio",
};

const ESTADO_VEHICULO: Record<string, string> = {
  EN_COLA: "en cola",
  LAVANDO: "lavándose",
  LISTO: "listo para entregar",
  POR_COBRAR: "entregado sin pagar (en Pendientes)",
  ENTREGADO: "entregado y cobrado",
  CANCELADO: "cancelado",
};

/** "15 de octubre", sin el dia de la semana ni el año: para frases cortas. */
function diaCorto(day: string): string {
  return prettyDay(day).replace(/^\S+\s/, "").replace(/ de \d{4}$/, "");
}

function vehiculo(v: { vehiclePlate: string | null; vehicleType: string | null; vehicleColor: string | null }): string {
  return [v.vehiclePlate, v.vehicleType, v.vehicleColor].filter(Boolean).join(" · ");
}

function comision(total: number, pct: number): number {
  return Math.round((total * pct) / 100);
}

/** Lo que pasa con la caja de un dia que ya tiene cierre guardado. */
function cajaCerrada(day: string): string {
  return (
    "La caja del " +
    diaCorto(day) +
    " ya está cerrada: el cierre guardado no cambia solo. Reábrela en Caja y ciérrala otra vez para que cuadre."
  );
}

export type VentaParaBorrar = {
  day: string;
  total: number;
  paymentMethod: string;
  origin: string;
  clientName: string | null;
  receiptSeq: number | null;
  items: { name: string; qty: number; variantId: string | null }[];
  staff: { name: string; commissionPct: number } | null;
  /** El vehiculo del lavado que se cobro con esta venta. */
  washJob: { vehiclePlate: string | null; vehicleType: string | null; vehicleColor: string | null } | null;
  /** Si esta venta le dio un sello en la tarjeta de fidelizacion. */
  conSello: boolean;
  /** Factura autorizada que fallo o fue rechazada (las autorizadas no se borran). */
  conFacturaFallida: boolean;
  orderLabel?: string | null;
  appointment?: boolean;
  parkingPlate?: string | null;
};

export function avisoBorrarVenta(
  v: VentaParaBorrar,
  ctx: { currency: string; cajaCerrada: boolean; conEntregaDeTurno?: boolean }
): AvisoBorrado {
  const plata = money(v.total, ctx.currency);
  const que = [
    "Venta de " + plata + " en " + (PAGO[v.paymentMethod] ?? v.paymentMethod) + ", del " + diaCorto(v.day),
    v.items.map((i) => i.qty + "x " + i.name).join(", ") || "Venta sin detalle",
  ];
  if (v.receiptSeq) que.push("Recibo #" + formatReceiptSeq(v.receiptSeq));
  if (v.clientName) que.push("Cliente: " + v.clientName);
  if (v.washJob && vehiculo(v.washJob)) que.push("Vehículo: " + vehiculo(v.washJob));

  const efectos = [
    "Sale de Ventas, de la caja del " +
      diaCorto(v.day) +
      " (" +
      (PAGO[v.paymentMethod] ?? v.paymentMethod) +
      " baja " +
      plata +
      ") y de los reportes.",
  ];
  if (v.staff) {
    const c = comision(v.total, v.staff.commissionPct);
    efectos.push(
      "Se le descuenta a " +
        v.staff.name +
        " de lo que atendió" +
        (c > 0 ? ": deja de ganar " + money(c, ctx.currency) + " de comisión." : ".")
    );
  }
  if (v.washJob) {
    efectos.push(
      "El vehículo" +
        (v.washJob.vehiclePlate ? " " + v.washJob.vehiclePlate : "") +
        " vuelve a Pendientes del patio, como entregado sin pagar. Si el vehículo tampoco debía estar, bórralo en Patio > Historial."
    );
  }
  if (v.conSello) {
    efectos.push(
      "La tarjeta de fidelización" + (v.clientName ? " de " + v.clientName : "") + " pierde el sello de este lavado."
    );
  }
  if (v.items.some((i) => i.variantId)) efectos.push("Las prendas vendidas vuelven al inventario.");
  if (v.orderLabel) efectos.push("La cuenta " + v.orderLabel + " se vuelve a abrir.");
  if (v.appointment) efectos.push("El turno vuelve a quedar confirmado, sin cobrar.");
  if (v.parkingPlate) efectos.push("El ticket del vehículo " + v.parkingPlate + " vuelve a quedar por cobrar.");
  if (v.conFacturaFallida) efectos.push("Se borra también la factura autorizada que no se alcanzó a emitir.");
  if (v.receiptSeq) efectos.push("El número de recibo #" + formatReceiptSeq(v.receiptSeq) + " no se vuelve a usar.");
  if (ctx.cajaCerrada) efectos.push(cajaCerrada(v.day));
  if (ctx.conEntregaDeTurno) {
    efectos.push("Las entregas de turno ya guardadas no cambian: son la foto de ese momento.");
  }

  return { titulo: "¿Borrar esta venta?", que, efectos, boton: "Sí, borrar la venta" };
}

export type VehiculoParaBorrar = {
  day: string;
  clientName: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  vehicleColor: string | null;
  serviceName: string;
  price: number;
  status: string;
  lavador: { name: string; commissionPct: number } | null;
  appointment: boolean;
  /** La venta con la que se cobro, si ya se cobro. */
  sale: { total: number; paymentMethod: string; day: string; receiptSeq: number | null; conSello: boolean } | null;
};

export function avisoBorrarVehiculo(
  j: VehiculoParaBorrar,
  ctx: { currency: string; cajaCerrada: boolean }
): AvisoBorrado {
  const que = [
    (vehiculo(j) || "Vehículo sin placa") + " — " + j.clientName,
    j.serviceName + " · " + money(j.sale?.total ?? j.price, ctx.currency) + " · " + (ESTADO_VEHICULO[j.status] ?? j.status),
    "Recibido el " + diaCorto(j.day) + (j.lavador ? " · lo lavó " + j.lavador.name : ""),
  ];

  const efectos: string[] = [];
  if (j.sale) {
    const plata = money(j.sale.total, ctx.currency);
    que.push(
      "Su venta: " +
        plata +
        " en " +
        (PAGO[j.sale.paymentMethod] ?? j.sale.paymentMethod) +
        (j.sale.receiptSeq ? ", recibo #" + formatReceiptSeq(j.sale.receiptSeq) : "")
    );
    efectos.push(
      "Se borra también su venta: sale de Ventas, de la caja del " +
        diaCorto(j.sale.day) +
        " (" +
        (PAGO[j.sale.paymentMethod] ?? j.sale.paymentMethod) +
        " baja " +
        plata +
        ") y de los reportes."
    );
    if (j.lavador) {
      const c = comision(j.sale.total, j.lavador.commissionPct);
      efectos.push(
        j.lavador.name +
          " deja de tener este lavado en Mis lavados y en su medición" +
          (c > 0 ? ", y deja de ganar " + money(c, ctx.currency) + " de comisión." : ".")
      );
    }
    if (j.sale.conSello) efectos.push("La tarjeta de fidelización de " + j.clientName + " pierde el sello de este lavado.");
    if (j.sale.receiptSeq) efectos.push("El número de recibo #" + formatReceiptSeq(j.sale.receiptSeq) + " no se vuelve a usar.");
    if (ctx.cajaCerrada) efectos.push(cajaCerrada(j.sale.day));
  } else if (j.status === "POR_COBRAR") {
    efectos.push(
      "Se borra lo que " + j.clientName + " debía (" + money(j.price, ctx.currency) + "): deja de aparecer en Pendientes del patio."
    );
    if (j.lavador) efectos.push(j.lavador.name + " deja de verlo en Mis lavados.");
  } else if (j.status === "CANCELADO") {
    efectos.push("Ya estaba cancelado: solo deja de aparecer en el historial. La caja no cambia.");
  } else {
    efectos.push("Sale del patio. Todavía no se había cobrado, así que la caja y las ventas no cambian.");
    if (j.lavador) efectos.push(j.lavador.name + " deja de verlo en Mis lavados.");
  }
  if (j.appointment) efectos.push("Venía de una reserva: la reserva queda otra vez sin recibir.");

  return { titulo: "¿Borrar este vehículo?", que, efectos, boton: "Sí, borrar el vehículo" };
}

export function avisoBorrarGasto(
  g: { day: string; description: string; category: string; amount: number },
  ctx: { currency: string; cajaCerrada: boolean }
): AvisoBorrado {
  const plata = money(g.amount, ctx.currency);
  const efectos = ["Sale de los gastos del " + diaCorto(g.day) + ": el neto de la caja de ese día sube " + plata + "."];
  if (ctx.cajaCerrada) efectos.push(cajaCerrada(g.day));
  return {
    titulo: "¿Borrar este gasto?",
    que: [g.description + " · " + plata, g.category + " · " + diaCorto(g.day)],
    efectos,
    boton: "Sí, borrar el gasto",
  };
}

export function avisoReabrirCaja(
  c: { day: string; persona: string | null; countedCash: number; difference: number; netTotal: number },
  ctx: { currency: string }
): AvisoBorrado {
  return {
    titulo: "¿Reabrir la caja?",
    que: [
      "Cierre de caja del " + diaCorto(c.day) + (c.persona ? " de " + c.persona : ""),
      "Neto " + money(c.netTotal, ctx.currency) + " · contado " + money(c.countedCash, ctx.currency) + " · diferencia " + money(c.difference, ctx.currency),
    ],
    efectos: [
      "Se borra el cierre guardado: lo contado, la base y la diferencia de ese día.",
      "Las ventas y los gastos del día no se tocan. Puedes cerrarla otra vez con los números de ahora.",
    ],
    boton: "Sí, reabrir la caja",
  };
}

export function avisoBorrarEntrega(
  e: {
    day: string;
    de: string | null;
    para: string | null;
    totalSales: number;
    cashDelivered: number;
    pendingCount: number;
    recibida: boolean;
    esLaUltima: boolean;
  },
  ctx: { currency: string }
): AvisoBorrado {
  const efectos = [
    "Se borra solo el reporte de la entrega. Las ventas, los gastos y los vehículos del patio no cambian.",
  ];
  if (e.esLaUltima) {
    efectos.push("Es la última entrega: el turno de ahora vuelve a contar desde la entrega anterior (o desde el inicio del día).");
  }
  if (!e.recibida && e.para) efectos.push(e.para + " deja de ver el aviso de que le entregaron el patio.");
  return {
    titulo: "¿Borrar esta entrega de turno?",
    que: [
      "Entrega del " + diaCorto(e.day) + (e.de ? " de " + e.de : "") + (e.para ? " a " + e.para : ""),
      "Cobrado " + money(e.totalSales, ctx.currency) + " · efectivo entregado " + money(e.cashDelivered, ctx.currency),
      e.pendingCount === 1 ? "Dejó 1 vehículo pendiente" : "Dejó " + e.pendingCount + " vehículos pendientes",
    ],
    efectos,
    boton: "Sí, borrar la entrega",
  };
}

export function avisoBorrarPendiente(
  d: { day: string; clientName: string; amount: number; concept: string; abonos: number },
  ctx: { currency: string; etiqueta: string }
): AvisoBorrado {
  const plata = money(d.amount, ctx.currency);
  return {
    titulo: "¿Borrar este " + ctx.etiqueta.toLowerCase() + "?",
    que: [d.clientName + " debe " + plata, d.concept + " · " + diaCorto(d.day)],
    efectos:
      d.abonos > 0
        ? [
            "Ya tiene abonos: no se borra del todo, queda anulada y deja de cobrarse.",
            "Los abonos que ya entraron se quedan en la caja del día en que se recibieron.",
          ]
        : [
            d.clientName + " deja de deber " + plata + ": sale de lo que está por cobrar.",
            "La caja no cambia: esa plata todavía no había entrado.",
          ],
    boton: "Sí, borrar",
  };
}

export function avisoEliminarPersona(p: {
  name: string;
  rol: string;
  acceso: string | null;
}): AvisoBorrado {
  return {
    titulo: "¿Eliminar a " + p.name + " del equipo?",
    que: [p.name + " · " + p.rol, p.acceso ? "Entra con " + p.acceso : "Sin usuario para entrar"],
    efectos: [
      "Ya no puede entrar: su sesión se cierra en todos los teléfonos.",
      "Desaparece de Equipo y de las listas para asignar o elegir personas.",
      "Sus registros se quedan: ventas, lavados, turnos, marcajes y reportes. En ellos aparece como «Ex colaborador».",
      p.acceso ? "Su " + (p.acceso.includes("@") ? "correo" : "usuario") + " queda libre para usarlo con otra persona." : "",
    ].filter(Boolean),
    boton: "Sí, eliminar",
  };
}
