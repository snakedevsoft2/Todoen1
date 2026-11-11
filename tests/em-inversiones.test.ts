import { describe, expect, it } from "vitest";
import {
  anteriorDiaDeCobro,
  esDiaDeCobro,
  festivoDe,
  festivosColombia,
  pascua,
  porQueNoSeCobra,
  siguienteDiaDeCobro,
} from "../src/lib/festivos";
import {
  cobroDelDia,
  cuotasCubiertas,
  estadoPrestamo,
  planDeCuotas,
  planDeDeuda,
  textoCuotasDelAbono,
  vencimientoDe,
} from "../src/lib/prestamos";
import { esEmInversiones, opcionesPlanDe } from "../src/lib/em-inversiones";
import {
  filasDeCobro,
  planillaHoja,
  planillaTexto,
  planillaTirilla,
  recibosDeCobro,
  recibosDeCobroHoja,
  type DeudaParaCobro,
} from "../src/lib/cobro-dia";
import { receiptTirilla, type ReceiptData } from "../src/lib/receipt";
import { tirillaEscPos } from "../src/lib/escpos";
import { tirillaHtml, type Linea } from "../src/lib/tirilla";

/**
 * Lo que pidio EM Inversiones el 10 nov 2026 (ver lib/em-inversiones.ts):
 * domingos y festivos sin cobro, el cobro del dia con todos los recibos y la
 * planilla, recibos cortos con la cuota, y renovar.
 */

const SIN_DOMINGOS = { soloDiasDeCobro: true, pais: "CO" } as const;

describe("la cuenta de EM Inversiones", () => {
  it("se reconoce con o sin espacio, en mayusculas o no", () => {
    expect(esEmInversiones("EM INVERSIONES")).toBe(true);
    expect(esEmInversiones("Em Inversiones")).toBe(true);
    expect(esEmInversiones("eminversiones")).toBe(true);
    expect(esEmInversiones("EM-Inversiones")).toBe(true);
  });

  it("ningun otro negocio cambia", () => {
    expect(esEmInversiones("Chopo Snacks")).toBe(false);
    expect(esEmInversiones("Inversiones")).toBe(false);
    expect(esEmInversiones("TEM Inversiones")).toBe(false);
    expect(opcionesPlanDe({ businessName: "Prestamos Ana", country: "CO" })).toEqual({});
    expect(opcionesPlanDe({ businessName: "EM INVERSIONES", country: "CO" })).toEqual(SIN_DOMINGOS);
  });
});

