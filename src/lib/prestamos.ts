import { addDays } from "./dates";
import { siguienteDiaDeCobro } from "./festivos";

/**
 * Cuentas del prestamo: interes, cuotas y atraso.
 *
 * Archivo puro, sin base de datos, para que lo usen igual el servidor y el
 * navegador: la pantalla que crea el prestamo necesita mostrar el valor de la
 * cuota mientras el dueno escribe, y el servidor necesita el mismo numero para
 * guardarlo. Una sola cuenta en un solo sitio, o se separan.
 */

export type Frecuencia = "DIARIA" | "SEMANAL" | "QUINCENAL" | "MENSUAL";

export const FRECUENCIAS: { value: Frecuencia; label: string; dias: number }[] = [
  { value: "DIARIA", label: "Diaria", dias: 1 },
  { value: "SEMANAL", label: "Semanal", dias: 7 },
  { value: "QUINCENAL", label: "Quincenal", dias: 15 },
  { value: "MENSUAL", label: "Mensual", dias: 30 },
];

export function esFrecuencia(v: unknown): v is Frecuencia {
  return FRECUENCIAS.some((f) => f.value === v);
}

export function diasDe(f: Frecuencia): number {
  return FRECUENCIAS.find((x) => x.value === f)?.dias ?? 1;
}

export function etiquetaDe(f: Frecuencia): string {
  return FRECUENCIAS.find((x) => x.value === f)?.label ?? String(f);
}

/**
 * Cuanto tiene que devolver en total.
 *
 * El interes es plano sobre el capital, que es como se presta en la calle:
 * "te presto 500 y me devuelves 600". No es interes compuesto ni se recalcula
 * sobre el saldo, porque no es asi como lo cobra quien va a usar esto.
 */
export function totalConInteres(principal: number, interesPct: number): number {
  if (principal <= 0) return 0;
  const pct = Math.max(0, interesPct);
  return Math.round(principal + (principal * pct) / 100);
}

/** Lo que se gana el negocio con ese prestamo. */
export function ganancia(principal: number, interesPct: number): number {
  return totalConInteres(principal, interesPct) - Math.max(0, principal);
}

/**
 * Valor de cada cuota.
 *
 * Se redondea hacia arriba a la decena mas cercana porque nadie cobra cuotas
 * de $29.999: se cobra $30.000. Lo que sobra se le descuenta a la ultima, que
 * es lo que hace cualquiera con lapiz y papel.
 */
export function valorCuota(total: number, cuotas: number): number {
  if (total <= 0 || cuotas <= 0) return 0;
  return Math.ceil(total / cuotas / 10) * 10;
}

export type Cuota = {
  /** Numero de cuota, empezando en 1. */
  n: number;
  /** Cuando se paga, en "YYYY-MM-DD". */
  day: string;
  monto: number;
};

export type PlanEntrada = {
  /** Total a pagar (capital + interes). */
  total: number;
  cuotas: number;
  frecuencia: Frecuencia;
  /** Dia en que se hizo el prestamo, "YYYY-MM-DD". */
  desde: string;
} & OpcionesPlan;

/**
 * Como se reparten las fechas. Vacio es el de siempre: una cuota cada tantos
 * dias corridos, caiga en lo que caiga.
 */
export type OpcionesPlan = {
  /**
   * Sin domingos ni festivos (lo pidio EM Inversiones, ver
   * lib/em-inversiones.ts). La cuota diaria cae solo en dias de cobro; la
   * semanal, quincenal o mensual que cae en domingo o festivo se corre al
   * siguiente dia de cobro, sin correr las que siguen.
   */
  soloDiasDeCobro?: boolean;
  /** De que pais son los festivos. Por ahora solo se conocen los de Colombia. */
  pais?: string;
};

/** Los dias de las cuotas, en orden. */
function fechasDeCuotas(
  cuotas: number,
  frecuencia: Frecuencia,
  desde: string,
  { soloDiasDeCobro = false, pais = "CO" }: OpcionesPlan
): string[] {
  const paso = diasDe(frecuencia);
  const fechas: string[] = [];
  if (!soloDiasDeCobro) {
    for (let n = 1; n <= cuotas; n += 1) fechas.push(addDays(desde, paso * n));
    return fechas;
  }
  if (frecuencia === "DIARIA") {
    // Un dia de cobro despues del otro: el domingo y el festivo no cuentan.
    let dia = desde;
    for (let n = 1; n <= cuotas; n += 1) {
      dia = siguienteDiaDeCobro(addDays(dia, 1), pais);
      fechas.push(dia);
    }
    return fechas;
  }
  for (let n = 1; n <= cuotas; n += 1) {
    fechas.push(siguienteDiaDeCobro(addDays(desde, paso * n), pais));
  }
  return fechas;
}

