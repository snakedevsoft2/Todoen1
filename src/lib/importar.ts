/**
 * Leer la lista de clientes o de productos que la gente ya tiene.
 *
 * Llega de muchas formas: pegada de Excel o Google Sheets, un CSV, un Excel,
 * o los contactos exportados del celular. Y nadie la arma con el formato que
 * pide un programa: las columnas vienen en otro orden, con otro nombre
 * ("Celular" en vez de "Telefono"), con un titulo arriba, con el nombre y el
 * apellido separados, o sin encabezados.
 *
 * Por eso las columnas se buscan en tres pasos:
 *   1. la fila de encabezados, aunque no sea la primera;
 *   2. cada encabezado por su nombre, en español o en ingles;
 *   3. lo que falte, mirando los datos: la columna llena de "@" es el correo
 *      y la de numeros de 7 a 15 digitos, el telefono.
 * Si aun asi algo queda mal, la pantalla deja corregir cada columna a mano.
 *
 * Se usa en el telefono (la vista previa) y en el servidor, asi que no toca la
 * base de datos.
 */

export type Tabla = { encabezados: string[]; filas: string[][] };

export const LIMITE_FILAS = 3000;

/** Cuantas filas de arriba se miran buscando los encabezados. */
const FILAS_PARA_ENCABEZADO = 10;
/** Cuantas filas se miran para reconocer una columna por sus datos. */
const MUESTRA = 200;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Parte el texto en filas y columnas.
 *
 * Pegado de Excel viene separado por tabulaciones; un CSV guardado en un
 * computador en español suele venir con punto y coma, y en ingles con coma.
 * Se cuentan en las primeras lineas y no solo en la primera: un titulo arriba
 * ("Inventario") no trae ninguno. Respeta las comillas: "Calle 5, apto 2" es
 * un solo campo.
 */
export function leerTabla(texto: string): Tabla {
  const limpio = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const muestra = limpio
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, FILAS_PARA_ENCABEZADO);
  const cuantos = (sep: string) => muestra.reduce((n, l) => n + l.split(sep).length - 1, 0);
  const separador = cuantos("\t") > 0 ? "\t" : cuantos(";") > cuantos(",") ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"' && campo.trim() === "") {
      entreComillas = true;
      campo = "";
    } else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  const utiles = filas.map((f) => f.map((x) => x.trim())).filter((f) => f.some((x) => x !== ""));
  if (utiles.length === 0) return { encabezados: [], filas: [] };
  return { encabezados: utiles[0], filas: utiles.slice(1) };
}

/** Todas las filas con algo de un texto pegado o de un CSV, encabezados incluidos. */
export function filasDeTexto(texto: string): string[][] {
  const t = leerTabla(texto);
  return t.encabezados.length > 0 ? [t.encabezados, ...t.filas] : [];
}

type Sinonimos<C extends string> = Record<C, string[]>;

export type CampoCliente = "name" | "phone" | "email" | "document" | "address" | "notes";
export type CampoProducto = "name" | "price" | "cost" | "category" | "description" | "stock";
/** El nombre y el apellido en columnas separadas: se unen en el nombre. */
type ParteNombre = "pila" | "apellido";

// Escritos ya normalizados: sin tildes, en minusculas y con espacios.
const SINONIMOS_CLIENTE: Sinonimos<CampoCliente | ParteNombre> = {
  name: [
    "nombre", "nombres", "nombre completo", "nombre y apellido", "nombres y apellidos", "nombre cliente",
    "nombre del cliente", "cliente", "razon social", "contacto", "nombre contacto", "name", "full name",
    "display name", "customer", "client", "contact name",
  ],
  pila: ["primer nombre", "nombre de pila", "first name", "given name", "firstname"],
  apellido: ["apellido", "apellidos", "primer apellido", "last name", "surname", "family name", "lastname"],
  phone: [
    "telefono", "telefonos", "tel", "telf", "tlf", "celular", "cel", "movil", "whatsapp", "wsp", "numero",
    "numero de telefono", "numero celular", "numero de celular", "numero de whatsapp", "phone", "phone number",
    "mobile", "mobile phone", "cell", "cell phone", "telephone",
  ],
  email: [
    "correo", "correos", "correo electronico", "email", "e mail", "mail", "email address", "e mail address",
    "direccion de correo", "direccion de correo electronico",
  ],
  document: [
    "documento", "cedula", "cc", "nit", "ruc", "rut", "identificacion", "dni", "documento de identidad",
    "numero de documento", "numero de identificacion", "no documento", "tax id",
  ],
  address: ["direccion", "domicilio", "direccion de residencia", "address", "street", "home address"],
  notes: ["notas", "nota", "observaciones", "observacion", "comentarios", "comentario", "notes", "note"],
};