describe("festivos de Colombia", () => {
  it("la Pascua sale bien", () => {
    expect(pascua(2025)).toBe("2025-04-20");
    expect(pascua(2026)).toBe("2026-04-05");
    expect(pascua(2027)).toBe("2027-03-28");
  });

  it("los 18 de 2026, con los corridos al lunes", () => {
    expect([...festivosColombia(2026).keys()].sort()).toEqual([
      "2026-01-01",
      "2026-01-12", // Reyes (6 ene, martes) -> lunes
      "2026-03-23", // San Jose (19 mar, jueves) -> lunes
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-05-18", // Ascension
      "2026-06-08", // Corpus
      "2026-06-15", // Sagrado Corazon
      "2026-06-29", // San Pedro, ya es lunes
      "2026-07-20",
      "2026-08-07",
      "2026-08-17", // Asuncion (15 ago, sabado) -> lunes
      "2026-10-12",
      "2026-11-02", // Todos los Santos (1 nov, domingo) -> lunes
      "2026-11-16", // Cartagena (11 nov, miercoles) -> lunes
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("dice por que no se cobra", () => {
    expect(porQueNoSeCobra("2026-11-15")).toBe("Domingo");
    expect(porQueNoSeCobra("2026-11-16")).toBe("Festivo: Independencia de Cartagena");
    expect(porQueNoSeCobra("2026-11-14")).toBeNull(); // sabado si se trabaja
    expect(esDiaDeCobro("2026-11-17")).toBe(true);
  });

  it("salta al siguiente y al anterior dia de cobro", () => {
    expect(siguienteDiaDeCobro("2026-11-15")).toBe("2026-11-17");
    expect(siguienteDiaDeCobro("2026-11-17")).toBe("2026-11-17");
    expect(anteriorDiaDeCobro("2026-11-17")).toBe("2026-11-14");
    // Jueves y viernes santo seguidos: el sabado si se cobra.
    expect(siguienteDiaDeCobro("2026-04-02")).toBe("2026-04-04");
  });

  it("fuera de Colombia solo se salta el domingo", () => {
    expect(festivoDe("2026-11-16", "EC")).toBeNull();
    expect(esDiaDeCobro("2026-11-16", "EC")).toBe(true);
    expect(esDiaDeCobro("2026-11-15", "EC")).toBe(false);
  });
});

describe("plan sin domingos ni festivos", () => {
  it("la cuota diaria cae solo en dias de cobro", () => {
    // Prestado el viernes 13 nov: sabado 14, (dom 15 y festivo 16 no), martes 17...
    const plan = planDeCuotas({ total: 100000, cuotas: 4, frecuencia: "DIARIA", desde: "2026-11-13", ...SIN_DOMINGOS });
    expect(plan.map((c) => c.day)).toEqual(["2026-11-14", "2026-11-17", "2026-11-18", "2026-11-19"]);
  });

  it("veinte cuotas diarias nunca caen en domingo ni festivo y suman el total", () => {
    const plan = planDeCuotas({ total: 600000, cuotas: 20, frecuencia: "DIARIA", desde: "2026-11-10", ...SIN_DOMINGOS });
    expect(plan).toHaveLength(20);
    expect(plan.every((c) => esDiaDeCobro(c.day))).toBe(true);
    expect(plan.reduce((s, c) => s + c.monto, 0)).toBe(600000);
  });

  it("la semanal que cae en festivo se corre un dia, sin correr las demas", () => {
    const plan = planDeCuotas({ total: 300000, cuotas: 3, frecuencia: "SEMANAL", desde: "2026-11-09", ...SIN_DOMINGOS });
    expect(plan.map((c) => c.day)).toEqual(["2026-11-17", "2026-11-23", "2026-11-30"]);
  });

  it("sin la opcion el plan sigue igual que siempre", () => {
    const plan = planDeCuotas({ total: 100000, cuotas: 4, frecuencia: "DIARIA", desde: "2026-11-13" });
    expect(plan.map((c) => c.day)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
  });

  it("el cliente diario no queda atrasado el lunes por el domingo", () => {
    // Pago todo hasta el sabado 14. El domingo y el festivo no le cuentan.
    const plan = planDeCuotas({ total: 200000, cuotas: 20, frecuencia: "DIARIA", desde: "2026-11-10", ...SIN_DOMINGOS });
    const pagadoHastaSabado = plan.filter((c) => c.day <= "2026-11-14").reduce((s, c) => s + c.monto, 0);
    expect(estadoPrestamo(plan, pagadoHastaSabado, "2026-11-16").atraso).toBe(0);
    // Con el plan de siempre, si quedaba atrasado dos cuotas.
    const deSiempre = planDeCuotas({ total: 200000, cuotas: 20, frecuencia: "DIARIA", desde: "2026-11-10" });
    expect(estadoPrestamo(deSiempre, pagadoHastaSabado, "2026-11-16").cuotasAtrasadas).toBe(2);
  });
});

describe("el vencimiento", () => {
  const deuda = { amount: 100000, installments: 4, frequency: "DIARIA", day: "2026-11-13" };

  it("el que puso la aplicacion se corre con el plan nuevo", () => {
    expect(vencimientoDe({ ...deuda, dueDay: "2026-11-17" }, SIN_DOMINGOS)).toBe("2026-11-19");
  });

  it("el que el dueño cambio a mano se respeta", () => {
    expect(vencimientoDe({ ...deuda, dueDay: "2026-12-01" }, SIN_DOMINGOS)).toBe("2026-12-01");
  });

  it("para los demas negocios es el guardado", () => {
    expect(vencimientoDe({ ...deuda, dueDay: "2026-11-17" })).toBe("2026-11-17");
  });
});

describe("el cobro del dia", () => {
  // 10 cuotas diarias de 10.000 desde el martes 10 nov: mie 11, jue 12, vie 13, sab 14, mar 17...
  const plan = planDeCuotas({ total: 100000, cuotas: 10, frecuencia: "DIARIA", desde: "2026-11-10", ...SIN_DOMINGOS });

  it("la cuota de hoy no es atraso", () => {
    const c = cobroDelDia(plan, 0, "2026-11-11");
    expect(c.atraso).toBe(0);
    expect(c.cuotaDelDia).toBe(10000);
    expect(c.aCobrar).toBe(10000);
    expect(c.cuotaN).toBe(1);
  });

  it("lo de dias anteriores si, y se cobra junto con la de hoy", () => {
    const c = cobroDelDia(plan, 10000, "2026-11-13");
    expect(c.atraso).toBe(10000);
    expect(c.cuotasAtrasadas).toBe(1);
    expect(c.aCobrar).toBe(20000);
    expect(c.cuotaN).toBe(2);
  });

  it("quien ya pago la de hoy no tiene nada que cobrarle", () => {
    expect(cobroDelDia(plan, 10000, "2026-11-11").aCobrar).toBe(0);
  });

  it("el abono a medias deja la cuota atrasada entera en la cuenta", () => {
    const c = cobroDelDia(plan, 15000, "2026-11-13");
    expect(c.atraso).toBe(5000);
    expect(c.cuotasAtrasadas).toBe(1);
    expect(c.aCobrar).toBe(15000);
  });
});

describe("que cuota pago un abono", () => {
  const plan = planDeCuotas({ total: 200000, cuotas: 20, frecuencia: "DIARIA", desde: "2026-11-10" });

  it("una, varias o a medias", () => {
    expect(textoCuotasDelAbono(plan, 60000, 10000)).toBe("Cuota 7 de 20");
    expect(textoCuotasDelAbono(plan, 40000, 30000)).toBe("Cuotas 5 a 7 de 20");
    expect(textoCuotasDelAbono(plan, 40000, 5000)).toBe("Abono a la cuota 5 de 20");
    // Lo que sobro antes completa esta.
    expect(textoCuotasDelAbono(plan, 45000, 5000)).toBe("Cuota 5 de 20");
    expect(cuotasCubiertas(plan, 70000)).toBe(7);
  });
});

describe("recibos y planilla del dia", () => {
  const base: Omit<DeudaParaCobro, "id" | "clientName" | "payments"> = {
    clientPhone: "3001234567",
    clientAddress: "Calle 1 #2-3",
    amount: 100000,
    day: "2026-11-10",
    installments: 10,
    frequency: "DIARIA",
    status: "PENDIENTE",
    receiptSeq: 12,
  };
  const deudas: DeudaParaCobro[] = [
    { ...base, id: "a", clientName: "Zoila Pérez", payments: [] },
    { ...base, id: "b", clientName: "Ana Ruiz", payments: [{ amount: 10000 }] },
    { ...base, id: "c", clientName: "Ya Pagó", payments: [{ amount: 30000 }] },
    { ...base, id: "d", clientName: "Fiado suelto", installments: null, frequency: null, payments: [] },
    { ...base, id: "e", clientName: "Pagado", status: "PAGADA", payments: [{ amount: 100000 }] },
  ];
  const negocio = { businessName: "EM INVERSIONES", businessPhone: "3226483731", currency: "COP" };
  // Jueves 12: Zoila debe 1 de atras + la de hoy; Ana solo la de hoy.
  const filas = filasDeCobro(deudas, "2026-11-12", SIN_DOMINGOS);

  it("solo quien tiene que pagar ese dia, por nombre", () => {
    expect(filas.map((f) => f.clientName)).toEqual(["Ana Ruiz", "Zoila Pérez"]);
    expect(filas[1]).toMatchObject({ cuotaN: 1, totalCuotas: 10, atraso: 10000, aCobrar: 20000, prestamoNo: "0012" });
    expect(filas[0]).toMatchObject({ cuotaN: 2, atraso: 0, aCobrar: 10000, saldo: 90000 });
  });

  it("los recibos van todos seguidos, con la cuota, separados por un corte", () => {
    const lineas = recibosDeCobro(filas, negocio, "2026-11-12");
    expect(lineas.filter((l) => l.t === "corte")).toHaveLength(1);
    const textos = JSON.stringify(lineas);
    expect(textos).toContain("2 de 10");
    expect(textos).toContain("Atrasado (1 cuota)");
    expect(textos).toContain("Queda debiendo");
  });

  it("en hoja normal, un recuadro por recibo", () => {
    const html = recibosDeCobroHoja(filas, negocio, "2026-11-12");
    expect(html.match(/class="ti-celda"/g)).toHaveLength(2);
  });

  it("la planilla lleva a todos y el total", () => {
    const html = planillaHoja(filas, negocio, "2026-11-12");
    expect(html).toContain("Zoila Pérez");
    expect(html).toContain("Total a cobrar");
    expect(html.match(/<tr>/g)).toHaveLength(4); // encabezado, dos clientes, total
    const texto = planillaTexto(filas, negocio, "2026-11-12");
    expect(texto).toContain("Cuota 1/10 · atrasado 1 cuota");
    expect(texto).toContain("Total a cobrar");
    expect(planillaTirilla(filas, negocio, "2026-11-12").some((l) => l.t === "total")).toBe(true);
  });

  it("el domingo nadie tiene cuota", () => {
    const plan = planDeDeuda(deudas[1], SIN_DOMINGOS);
    expect(plan.some((c) => c.day === "2026-11-15")).toBe(false);
  });
});

describe("el corte entre recibos", () => {
  const lineas: Linea[] = [{ t: "titulo", text: "Uno" }, { t: "corte" }, { t: "titulo", text: "Dos" }];

  it("la termica directa corta en medio, ademas del corte final", () => {
    const bytes = Array.from(tirillaEscPos(lineas, 58));
    const cortes = bytes.filter((b, i) => b === 0x1d && bytes[i + 1] === 0x56).length;
    expect(cortes).toBe(2);
  });

  it("por el dialogo deja una raya para recortar", () => {
    expect(tirillaHtml(lineas, "58")).toContain('class="ti-corte"');
  });
});

describe("recibo de abono corto", () => {
  const data: ReceiptData = {
    paymentId: "x",
    receiptSeq: 7,
    businessName: "EM INVERSIONES",
    businessPhone: "3226483731",
    businessAddress: "Calle larga 123",
    logoUrl: null,
    currency: "COP",
    clientName: "Ana Ruiz",
    concept: "Préstamo",
    day: "2026-11-12",
    method: "EFECTIVO",
    amount: 10000,
    total: 100000,
    saldo: 80000,
    historial: [{ day: "2026-11-11", amount: 10000 }],
    corto: true,
    cuota: "Cuota 2 de 10",
    pagadas: "2 de 10",
    proxima: "13/11/2026 · $ 10.000",
  };

  it("dice la cuota y no trae la lista de abonos anteriores", () => {
    const texto = JSON.stringify(receiptTirilla(data));
    expect(texto).toContain("Cuota 2 de 10");
    expect(texto).toContain("Cuotas pagadas");
    expect(texto).not.toContain("Abonos anteriores");
    expect(texto).not.toContain("Calle larga");
  });

  it("es mas corto que el de siempre", () => {
    expect(receiptTirilla(data).length).toBeLessThan(receiptTirilla({ ...data, corto: false }).length);
  });
});
