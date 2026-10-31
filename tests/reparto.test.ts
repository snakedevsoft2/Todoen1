import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calcularCuadre,
  categoriaDePago,
  evaluarSuma,
  semaforoDe,
  totalLineaDe,
  vendidaDe,
  type LineaReparto,
} from "../src/lib/reparto";
import type { LibroReparto } from "../src/lib/reparto-excel";
import { claveVendedor, posiblesDuplicados, saldoInicialDeHoja, sugerirVendedor } from "../src/lib/reparto-importar";

/**
 * Reparto de Chopo Snacks: las cuentas tienen que dar exactamente lo mismo que
 * el Excel "2026 VENTAS REPARTO OCTUBRE-NOVIEMBRE". Plata en centavos.
 */
const linea = (l: Partial<LineaReparto>): LineaReparto => ({
  carga: 0,
  devolucion: 0,
  precio: 0,
  unidVendValor: 0,
  dctoPrecio: 0,
  dctoPromocion: 0,
  caducadoCant: 0,
  devolUnidadesValor: 0,
  ...l,
});

/** Una planilla con los totales dados, para probar el cuadre de caja. */
function planilla(ventas: number, credito: number, cartera: number, pagos: number, entregado: number) {
  return calcularCuadre({
    lineas: [linea({ carga: ventas, precio: 1 })],
    otrosDescuentos: 0,
    creditos: credito ? [{ valor: credito }] : [],
    cobros: cartera ? [{ valor: cartera }] : [],
    pagos: pagos ? [{ valor: pagos }] : [],
    entregado,
  });
}

describe("una línea de producto", () => {
  it("CHIFLE SAL LARGO MEDIANO: carga 79, devol 30, a 0,40", () => {
    const l = linea({ carga: 79, devolucion: 30, precio: 40 });
    expect(vendidaDe(l)).toBe(49);
    expect(totalLineaDe(l)).toBe(1960);
  });

  it("PAPA GRANDE NAT de JAVIER el 05-oct: 49 × 0,80 − 4 caducadas × 0,80 = 36,00", () => {
    expect(totalLineaDe(linea({ carga: 125, devolucion: 76, precio: 80, caducadoCant: 4 }))).toBe(3600);
  });

  it("suma lo vendido aparte y resta descuentos y devoluciones valorizadas", () => {
    const l = linea({ carga: 10, devolucion: 2, precio: 100, unidVendValor: 50, dctoPrecio: 20, dctoPromocion: 10, devolUnidadesValor: 30 });
    expect(totalLineaDe(l)).toBe(800 + 50 - 20 - 10 - 30);
  });
});

describe("el cuadre de caja (casos de la sección 8)", () => {
  it("JAVIER 2026-10-05: faltan 1,25", () => {
    const c = planilla(34510, 0, 1220, 7690, 27915);
    expect(c).toMatchObject({ ventasDiaria: 34510, credito: 0, contado: 34510, cartera: 1220, recibido: 35730, pagos: 7690, caja: 28040, entregado: 27915, diferencia: 125, faltante: 125, sobrante: 0 });
    expect(c.semaforo).toBe("faltante");
  });

  it("HENRY 2026-10-05: faltan 0,10 (dentro de la tolerancia)", () => {
    const c = planilla(44580, 7500, 0, 26830, 10240);
    expect(c).toMatchObject({ contado: 37080, recibido: 37080, caja: 10250, diferencia: 10, faltante: 10 });
    expect(c.semaforo).toBe("faltante");
  });

  it("JIMMY 2026-10-08: sobran 0,15", () => {
    const c = planilla(81060, 53210, 5310, 3485, 29690);
    expect(c).toMatchObject({ contado: 27850, recibido: 33160, caja: 29675, diferencia: -15, faltante: 0, sobrante: -15 });
    expect(c.semaforo).toBe("sobrante");
  });

  it("otros descuentos bajan la venta del día", () => {
    const c = calcularCuadre({ lineas: [linea({ carga: 10, precio: 100 })], otrosDescuentos: 150, creditos: [], cobros: [], pagos: [], entregado: 850 });
    expect(c.ventasDiaria).toBe(850);
    expect(c.diferencia).toBe(0);
  });

  it("semáforo: hasta cinco centavos cuadra", () => {
    expect(semaforoDe(5)).toBe("cuadra");
    expect(semaforoDe(-5)).toBe("cuadra");
    expect(semaforoDe(6)).toBe("faltante");
    expect(semaforoDe(-6)).toBe("sobrante");
  });
});

// Trae datos reales de clientes: si no esta en esta copia del repositorio, se salta.
const SEED = "prisma/datos/reparto-octubre-2026.json";

