import { existsSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  calcularCuadre,
  categoriaDePago,
  claveDocumento,
  creditoDelCobro,
  evaluarSuma,
  semaforoDe,
  totalLineaDe,
  vendidaDe,
  type LineaReparto,
} from "../src/lib/reparto";
import type { LibroReparto, LineaExcel, MovimientoExcel, PlanillaExcel } from "../src/lib/reparto-excel";
import {
  claveVendedor,
  importarReparto,
  juntarLineas,
  posiblesDuplicados,
  saldoInicialDeHoja,
  sugerirVendedor,
} from "../src/lib/reparto-importar";
import { carteraDe, porQueNoSeAnula } from "../src/lib/reparto-datos";

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

describe("a qué documento va un cobro", () => {
  it("S/N, s/n, SN y s.n. son «sin documento», en la pantalla y en el importador", () => {
    for (const sn of ["S/N", "s/n", "SN", "s.n.", " sn "]) expect(claveDocumento(sn), sn).toBe("");
    expect(claveDocumento("1131")).toBe("1131");
    expect(claveDocumento(null)).toBe("");
  });

  it("un cobro «s/n» va al único documento que debe el cliente", () => {
    const debe = [{ id: "a", documento: "1131", saldo: 1000 }];
    expect(creditoDelCobro(debe, { documento: "s/n" })?.id).toBe("a");
    expect(creditoDelCobro(debe, { documento: "S/N" })?.id).toBe("a");
    expect(creditoDelCobro(debe, { documento: "1131" })?.id).toBe("a");
    expect(creditoDelCobro(debe, { documento: "999" })).toBeNull();
  });

  it("si debe dos, un cobro sin documento queda para revisar", () => {
    const debe = [
      { id: "a", documento: "1131", saldo: 1000 },
      { id: "b", documento: "1140", saldo: 500 },
    ];
    expect(creditoDelCobro(debe, { documento: "s/n" })).toBeNull();
    expect(creditoDelCobro(debe, { documento: "s/n", creditoId: "b" })?.id).toBe("b");
  });
});

const lineaExcel = (producto: string, l: Partial<LineaExcel>): LineaExcel => ({
  producto,
  carga: 0,
  cargaDetalle: null,
  devolucion: 0,
  precio: 0,
  base12: 0,
  iva: 0,
  unidVendCant: 0,
  unidVendValor: 0,
  docDescuento: null,
  dctoPrecio: 0,
  dctoPromocion: 0,
  caducadoCant: 0,
  devolUnidadesValor: 0,
  totalExcel: 0,
  ...l,
});

describe("un producto dos veces en el mismo bloque", () => {
  it("al mismo precio se junta todo, descuentos incluidos, y da lo mismo", () => {
    const a = lineaExcel("PAPA GRANDE", { carga: 40, devolucion: 10, precio: 80, dctoPrecio: 100 });
    const b = lineaExcel("papa grande", { carga: 30, precio: 80, dctoPromocion: 50, unidVendValor: 25, cargaDetalle: "20+10" });
    const r = juntarLineas([a, b]);
    expect(r.conflictos).toEqual([]);
    expect(r.repetidos).toEqual(["papa grande"]);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ carga: 70, cargaDetalle: "40+20+10", dctoPrecio: 100, dctoPromocion: 50, unidVendValor: 25 });
    expect(totalLineaDe(r.lineas[0])).toBe(totalLineaDe(a) + totalLineaDe(b));
  });

  it("a precios distintos no hay una línea que dé lo mismo: se pide corregir el Excel", () => {
    const r = juntarLineas([lineaExcel("PAPA GRANDE", { carga: 10, precio: 80 }), lineaExcel("PAPA GRANDE", { carga: 10, precio: 75 })]);
    expect(r.conflictos).toEqual(["PAPA GRANDE"]);
  });
});