const SINONIMOS_PRODUCTO: Sinonimos<CampoProducto> = {
  name: [
    "nombre", "producto", "nombre del producto", "nombre producto", "servicio", "item", "articulo", "referencia",
    "name", "product", "product name",
  ],
  price: [
    "precio", "precio de venta", "precio venta", "valor", "pvp", "precio unitario", "precio publico", "price",
    "sale price",
  ],
  cost: ["costo", "precio de compra", "precio compra", "costo unitario", "cost", "purchase price"],
  category: ["categoria", "grupo", "linea", "tipo", "familia", "category"],
  description: ["descripcion", "detalle", "description"],
  stock: ["stock", "cantidad", "existencias", "inventario", "unidades", "disponible", "qty", "quantity"],
};

/** Las columnas en el orden en que se esperan cuando la tabla no trae encabezados. */
export const ORDEN_CLIENTES: CampoCliente[] = ["name", "phone", "email", "document", "address", "notes"];
export const ORDEN_PRODUCTOS: CampoProducto[] = ["name", "price", "cost", "category", "description", "stock"];

export const TITULO_CAMPO: Record<CampoCliente | CampoProducto, string> = {
  name: "Nombre",
  phone: "Teléfono",
  email: "Correo",
  document: "Documento",
  address: "Dirección",
  notes: "Notas",
  price: "Precio",
  cost: "Costo",
  category: "Categoría",
  description: "Descripción",
  stock: "Cantidad",
};