describe.skipIf(!existsSync(SEED))("el Excel de octubre completo (" + SEED + ")", () => {
  const libro: LibroReparto = existsSync(SEED) ? JSON.parse(readFileSync(SEED, "utf8")) : { planillas: [], atrasadas: [], avisos: [] };

  it("trae las 43 planillas y las 1.053 líneas con movimiento", () => {
    expect(libro.planillas).toHaveLength(43);
    expect(libro.planillas.reduce((s, p) => s + p.lineas.length, 0)).toBe(1053);
  });

  it("cada planilla da al centavo lo que dice el Excel, línea por línea", () => {
    for (const p of libro.planillas) {
      for (const l of p.lineas) expect(totalLineaDe(l), p.ref + " " + l.producto).toBe(l.totalExcel);
      const c = calcularCuadre(p);
      expect({ ref: p.ref, ventas: c.ventasDiaria, credito: c.credito, contado: c.contado, cartera: c.cartera, recibido: c.recibido, pagos: c.pagos, caja: c.caja, dif: c.diferencia }).toEqual({
        ref: p.ref,
        ventas: p.esperado.ventas,
        credito: p.esperado.credito,
        contado: p.esperado.contado,
        cartera: p.esperado.cartera,
        recibido: p.esperado.recibido,
        pagos: p.esperado.pagos,
        caja: p.esperado.caja,
        dif: p.esperado.diferencia,
      });
    }
  });

  it("los totales del mes dan lo de la tabla de la sección 8", () => {
    const mes = (hoja: string) => {
      const ps = libro.planillas.filter((p) => p.hoja === hoja).map((p) => calcularCuadre(p));
      const t = (k: "ventasDiaria" | "credito" | "contado" | "cartera" | "pagos" | "entregado" | "diferencia") => ps.reduce((s, c) => s + c[k], 0);
      return { dias: ps.length, ventas: t("ventasDiaria"), credito: t("credito"), contado: t("contado"), cartera: t("cartera"), pagos: t("pagos"), entregado: t("entregado"), neto: t("diferencia") };
    };
    expect(mes("JAVIER")).toEqual({ dias: 14, ventas: 525845, credito: 80500, contado: 445345, cartera: 51420, pagos: 123776, entregado: 380759, neto: -7770 });
    expect(mes("HENRY")).toEqual({ dias: 14, ventas: 523475, credito: 78325, contado: 445150, cartera: 31280, pagos: 184407, entregado: 288113, neto: 3910 });
    expect(mes("JIMMY")).toEqual({ dias: 14, ventas: 629580, credito: 130100, contado: 499480, cartera: 35155, pagos: 159122, entregado: 374954, neto: 559 });
  });

  it("la planilla de SÁBADO va con su fecha real, 3 de octubre", () => {
    const sabado = libro.planillas.find((p) => p.hoja.startsWith("S"));
    expect(sabado?.fecha).toBe("2026-10-03");
    expect(sabado?.ref).toBe("SÁBADO#2026-07-02");
  });

  it("el saldo inicial devuelve el cobro del primer día (MARIANA AYALA: 24 + 12,20 = 36,20)", () => {
    const primera = libro.planillas.find((p) => p.ref === "JAVIER#2026-10-05")!;
    const mariana = saldoInicialDeHoja(primera).find((d) => d.cliente === "MARIANA AYALA");
    expect(mariana?.valor).toBe(3620);
  });
});

describe("al importar", () => {
  const equipo = [
    { id: "1", name: "Javier" },
    { id: "2", name: "Henry" },
    { id: "3", name: "Jimmy" },
    { id: "4", name: "LUIS ANDRIMBA" },
    { id: "5", name: "Juliana Intriago" },
  ];

  it("cada hoja es su vendedor; la de SÁBADO es de quien dice el bloque", () => {
    expect(claveVendedor({ hoja: "JIMMY", etiqueta: "jimy" })).toBe("JIMMY");
    expect(claveVendedor({ hoja: "SÁBADO", etiqueta: "LUIS" })).toBe("LUIS");
    expect(sugerirVendedor("JIMMY", equipo)).toBe("3");
    expect(sugerirVendedor("JIMY", equipo)).toBe("3");
    expect(sugerirVendedor("LUIS", equipo)).toBe("4");
    expect(sugerirVendedor("PEDRO", equipo)).toBeNull();
  });

  it("muestra los clientes parecidos sin juntarlos", () => {
    const pares = posiblesDuplicados(["BARBERÍA MOSTACHE", "BARBERIA MOSTACH", "VIVERE3S ELIZABETH GUERRA", "ELIZABETH GUERRA", "ROSADEX"]);
    expect(pares).toContainEqual(["BARBERÍA MOSTACHE", "BARBERIA MOSTACH"]);
    expect(pares).toContainEqual(["VIVERE3S ELIZABETH GUERRA", "ELIZABETH GUERRA"]);
    expect(pares.flat()).not.toContain("ROSADEX");
  });
});

describe("lo que se escribe a mano", () => {
  it("sumas como en el Excel", () => {
    expect(evaluarSuma("105+55")).toBe(160);
    expect(evaluarSuma("40+19-20")).toBe(39);
    expect(evaluarSuma("33.15+246")).toBe(279.15);
    expect(evaluarSuma("7.62+320+0.25")).toBe(327.87);
    expect(evaluarSuma("405-250+10")).toBe(165);
    expect(evaluarSuma("12")).toBe(12);
    expect(evaluarSuma("")).toBe(0);
    expect(evaluarSuma("10*2")).toBeNaN();
  });

  it("la categoría de un gasto por su concepto", () => {
    const equipo = ["Javier", "Henry", "LUIS ANDRIMBA"];
    expect(categoriaDePago("ALMUERZO")).toBe("almuerzo");
    expect(categoriaDePago("TRAS. ESCUELA ENMA")).toBe("transporte");
    expect(categoriaDePago("TRANS. MARKETSVAN")).toBe("transporte");
    expect(categoriaDePago("DEPOSITO")).toBe("deposito");
    expect(categoriaDePago("PARQUEO")).toBe("parqueo");
    expect(categoriaDePago("GASOLINA")).toBe("combustible");
    expect(categoriaDePago("DIFRE")).toBe("diferencia");
    expect(categoriaDePago("LUIS 450", equipo)).toBe("entrega_persona");
    expect(categoriaDePago("HENRY", equipo)).toBe("entrega_persona");
    expect(categoriaDePago("FUNDAS")).toBe("otro");
  });
});