/**
 * El plan de pagos completo.
 *
 * La primera cuota no cae el mismo dia del prestamo sino un periodo despues:
 * quien presta hoy no cobra hoy. La ultima se ajusta con lo que sobre del
 * redondeo, para que la suma del plan de exactamente el total y no un peso
 * mas.
 */
export function planDeCuotas({ total, cuotas, frecuencia, desde, ...opciones }: PlanEntrada): Cuota[] {
  if (total <= 0 || cuotas <= 0) return [];

  const fechas = fechasDeCuotas(cuotas, frecuencia, desde, opciones);

  /*
   * El plan tiene SIEMPRE tantas cuotas como se pactaron.
   *
   * Redondear la cuota hacia arriba puede cubrir el total antes de tiempo: con
   * 100 en 20 cuotas, la cuota redondeada es 10 y a la decima ya no queda
   * nada. Antes el plan se cortaba ahi y quedaban diez cuotas contra unas
   * veinte pactadas que seguian guardadas: la ficha decia "cuota 7 de 10" y el
   * prestamo decia 20. Cuando el redondeo no cabe, se reparte sin redondear.
   */
  let valor = valorCuota(total, cuotas);
  if (valor * (cuotas - 1) >= total) valor = Math.floor(total / cuotas);

  const plan: Cuota[] = [];
  let acumulado = 0;

  for (let n = 1; n <= cuotas; n += 1) {
    const esUltima = n === cuotas;
    const monto = esUltima
      ? Math.max(0, total - acumulado)
      : Math.max(0, Math.min(valor, total - acumulado));
    acumulado += monto;
    plan.push({ n, day: fechas[n - 1], monto });
  }

  return plan;
}

/** Cuanto deberia haber pagado a esta fecha, segun el plan. */
export function exigibleA(plan: Cuota[], hoy: string): number {
  return plan.filter((c) => c.day <= hoy).reduce((s, c) => s + c.monto, 0);
}

export type EstadoPrestamo = {
  /** Cuotas que ya vencieron. */
  vencidas: number;
  /** Cuanto deberia haber abonado ya. */
  exigible: number;
  /** Lo que le falta para estar al dia. Cero si va al dia o adelantado. */
  atraso: number;
  /** Cuantas cuotas de atraso lleva, redondeando hacia abajo. */
  cuotasAtrasadas: number;
  /** La proxima cuota que le toca, o null si ya no quedan. */
  proxima: Cuota | null;
  /** Cuantas cuotas lleva cubiertas con lo que ha abonado. */
  cuotasPagadas: number;
  /** Si hoy le toca pagar. */
  tocaHoy: boolean;
  /** Lo que le corresponde pagar hoy, si hoy hay cuota. */
  montoDeHoy: number;
};

/**
 * Como va el prestamo respecto al plan.
 *
 * Se compara lo abonado contra lo exigible a la fecha, no cuota por cuota: si
 * alguien abona de mas una semana, esa plata le cubre la siguiente, que es
 * como lo entiende cualquiera que preste.
 */
export function estadoPrestamo(plan: Cuota[], abonado: number, hoy: string): EstadoPrestamo {
  const vencidas = plan.filter((c) => c.day <= hoy).length;
  const exigible = exigibleA(plan, hoy);
  const atraso = Math.max(0, exigible - abonado);

  // Cuantas cuotas cubre lo abonado, en orden.
  let restante = abonado;
  let cuotasPagadas = 0;
  for (const c of plan) {
    if (restante >= c.monto) {
      restante -= c.monto;
      cuotasPagadas += 1;
    } else break;
  }

  const proxima = plan.find((c) => c.n > cuotasPagadas) ?? null;
  const deHoy = plan.find((c) => c.day === hoy) ?? null;

  const valorTipico = plan[0]?.monto ?? 0;
  const cuotasAtrasadas = valorTipico > 0 ? Math.floor(atraso / valorTipico) : 0;

  return {
    vencidas,
    exigible,
    atraso,
    cuotasAtrasadas,
    proxima,
    cuotasPagadas,
    tocaHoy: Boolean(deHoy),
    montoDeHoy: deHoy?.monto ?? 0,
  };
}

/** Lo que hace falta para poder calcular un plan. */
export type DeudaConPrestamo = {
  amount: number;
  installments: number | null;
  frequency: string | null;
  day: string;
};

/** Si esta deuda es un prestamo por cuotas y no un fiado suelto. */
export function esPrestamo(d: DeudaConPrestamo): boolean {
  return Boolean(d.installments && d.installments > 0 && esFrecuencia(d.frequency));
}

/** El plan de una deuda guardada, o vacio si no es un prestamo por cuotas. */
export function planDeDeuda(d: DeudaConPrestamo, opciones: OpcionesPlan = {}): Cuota[] {
  if (!esPrestamo(d)) return [];
  return planDeCuotas({
    total: d.amount,
    cuotas: d.installments as number,
    frecuencia: d.frequency as Frecuencia,
    desde: d.day,
    ...opciones,
  });
}

