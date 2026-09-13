/**
 * Convertir marcajes en horas trabajadas.
 *
 * Archivo puro: lo usan la planilla en pantalla y la planilla en PDF, y tienen
 * que dar exactamente el mismo numero o la persona discute con el papel en la
 * mano.
 *
 * Los marcajes de la vida real no vienen perfectos: alguien olvida marcar la
 * salida, marca entrada dos veces, o marca una salida sin haber marcado
 * entrada. Nada de eso suma horas inventadas. Solo cuenta lo que tiene
 * entrada y salida, y lo que queda raro sale senalado para que se revise.
 */

export type MarcaSimple = {
  kind: "ENTRADA" | "SALIDA";
  markedAt: Date;
  voidedAt: Date | null;
};

export type Tramo = {
  entrada: Date | null;
  salida: Date | null;
  /** Lo trabajado en ese tramo. Cero si le falta la entrada o la salida. */
  ms: number;
  /** Tiene entrada y todavia no salida. */
  abierto: boolean;
  /** Algo no cuadra: salida sin entrada, o una entrada que nunca cerro. */
  raro: boolean;
};

/**
 * Los tramos de trabajo de una persona, en orden.
 *
 * `ahora` sirve para la jornada de hoy: una entrada sin salida cuenta hasta
 * este momento, porque es lo que lleva trabajado. Para dias pasados se deja
 * en null y esa entrada queda en cero y senalada: nadie trabaja 30 horas
 * seguidas porque olvido marcar la salida.
 */
export function tramosDe(
  marcas: MarcaSimple[],
  ahora: Date | null = null
): { tramos: Tramo[]; totalMs: number } {
  const vigentes = marcas
    .filter((m) => !m.voidedAt)
    .sort((a, b) => a.markedAt.getTime() - b.markedAt.getTime());

  const tramos: Tramo[] = [];
  let abierta: Date | null = null;

  for (const m of vigentes) {
    if (m.kind === "ENTRADA") {
      // Dos entradas seguidas: la primera nunca cerro. No se le inventa salida.
      if (abierta) tramos.push({ entrada: abierta, salida: null, ms: 0, abierto: false, raro: true });
      abierta = m.markedAt;
    } else if (abierta) {
      tramos.push({
        entrada: abierta,
        salida: m.markedAt,
        ms: Math.max(0, m.markedAt.getTime() - abierta.getTime()),
        abierto: false,
        raro: false,
      });
      abierta = null;
    } else {
      tramos.push({ entrada: null, salida: m.markedAt, ms: 0, abierto: false, raro: true });
    }
  }

  if (abierta) {
    const enCurso = ahora && ahora.getTime() >= abierta.getTime();
    tramos.push({
      entrada: abierta,
      salida: null,
      ms: enCurso ? ahora.getTime() - abierta.getTime() : 0,
      abierto: true,
      raro: !enCurso,
    });
  }

  return { tramos, totalMs: tramos.reduce((s, t) => s + t.ms, 0) };
}

/** "8 h 30 min", "45 min". */
export function duracionTexto(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  if (h === 0) return min + " min";
  return min % 60 === 0 ? h + " h" : h + " h " + (min % 60) + " min";
}
