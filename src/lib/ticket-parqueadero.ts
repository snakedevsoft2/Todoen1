import { money } from "./format";
import { duracionTexto, numeroTicket, rangoTexto, tarifaEnPalabras, type Tarifa } from "./parqueadero-tarifa";
import type { Linea } from "./tirilla";

/**
 * El ticket del parqueadero: lo que se imprime al entrar (con el QR) y lo que
 * se manda por WhatsApp o por correo.
 *
 * Sin base de datos: lo arma el navegador al tocar Imprimir, igual que la
 * factura de venta. La matriz del QR ya viene hecha del servidor.
 */
export type TicketData = {
  businessName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  seq: number;
  plate: string;
  vehicleType: string;
  spot: string | null;
  enteredAt: string;
  timezone: string;
  currency: string;
  tarifa: Tarifa;
  /** La pagina publica del ticket, a donde lleva el QR. */
  url: string;
  qrModulos: boolean[][];
  /** Si ya salio: cuando, cuanto tiempo y cuanto. */
  salida: { exitedAt: string; minutos: number; amount: number; pendiente: boolean } | null;
};

/** "30/09/2026 3:45 p. m." en la hora del negocio. */
export function fechaHora(iso: string, timezone: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function ticketTirilla(d: TicketData): Linea[] {
  const lineas: Linea[] = [
    { t: "titulo", text: d.businessName },
    ...(d.address ? [{ t: "centro" as const, text: d.address, tenue: true }] : []),
    ...(d.phone ? [{ t: "centro" as const, text: "Tel. " + d.phone, tenue: true }] : []),
    { t: "sep" },
    { t: "centro", text: "TICKET " + numeroTicket(d.seq), fuerte: true },
    { t: "titulo", text: d.plate },
    { t: "centro", text: d.vehicleType },
    { t: "sep" },
    { t: "par", label: "Entrada", value: fechaHora(d.enteredAt, d.timezone) },
  ];
  if (d.spot) lineas.push({ t: "par", label: "Puesto", value: d.spot });

  if (d.salida) {
    lineas.push(
      { t: "par", label: "Salida", value: fechaHora(d.salida.exitedAt, d.timezone) },
      { t: "par", label: "Tiempo", value: duracionTexto(d.salida.minutos) },
      { t: "total", label: d.salida.pendiente ? "Debe" : "Pagado", value: money(d.salida.amount, d.currency) }
    );
  }

  lineas.push({ t: "sep" }, { t: "centro", text: "Tarifa", fuerte: true });
  for (const r of tarifaEnPalabras(d.tarifa, d.currency)) lineas.push({ t: "centro", text: r });
  const rango = rangoTexto(d.tarifa, d.currency);
  if (rango) lineas.push({ t: "centro", text: rango, tenue: true });

  if (!d.salida) {
    lineas.push(
      { t: "sep" },
      { t: "centro", text: "Escanea para ver cuánto tiempo llevas y cuánto vas a pagar", tenue: true },
      { t: "qr", text: d.url, modulos: d.qrModulos },
      { t: "centro", text: "Conserva este ticket para retirar tu vehículo.", tenue: true }
    );
  } else {
    lineas.push({ t: "espacio" }, { t: "centro", text: "¡Gracias por tu visita!" });
  }
  lineas.push({ t: "espacio" });
  return lineas;
}

/** El texto que se manda por WhatsApp o por correo, con el enlace del QR. */
export function ticketMensaje(d: TicketData): string {
  const partes = [
    d.businessName + " - Ticket " + numeroTicket(d.seq),
    "Vehículo: " + d.vehicleType + " " + d.plate,
    "Entrada: " + fechaHora(d.enteredAt, d.timezone),
  ];
  if (d.spot) partes.push("Puesto: " + d.spot);
  if (d.address) partes.push("Dirección: " + d.address);
  const tarifa = tarifaEnPalabras(d.tarifa, d.currency).join(" · ");
  if (tarifa) partes.push("Tarifa: " + tarifa);
  const rango = rangoTexto(d.tarifa, d.currency);
  if (rango) partes.push(rango);
  if (d.salida) {
    partes.push(
      "Salida: " + fechaHora(d.salida.exitedAt, d.timezone) + " (" + duracionTexto(d.salida.minutos) + ")",
      (d.salida.pendiente ? "Debe: " : "Pagado: ") + money(d.salida.amount, d.currency)
    );
  } else {
    partes.push("", "Mira aquí cuánto tiempo llevas y cuánto vas a pagar:", d.url);
  }
  return partes.join("\n");
}

export function ticketFileName(d: TicketData): string {
  return "ticket-" + numeroTicket(d.seq) + "-" + d.plate + ".pdf";
}