/**
 * El vencimiento de un prestamo segun como se arma su plan.
 *
 * Al anotar un prestamo se guarda como vencimiento el dia de la ultima cuota.
 * Si despues el plan cambia de forma de contar (sin domingos ni festivos), ese
 * dia guardado queda viejo y la deuda saldria "vencida" con cuotas por
 * delante. Si el guardado es el que puso la aplicacion, vale el del plan de
 * ahora; si el dueño lo cambio a mano ("Plazo"), se respeta el suyo.
 */
export function vencimientoDe(
  d: DeudaConPrestamo & { dueDay: string | null },
  opciones: OpcionesPlan = {}
): string | null {
  if (!opciones.soloDiasDeCobro || !esPrestamo(d)) return d.dueDay;
  const deSiempre = planDeDeuda(d);
  if (d.dueDay && d.dueDay !== deSiempre[deSiempre.length - 1]?.day) return d.dueDay;
  const plan = planDeDeuda(d, opciones);
  return plan[plan.length - 1]?.day ?? d.dueDay;
}

/** Cuantas cuotas cubre lo abonado, en orden, sin contar la que quedo a medias. */
export function cuotasCubiertas(plan: Cuota[], abonado: number): number {
  let restante = abonado;
  let n = 0;
  for (const c of plan) {
    if (restante >= c.monto) {
      restante -= c.monto;
      n += 1;
    } else break;
  }
  return n;
}

export type CobroDelDia = {
  /** Lo que debia de dias ANTERIORES y no ha pagado. */
  atraso: number;
  /** Cuotas de dias anteriores que no ha cubierto completas. */
  cuotasAtrasadas: number;
  /** Lo que le falta de la cuota que cae ese dia. Cero si no cae o ya la cubrio. */
  cuotaDelDia: number;
  /** Lo que hay que cobrarle ese dia: atraso + cuota del dia. */
  aCobrar: number;
  /** La cuota que va a pagar: la primera que no ha cubierto completa. Null si ya pago todo. */
  cuotaN: number | null;
  /** Cuotas cubiertas con lo que ha abonado. */
  cuotasPagadas: number;
  /** La cuota que cae ese dia, si cae alguna. */
  deHoy: Cuota | null;
};

/**
 * Que hay que cobrarle a alguien un dia.
 *
 * A diferencia de estadoPrestamo, la cuota que cae ese mismo dia NO es atraso:
 * el dia todavia no se acaba y el cobrador no ha pasado. Atrasado es lo de los
 * dias anteriores. Asi la lista del dia dice "hoy le toca" a quien le toca hoy
 * y "atrasado" solo a quien de verdad se atraso.
 */
export function cobroDelDia(plan: Cuota[], abonado: number, dia: string): CobroDelDia {
  const exigibleAntes = plan.filter((c) => c.day < dia).reduce((s, c) => s + c.monto, 0);
  const exigibleHasta = exigibleA(plan, dia);
  const atraso = Math.max(0, exigibleAntes - abonado);
  const aCobrar = Math.max(0, exigibleHasta - abonado);
  const cuotasPagadas = cuotasCubiertas(plan, abonado);
  const vencidasAntes = plan.filter((c) => c.day < dia).length;
  const proxima = plan.find((c) => c.n > cuotasPagadas) ?? null;

  return {
    atraso,
    cuotasAtrasadas: Math.max(0, vencidasAntes - cuotasPagadas),
    cuotaDelDia: aCobrar - atraso,
    aCobrar,
    cuotaN: proxima?.n ?? null,
    cuotasPagadas,
    deHoy: plan.find((c) => c.day === dia) ?? null,
  };
}

/**
 * Que cuota o cuotas cubrio un abono, para escribirlo en el recibo.
 *
 * Se cuenta contra lo abonado en total, igual que el resto: lo que sobro de
 * un abono anterior se suma a este.
 *
 * - "Cuota 7 de 20" si completa una sola.
 * - "Cuotas 5 a 7 de 20" si completa varias.
 * - "Abono a la cuota 5 de 20" si no alcanza a completarla.
 */
export function textoCuotasDelAbono(plan: Cuota[], abonadoAntes: number, monto: number): string | null {
  if (plan.length === 0 || monto <= 0) return null;
  const antes = cuotasCubiertas(plan, abonadoAntes);
  const despues = cuotasCubiertas(plan, abonadoAntes + monto);
  const de = " de " + plan.length;
  if (despues <= antes) return "Abono a la cuota " + Math.min(antes + 1, plan.length) + de;
  if (despues === antes + 1) return "Cuota " + despues + de;
  return "Cuotas " + (antes + 1) + " a " + despues + de;
}