describe("importar y la cartera, en la base", () => {
  const db = new PrismaClient();
  const S = "reparto-" + Date.now();

  afterAll(async () => {
    await db.user.deleteMany({ where: { slug: { contains: S } } });
    await db.$disconnect();
  });

  async function cuentaChopo(n: string) {
    const u = await db.user.create({
      data: {
        email: n + "-" + S + "@test.local",
        passwordHash: "x",
        ownerName: "Juliana Intriago",
        businessName: "Chopo Snacks",
        businessType: "OTRO",
        slug: n + "-" + S,
        timezone: "America/Guayaquil",
        staff: { create: [{ name: "Juliana Intriago", role: "DUENO" }, { name: "Javier", role: "VENDEDOR", username: "javier." + n + "." + S }] },
      },
      include: { staff: true },
    });
    return { userId: u.id, javier: u.staff.find((s) => s.name === "Javier")!.id };
  }

  const mov = (cliente: string | null, documento: string | null, valor: number): MovimientoExcel => ({ fecha: null, documento, cliente, valor, factura: null });
  const cobro = (cliente: string, documento: string, valor: number) => ({ ...mov(cliente, documento, valor), tipo: "COBRO" as const });

  /** Un dia de JAVIER, con lo que el Excel diria que da. */
  function bloque(fecha: string, datos: Partial<Omit<PlanillaExcel, "esperado">>): PlanillaExcel {
    const p = {
      hoja: "JAVIER",
      ref: "JAVIER#" + fecha,
      fecha,
      etiqueta: "JAVIER",
      acompanante: null,
      otrosDescuentos: 0,
      entregado: 0,
      entregadoDetalle: null,
      lineas: [lineaExcel("PAPA GRANDE NAT", { carga: 20, precio: 80 })],
      creditos: [],
      cobros: [],
      pagos: [],
      cartera: [],
      ...datos,
    };
    const c = calcularCuadre(p);
    return {
      ...p,
      esperado: { ventas: c.ventasDiaria, credito: c.credito, contado: c.contado, cartera: c.cartera, recibido: c.recibido, pagos: c.pagos, caja: c.caja, entregado: c.entregado, diferencia: c.diferencia },
    };
  }

  const importar = (cuenta: { userId: string; javier: string }, planillas: PlanillaExcel[], aplicar = true) =>
    importarReparto(db, { userId: cuenta.userId, libro: { planillas, atrasadas: [], avisos: [] }, catalogo: [], vendedores: { JAVIER: cuenta.javier }, aplicar });

  const rosaDe = async (userId: string) => (await carteraDe(userId, "2026-11-30")).find((c) => c.name === "TIENDA ROSA")!;

  const credito1131 = bloque("2026-10-05", { creditos: [mov("TIENDA ROSA", "1131", 1000)] });
  const cobro1131 = bloque("2026-10-06", { cobros: [cobro("TIENDA ROSA", "1131", 400)] });

  it("reimportar el libro con más días: el cobro va al documento que se importó antes", async () => {
    const cuenta = await cuentaChopo("reimp");
    expect((await importar(cuenta, [credito1131])).aplicado).toBe(true);

    const r = await importar(cuenta, [credito1131, cobro1131]);
    expect(r.planillas.map((p) => p.accion)).toEqual(["ya-estaba", "crear"]);
    expect(r.cobrosSinDocumento).toBe(0);
    const guardado = await db.repartoCobro.findFirstOrThrow({ where: { userId: cuenta.userId } });
    expect(guardado.revisar).toBe(false);
    expect(guardado.creditoId).not.toBeNull();
    const rosa = await rosaDe(cuenta.userId);
    expect(rosa.saldo).toBe(600);
    expect(rosa.abonosSinDocumento).toBe(0);
    expect(rosa.documentos.map((d) => d.saldo)).toEqual([600]);

    // El libro del mes siguiente trae en su primer dia lo que se debe: ya esta
    // en la app y no se vuelve a cargar como saldo inicial.
    const noviembre = bloque("2026-11-02", { cartera: [mov("TIENDA ROSA", "1131", 500)], cobros: [cobro("TIENDA ROSA", "1131", 100)] });
    const ensayo = await importar(cuenta, [noviembre], false);
    expect(ensayo.saldosIniciales).toBe(0);
    expect(ensayo.avisos.some((a) => a.includes("ya está en la app"))).toBe(true);
    expect(ensayo.carteraDistinta).toEqual([]);
    expect((await importar(cuenta, [noviembre])).aplicado).toBe(true);
    const despues = await rosaDe(cuenta.userId);
    expect(despues.saldo).toBe(500);
    expect(despues.documentos).toHaveLength(1);
  });

  it("el ensayo ya dice que un crédito no tiene cliente (antes fallaba al importar)", async () => {
    const cuenta = await cuentaChopo("sincli");
    const r = await importar(cuenta, [bloque("2026-10-05", { creditos: [mov(null, "77", 1250)] })], false);
    expect(r.errores).toContain("JAVIER#2026-10-05: un crédito de 12.5 no dice de qué cliente es.");
  });

  it("no se anula una planilla cuyo crédito ya se cobró en otra; y si ya pasó, el cobro no desaparece", async () => {
    const cuenta = await cuentaChopo("anular");
    await importar(cuenta, [credito1131, cobro1131]);
    const [dia1, dia2] = await db.repartoPlanilla.findMany({ where: { userId: cuenta.userId }, orderBy: { day: "asc" } });
    expect(await porQueNoSeAnula(cuenta.userId, dia1.id)).toBe(
      "No se puede anular: el crédito 1131 de TIENDA ROSA ya se cobró en la planilla de Javier del 06/10/2026. Quita o corrige ese cobro primero."
    );
    expect(await porQueNoSeAnula(cuenta.userId, dia2.id)).toBeNull();

    // Una anulada de antes de este control: los 4,00 cobrados siguen en la cartera.
    await db.repartoPlanilla.update({ where: { id: dia1.id }, data: { estado: "ANULADA" } });
    const rosa = await rosaDe(cuenta.userId);
    expect(rosa.documentos).toEqual([]);
    expect(rosa.abonosSinDocumento).toBe(400);
    expect(rosa.saldo).toBe(-400);
  });

  it("la cartera trae la nota del cliente, para no borrarla al editarlo", async () => {
    const cuenta = await cuentaChopo("nota");
    await importar(cuenta, [credito1131]);
    await db.repartoCliente.updateMany({ where: { userId: cuenta.userId, nameKey: "tienda rosa" }, data: { notes: "cobrar solo los viernes" } });
    expect((await rosaDe(cuenta.userId)).notes).toBe("cobrar solo los viernes");
  });
});
