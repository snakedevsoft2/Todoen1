/**
 * Lo que cambia de un pais a otro en la factura autorizada.
 *
 * Los codigos salen de las tablas oficiales: la DIAN (a traves de Factus) y la
 * ficha tecnica de comprobantes electronicos del SRI, tabla 6 (tipos de
 * identificacion) y tabla 17 (tarifas del IVA).
 *
 * Aqui no hay nada del servidor: lo usa tambien el formulario del telefono.
 */

export type Pais = "CO" | "EC";

export const PAISES: { value: Pais; label: string; entidad: string; proveedor: string; moneda: string }[] = [
  { value: "CO", label: "Colombia", entidad: "DIAN", proveedor: "Factus", moneda: "COP" },
  { value: "EC", label: "Ecuador", entidad: "SRI", proveedor: "Dátil", moneda: "USD" },
];

export function esPais(v: unknown): v is Pais {
  return v === "CO" || v === "EC";
}

export function datosPais(p: Pais) {
  return PAISES.find((x) => x.value === p)!;
}

/** Los documentos que se le piden al comprador, en el orden en que mas se usan. */
export const DOCUMENTOS: Record<Pais, { value: string; label: string }[]> = {
  CO: [
    { value: "13", label: "Cédula de ciudadanía" },
    { value: "31", label: "NIT" },
    { value: "22", label: "Cédula de extranjería" },
    { value: "41", label: "Pasaporte" },
    { value: "48", label: "PPT" },
    { value: "42", label: "Documento extranjero" },
  ],
  EC: [
    { value: "05", label: "Cédula" },
    { value: "04", label: "RUC" },
    { value: "06", label: "Pasaporte" },
    { value: "08", label: "Identificación del exterior" },
  ],
};

/** Las tarifas que se pueden elegir, con el codigo que pide cada entidad. */
export const TARIFAS: Record<Pais, { value: string; label: string; codigo: string; tarifa: number }[]> = {
  CO: [
    { value: "01-19", label: "IVA 19%", codigo: "01", tarifa: 19 },
    { value: "01-5", label: "IVA 5%", codigo: "01", tarifa: 5 },
    { value: "01-0", label: "IVA 0% (exento)", codigo: "01", tarifa: 0 },
    // Restaurantes, bares y cafeterias no cobran IVA sino impuesto al consumo.
    { value: "04-8", label: "Impuesto al consumo 8% (restaurantes)", codigo: "04", tarifa: 8 },
  ],
  EC: [
    { value: "2-15", label: "IVA 15%", codigo: "2", tarifa: 15 },
    { value: "2-5", label: "IVA 5%", codigo: "2", tarifa: 5 },
    { value: "2-0", label: "IVA 0%", codigo: "2", tarifa: 0 },
  ],
};

/** Tabla 17 del SRI: el codigo de cada tarifa del IVA. */
export const CODIGO_TARIFA_SRI: Record<number, string> = { 0: "0", 12: "2", 14: "3", 15: "4", 5: "5", 13: "10" };

/**
 * Hasta cuanto se puede facturar a "consumidor final" sin datos del comprador.
 * En Ecuador el SRI lo limita a 50 dolares; en Colombia no hay tope.
 */
export const TOPE_CONSUMIDOR_FINAL: Record<Pais, number | null> = { CO: null, EC: 50 };

/**
 * Digito de verificacion del NIT, con los pesos de la DIAN.
 *
 * Se calcula solo para que nadie lo tenga que saber de memoria: un digito mal
 * puesto hace que la DIAN rechace la factura.
 */
export function digitoVerificacion(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digitos = nit.replace(/\D/g, "").split("").reverse();
  if (digitos.length === 0 || digitos.length > pesos.length) return "";
  const suma = digitos.reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const resto = suma % 11;
  return String(resto > 1 ? 11 - resto : resto);
}

/** El comprador que se escribe en la venta. */
export type Comprador = {
  consumidorFinal: boolean;
  tipoDocumento: string;
  numero: string;
  nombre: string;
  /** Persona juridica (empresa) o natural. */
  esEmpresa: boolean;
  correo: string;
  telefono: string;
  direccion: string;
};

export const COMPRADOR_VACIO: Comprador = {
  consumidorFinal: true,
  tipoDocumento: "",
  numero: "",
  nombre: "",
  esEmpresa: false,
  correo: "",
  telefono: "",
  direccion: "",
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Lee y revisa al comprador. Devuelve el comprador limpio o el motivo para
 * pedirle a la persona que corrija, antes de gastar un intento con la entidad.
 */
export function leerComprador(
  pais: Pais,
  crudo: unknown,
  totalVenta: number
): { ok: true; comprador: Comprador } | { ok: false; error: string } {
  const d = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const correo = texto(d.correo, 120);
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, error: "El correo del comprador no es válido." };

  const base = {
    correo,
    telefono: texto(d.telefono, 30),
    direccion: texto(d.direccion, 200),
  };

  if (d.consumidorFinal === true) {
    const tope = TOPE_CONSUMIDOR_FINAL[pais];
    if (tope !== null && totalVenta > tope) {
      return {
        ok: false,
        error: "En Ecuador una factura a consumidor final no puede pasar de 50 dólares: escribe los datos del comprador.",
      };
    }
    return { ok: true, comprador: { ...COMPRADOR_VACIO, ...base, consumidorFinal: true } };
  }

  const tipoDocumento = texto(d.tipoDocumento, 4);
  if (!DOCUMENTOS[pais].some((x) => x.value === tipoDocumento)) return { ok: false, error: "Elige el tipo de documento del comprador." };
  const numero = texto(d.numero, 20).replace(/[\s.-]/g, "");
  if (!/^[A-Za-z0-9]{3,20}$/.test(numero)) return { ok: false, error: "Escribe el número de documento del comprador, sin puntos." };
  if (pais === "EC" && tipoDocumento === "05" && !/^\d{10}$/.test(numero)) return { ok: false, error: "La cédula ecuatoriana tiene 10 dígitos." };
  if (pais === "EC" && tipoDocumento === "04" && !/^\d{13}$/.test(numero)) return { ok: false, error: "El RUC tiene 13 dígitos." };
  const nombre = texto(d.nombre, 200);
  if (!nombre) return { ok: false, error: "Escribe el nombre o la razón social del comprador." };

  return {
    ok: true,
    comprador: { ...base, consumidorFinal: false, tipoDocumento, numero, nombre, esEmpresa: d.esEmpresa === true },
  };
}
