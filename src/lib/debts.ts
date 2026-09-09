import { money } from "./format";

/**
 * Ayudas de cartera.
 *
 * Archivo puro, sin base de datos, para que lo puedan usar tambien los
 * componentes del navegador.
 */
export type DebtLike = {
  amount: number;
  dueDay: string | null;
  status: string;
  payments: { amount: number }[];
};

/** Lo que falta por cobrar. Nunca baja de cero, aunque abonen de mas. */
export function saldo(debt: DebtLike): number {
  const abonado = debt.payments.reduce((s, p) => s + p.amount, 0);
  return Math.max(0, debt.amount - abonado);
}

export function abonado(debt: DebtLike): number {
  return debt.payments.reduce((s, p) => s + p.amount, 0);
}

export type DebtState = {
  key: "pagada" | "anulada" | "vencida" | "vencehoy" | "vencepronto" | "aldia" | "sinfecha";
  label: string;
  tone: "good" | "bad" | "amber" | "slate";
  /** Dias que faltan (negativo si ya vencio). null si no hay fecha. */
  dias: number | null;
};

/** Cuantos dias hay entre dos "YYYY-MM-DD". */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(
    Number(desde.slice(0, 4)),
    Number(desde.slice(5, 7)) - 1,
    Number(desde.slice(8, 10))
  );
  const b = Date.UTC(
    Number(hasta.slice(0, 4)),
    Number(hasta.slice(5, 7)) - 1,
    Number(hasta.slice(8, 10))
  );
  return Math.round((b - a) / 86400000);
}

/**
 * En que va la deuda respecto a hoy.
 *
 * "Vence pronto" son tres dias o menos: es cuando todavia sirve recordar sin
 * que suene a cobro.
 */
export function debtState(debt: DebtLike, hoy: string): DebtState {
  if (debt.status === "ANULADA") {
    return { key: "anulada", label: "Anulada", tone: "slate", dias: null };
  }
  if (debt.status === "PAGADA" || saldo(debt) === 0) {
    return { key: "pagada", label: "Pagada", tone: "good", dias: null };
  }
  if (!debt.dueDay) {
    return { key: "sinfecha", label: "Sin fecha", tone: "slate", dias: null };
  }

  const dias = diasEntre(hoy, debt.dueDay);
  if (dias < 0) {
    const cuantos = Math.abs(dias);
    return {
      key: "vencida",
      label: "Vencida hace " + cuantos + (cuantos === 1 ? " dia" : " dias"),
      tone: "bad",
      dias,
    };
  }
  if (dias === 0) return { key: "vencehoy", label: "Vence hoy", tone: "amber", dias };
  if (dias <= 3) {
    return { key: "vencepronto", label: "Vence en " + dias + (dias === 1 ? " dia" : " dias"), tone: "amber", dias };
  }
  return { key: "aldia", label: "Vence en " + dias + " dias", tone: "slate", dias };
}

/** El texto del cobro. Cambia el tono segun este vencida o no. */
export function collectionMessage(input: {
  businessName: string;
  clientName: string;
  concept: string;
  saldo: number;
  currency: string;
  estado: DebtState;
  prettyDue: string | null;
}): string {
  const saludo = "Hola " + input.clientName + ", te escribimos de " + input.businessName + ".";
  const cuanto = "Tienes un saldo pendiente de " + money(input.saldo, input.currency);
  const porQue = " por " + input.concept + ".";

  const cierre =
    input.estado.key === "vencida"
      ? "Se vencio el " + input.prettyDue + ". Nos cuentas cuando lo puedes pagar y lo cuadramos."
      : input.estado.key === "vencehoy"
        ? "Vence hoy. Si ya lo pagaste, avisanos y lo descontamos."
        : input.prettyDue
          ? "Tienes plazo hasta el " + input.prettyDue + "."
          : "Cuando puedas nos avisas y lo cuadramos.";

  return [saludo, "", cuanto + porQue, "", cierre, "", "Gracias."].join("\n");
}