const CORREO_EN_TEXTO = /[^\s@;,<>"'()[\]]+@[^\s@;,<>"'()[\]]+\.[a-z]{2,}/i;

const digitos = (v: string) => v.replace(/\D/g, "");

/**
 * El telefono como se ve, sin lo que le agrega Excel: "3,001234567E+09" (el
 * numero en notacion cientifica), "3001234567.0", o dos numeros en la misma
 * celda (se toma el primero).
 */
export function limpiarTelefono(valor: string): string {
  let s = valor.trim();
  const cientifico = s.match(/^(\d)[.,](\d+)e\+?(\d+)$/i);
  if (cientifico) {
    const n = Number(cientifico[1] + "." + cientifico[2] + "e" + cientifico[3]);
    if (Number.isFinite(n)) s = n.toFixed(0);
  }
  s = s.replace(/^(\d+)\.0+$/, "$1");
  const numero = s.match(/\+?\d[\d\s().-]{5,}\d/);
  return (numero ? numero[0] : s).trim().slice(0, 40);
}

/** El correo sin "mailto:", en minusculas, y el primero si la celda trae varios. */
export function limpiarCorreo(valor: string): string {
  const m = valor.replace(/mailto:/gi, "").match(CORREO_EN_TEXTO);
  return (m ? m[0].toLowerCase() : valor.trim()).slice(0, 120);
}

const pareceCorreo = (v: string) => CORREO_EN_TEXTO.test(v);
function pareceTelefono(v: string): boolean {
  const s = v.trim();
  if (!/^[+\d\s().\-/]+$/.test(s) && !/^\d[.,]\d+e\+?\d+$/i.test(s)) return false;
  const n = digitos(limpiarTelefono(s)).length;
  return n >= 7 && n <= 15;
}
const pareceNombre = (v: string) => /\p{L}{2,}/u.test(v) && !pareceCorreo(v);
/** Un celular de Colombia o Ecuador, o un numero con indicativo: gana cuando hay dos columnas de numeros. */
function pareceCelular(v: string): boolean {
  const d = digitos(limpiarTelefono(v));
  return /^3\d{9}$/.test(d) || /^09\d{8}$/.test(d) || /^(57|593)\d{9,10}$/.test(d) || v.trim().startsWith("+");
}

function limpiarFilas(crudas: unknown[][]): string[][] {
  return crudas
    .map((f) => (Array.isArray(f) ? f : []).map((c) => String(c ?? "").trim()))
    .filter((f) => f.some((c) => c !== ""));
}

/** Que tan seguro es que un encabezado sea un campo: 0 si no se parece. */
function puntaje(encabezado: string, sinonimos: string[]): number {
  let mejor = 0;
  for (const s of sinonimos) {
    if (encabezado === s) mejor = Math.max(mejor, 1000 + s.length);
    else if (encabezado.startsWith(s + " ") || encabezado.endsWith(" " + s) || encabezado.includes(" " + s + " ")) {
      mejor = Math.max(mejor, s.length);
    }
  }
  return mejor;
}

/**
 * Cada campo con su columna, por el nombre del encabezado. Gana el parecido
 * mas fuerte: "Direccion de correo" es el correo y no la direccion.
 */
function asignarPorEncabezado<C extends string>(
  encabezados: string[],
  sinonimos: Sinonimos<C>
): { indice: Partial<Record<C, number>>; exactas: number } {
  const pares: { campo: C; col: number; p: number }[] = [];
  encabezados.forEach((h, col) => {
    const n = normalizar(h);
    if (!n) return;
    for (const campo of Object.keys(sinonimos) as C[]) {
      const p = puntaje(n, sinonimos[campo]);
      if (p > 0) pares.push({ campo, col, p });
    }
  });
  pares.sort((a, b) => b.p - a.p || a.col - b.col);
  const indice: Partial<Record<C, number>> = {};
  const usadas = new Set<number>();
  let exactas = 0;
  for (const { campo, col, p } of pares) {
    if (indice[campo] !== undefined || usadas.has(col)) continue;
    indice[campo] = col;
    usadas.add(col);
    if (p >= 1000) exactas += 1;
  }
  return { indice, exactas };
}

/**
 * La fila de encabezados, entre las de arriba: la que mas se parece a nombres
 * de columnas. Tiene que tener dos parecidos, o uno exacto, para que un dato
 * suelto ("Cliente frecuente") no se confunda con un encabezado.
 */
function buscarEncabezado<C extends string>(filas: string[][], sinonimos: Sinonimos<C>): number {
  let mejor = -1;
  let mejorCuenta = 0;
  filas.slice(0, FILAS_PARA_ENCABEZADO).forEach((fila, i) => {
    const { indice, exactas } = asignarPorEncabezado(fila, sinonimos);
    const cuenta = Object.keys(indice).length;
    if ((cuenta >= 2 || exactas >= 1) && cuenta > mejorCuenta) {
      mejor = i;
      mejorCuenta = cuenta;
    }
  });
  return mejor;
}

const muestras = (filas: string[][], col: number) =>
  filas
    .slice(0, MUESTRA)
    .map((f) => (f[col] ?? "").trim())
    .filter(Boolean);

function proporcion(valores: string[], prueba: (v: string) => boolean): number {
  return valores.length ? valores.filter(prueba).length / valores.length : 0;
}

const celda = (fila: string[], i: number, max: number) => (i >= 0 ? (fila[i] ?? "").trim().slice(0, max) : "");

export type FilaCliente = Record<CampoCliente, string>;
export type FilaProducto = Record<CampoProducto, string>;

type Lectura<C extends string, F> = {
  filas: F[];
  sinNombre: number;
  /** Los campos que se encontraron, en el orden de la plantilla. */
  columnas: C[];
  /** El titulo de cada columna del archivo, para corregirlas a mano. */
  encabezados: string[];
  /** La columna de cada campo, o -1. */
  indice: Record<C, number>;
  /** Los campos que se reconocieron por los datos y no por el encabezado. */
  porContenido: C[];
};

export type LecturaClientes = Lectura<CampoCliente, FilaCliente> & { nombreUnido: boolean };
export type LecturaProductos = Lectura<CampoProducto, FilaProducto>;

/** Lo que eligio la persona a mano: esa columna deja de ser de cualquier otro campo. */
function aplicarAsignacion<C extends string>(
  indice: Record<C, number>,
  orden: C[],
  asignacion: Partial<Record<C, number>>,
  ancho: number,
  porContenido: C[]
): C[] {
  const elegidos: C[] = [];
  for (const campo of orden) {
    const v = asignacion[campo];
    if (v === undefined) continue;
    const col = Number.isInteger(v) && v >= 0 && v < ancho ? v : -1;
    if (col >= 0) for (const otro of orden) if (otro !== campo && indice[otro] === col) indice[otro] = -1;
    indice[campo] = col;
    elegidos.push(campo);
    const k = porContenido.indexOf(campo);
    if (k >= 0) porContenido.splice(k, 1);
  }
  return elegidos;
}

function titulos(encabezados: string[], ancho: number): string[] {
  return Array.from({ length: ancho }, (_, i) => (encabezados[i] ?? "").trim() || "Columna " + (i + 1));
}

export function leerClientes(crudas: unknown[][], asignacion: Partial<Record<CampoCliente, number>> = {}): LecturaClientes {
  const filas = limpiarFilas(crudas);
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
  const h = buscarEncabezado(filas, SINONIMOS_CLIENTE);
  let encabezados = h >= 0 ? filas[h] : [];
  let datos = h >= 0 ? filas.slice(h + 1) : filas;
  const porEncabezado = h >= 0 ? asignarPorEncabezado(encabezados, SINONIMOS_CLIENTE).indice : {};

  const indice = Object.fromEntries(ORDEN_CLIENTES.map((c) => [c, porEncabezado[c] ?? -1])) as Record<CampoCliente, number>;
  let pila = porEncabezado.pila ?? -1;
  let apellido = porEncabezado.apellido ?? -1;
  const porContenido: CampoCliente[] = [];
  const libres = () => {
    const usadas = new Set([...Object.values(indice), pila, apellido]);
    return Array.from({ length: ancho }, (_, i) => i).filter((i) => !usadas.has(i));
  };

  // Lo que el encabezado no dijo, por los datos.
  if (indice.email < 0) {
    const col = libres().find((i) => proporcion(muestras(datos, i), pareceCorreo) >= 0.6);
    if (col !== undefined) {
      indice.email = col;
      porContenido.push("email");
    }
  }
  if (indice.phone < 0) {
    const candidatas = libres().filter((i) => proporcion(muestras(datos, i), pareceTelefono) >= 0.6);
    candidatas.sort(
      (a, b) => proporcion(muestras(datos, b), pareceCelular) - proporcion(muestras(datos, a), pareceCelular) || a - b
    );
    if (candidatas.length > 0) {
      indice.phone = candidatas[0];
      porContenido.push("phone");
    }
  }
  if (indice.name < 0 && pila < 0 && apellido < 0) {
    const col = libres().find((i) => proporcion(muestras(datos, i), (v) => pareceNombre(v) && !pareceTelefono(v)) >= 0.6);
    if (col !== undefined) {
      indice.name = col;
      porContenido.push("name");
    }
  }

  if (h < 0) {
    if (indice.document < 0) {
      const col = libres().find((i) => proporcion(muestras(datos, i), (v) => /^[\d.\-\s]{5,15}$/.test(v)) >= 0.6);
      if (col !== undefined) {
        indice.document = col;
        porContenido.push("document");
      }
    }
    // Sin encabezados, lo demas va en el orden de la plantilla si esa columna quedo libre.
    ORDEN_CLIENTES.forEach((campo, pos) => {
      if (indice[campo] < 0 && pos < ancho && libres().includes(pos)) indice[campo] = pos;
    });
    // Una primera fila que no encaja con lo de abajo es un encabezado que no conocemos.
    const primera = datos[0];
    const noEncaja = (campo: "email" | "phone", prueba: (v: string) => boolean) =>
      indice[campo] >= 0 && (primera?.[indice[campo]] ?? "") !== "" && !prueba(primera[indice[campo]]);
    if (primera && datos.length > 1 && (noEncaja("email", pareceCorreo) || noEncaja("phone", pareceTelefono))) {
      encabezados = primera;
      datos = datos.slice(1);
    }
  }

  const elegidos = aplicarAsignacion(indice, ORDEN_CLIENTES, asignacion, ancho, porContenido);
  if (elegidos.includes("name")) {
    // Nombre elegido a mano: se toma esa columna tal cual, sin unir apellidos.
    pila = -1;
    apellido = -1;
  }
  for (const campo of elegidos) {
    if (indice[campo] >= 0 && indice[campo] === pila) pila = -1;
    if (indice[campo] >= 0 && indice[campo] === apellido) apellido = -1;
  }
  const nombreUnido = indice.name < 0 ? pila >= 0 || apellido >= 0 : apellido >= 0;

  const nombreDe = (f: string[]) => {
    const base = indice.name >= 0 ? celda(f, indice.name, 200) : celda(f, pila, 100);
    const ape = celda(f, apellido, 100);
    // "Nombre completo" + "Apellido": si el apellido ya esta en el nombre, no se repite.
    if (!ape || (base && normalizar(base).includes(normalizar(ape)))) return base;
    return (base ? base + " " + ape : ape).slice(0, 200);
  };

  const leidas = datos.slice(0, LIMITE_FILAS).map((f) => ({
    name: nombreDe(f),
    phone: indice.phone >= 0 ? limpiarTelefono(celda(f, indice.phone, 80)) : "",
    email: indice.email >= 0 ? limpiarCorreo(celda(f, indice.email, 300)) : "",
    document: celda(f, indice.document, 30),
    address: celda(f, indice.address, 200),
    notes: celda(f, indice.notes, 500),
  }));

  return {
    filas: leidas.filter((f) => f.name),
    sinNombre: leidas.filter((f) => !f.name).length,
    columnas: ORDEN_CLIENTES.filter((c) => indice[c] >= 0 || (c === "name" && nombreUnido)),
    encabezados: titulos(encabezados, ancho),
    indice,
    porContenido,
    nombreUnido,
  };
}

export function leerProductos(crudas: unknown[][], asignacion: Partial<Record<CampoProducto, number>> = {}): LecturaProductos {
  const filas = limpiarFilas(crudas);
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
  const h = buscarEncabezado(filas, SINONIMOS_PRODUCTO);
  const encabezados = h >= 0 ? filas[h] : [];
  const datos = h >= 0 ? filas.slice(h + 1) : filas;
  const porEncabezado = h >= 0 ? asignarPorEncabezado(encabezados, SINONIMOS_PRODUCTO).indice : {};
  // Sin encabezados, las columnas van en el orden de la plantilla.
  const indice = Object.fromEntries(
    ORDEN_PRODUCTOS.map((c, pos) => [c, h >= 0 ? (porEncabezado[c] ?? -1) : pos < ancho ? pos : -1])
  ) as Record<CampoProducto, number>;
  const porContenido: CampoProducto[] = [];
  aplicarAsignacion(indice, ORDEN_PRODUCTOS, asignacion, ancho, porContenido);

  const leidas = datos.slice(0, LIMITE_FILAS).map((f) => ({
    name: celda(f, indice.name, 200),
    price: celda(f, indice.price, 30),
    cost: celda(f, indice.cost, 30),
    category: celda(f, indice.category, 60),
    description: celda(f, indice.description, 500),
    stock: celda(f, indice.stock, 12),
  }));
  return {
    filas: leidas.filter((f) => f.name),
    sinNombre: leidas.filter((f) => !f.name).length,
    columnas: ORDEN_PRODUCTOS.filter((c) => indice[c] >= 0),
    encabezados: titulos(encabezados, ancho),
    indice,
    porContenido,
  };
}

export function filasDeClientes(texto: string): LecturaClientes {
  return leerClientes(filasDeTexto(texto));
}

export function filasDeProductos(texto: string): LecturaProductos {
  return leerProductos(filasDeTexto(texto));
}

function decodificarQP(valor: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < valor.length; i++) {
    const par = valor.slice(i + 1, i + 3);
    if (valor[i] === "=" && /^[0-9A-F]{2}$/i.test(par)) {
      bytes.push(parseInt(par, 16));
      i += 2;
    } else {
      bytes.push(valor.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder(/8859|1252|latin/i.test(charset) ? "windows-1252" : "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return valor;
  }
}

const sinEscape = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;:\\])/g, "$1").trim();
const partes = (v: string) => v.split(/(?<!\\);/).map(sinEscape);

/**
 * Los contactos exportados del celular (vCard, .vcf), como una tabla con
 * encabezados: Nombre, Telefono, Correo, Direccion y Notas. Se toma el primer
 * telefono y el primer correo de cada contacto.
 */
export function filasDeVcf(texto: string): string[][] {
  const logicas: string[] = [];
  for (const linea of texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const ultima = logicas.length - 1;
    if (ultima >= 0 && /^[ \t]/.test(linea)) logicas[ultima] += linea.slice(1);
    else if (ultima >= 0 && /QUOTED-PRINTABLE/i.test(logicas[ultima]) && logicas[ultima].endsWith("=")) {
      logicas[ultima] = logicas[ultima].slice(0, -1) + linea;
    } else logicas.push(linea);
  }

  const filas: string[][] = [["Nombre", "Teléfono", "Correo", "Dirección", "Notas"]];
  let c: { fn: string; n: string; tel: string; email: string; adr: string; note: string; org: string } | null = null;
  for (const linea of logicas) {
    const arriba = linea.trim().toUpperCase();
    if (arriba === "BEGIN:VCARD") {
      c = { fn: "", n: "", tel: "", email: "", adr: "", note: "", org: "" };
      continue;
    }
    if (arriba === "END:VCARD") {
      if (c) {
        const nombre = c.fn || c.n || c.org;
        if (nombre || c.tel || c.email) filas.push([nombre, c.tel, c.email, c.adr, c.note]);
      }
      c = null;
      continue;
    }
    if (!c) continue;
    const dos = linea.indexOf(":");
    if (dos < 0) continue;
    const cabeza = linea.slice(0, dos).split(";");
    const prop = cabeza[0].replace(/^item\d+\./i, "").toUpperCase();
    const params = cabeza.slice(1).join(";");
    let valor = linea.slice(dos + 1);
    if (/QUOTED-PRINTABLE/i.test(params)) valor = decodificarQP(valor, (params.match(/CHARSET=([^;]+)/i) ?? [])[1] ?? "utf-8");
    if (prop === "FN" && !c.fn) c.fn = sinEscape(valor);
    else if (prop === "N" && !c.n) {
      const [apellidos = "", nombres = ""] = partes(valor);
      c.n = [nombres, apellidos].filter(Boolean).join(" ");
    } else if (prop === "TEL" && !c.tel) c.tel = sinEscape(valor).replace(/^tel:/i, "");
    else if (prop === "EMAIL" && !c.email) c.email = sinEscape(valor);
    else if (prop === "ADR" && !c.adr) c.adr = partes(valor).filter(Boolean).join(", ");
    else if (prop === "NOTE" && !c.note) c.note = sinEscape(valor);
    else if (prop === "ORG" && !c.org) c.org = partes(valor).filter(Boolean).join(" ");
  }
  return filas.length > 1 ? filas : [];
}

/** La plantilla que se descarga para llenar en Excel. */
export const PLANTILLA: Record<"clientes" | "productos", string> = {
  clientes: "Nombre;Teléfono;Correo;Documento;Dirección;Notas\nAna Pérez;3001234567;ana@correo.com;1012345678;Calle 10 # 5-20;Cliente frecuente\n",
  productos: "Nombre;Precio;Costo;Categoría;Descripción;Cantidad\nCamiseta básica;35000;18000;Camisetas;Algodón, varias tallas;12\n",
};
