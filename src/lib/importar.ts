/**
 * Leer una tabla copiada de Excel o de Google Sheets, o un archivo CSV.
 *
 * Nadie arma un archivo con el formato exacto que pide un programa: las
 * columnas vienen en otro orden, con tildes, en mayusculas o con otro nombre
 * ("Celular" en vez de "Telefono"). Aqui se reconocen por su nombre y, si la
 * tabla no trae encabezados, por su posicion.
 *
 * Se usa en el telefono (la vista previa) y en el servidor (la carga), asi que
 * no toca la base de datos.
 */

export type Tabla = { encabezados: string[]; filas: string[][] };

export const LIMITE_FILAS = 3000;

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
 * Se mira la primera linea para saber cual es. Respeta las comillas: "Calle 5,
 * apto 2" es un solo campo.
 */
export function leerTabla(texto: string): Tabla {
  const limpio = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const primera = limpio.split("\n").find((l) => l.trim()) ?? "";
  const separador = primera.includes("\t")
    ? "\t"
    : primera.split(";").length > primera.split(",").length
      ? ";"
      : ",";

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

type Sinonimos<C extends string> = Record<C, string[]>;

export type CampoCliente = "name" | "phone" | "email" | "document" | "address" | "notes";
export type CampoProducto = "name" | "price" | "cost" | "category" | "description" | "stock";

const SINONIMOS_CLIENTE: Sinonimos<CampoCliente> = {
  name: ["nombre", "nombres", "nombre completo", "cliente", "razon social", "name"],
  phone: ["telefono", "tel", "celular", "movil", "whatsapp", "numero", "numero de telefono", "phone"],
  email: ["correo", "correo electronico", "email", "e mail", "mail"],
  document: ["documento", "cedula", "cc", "nit", "ruc", "identificacion", "dni", "documento de identidad"],
  address: ["direccion", "domicilio", "address"],
  notes: ["notas", "nota", "observaciones", "observacion", "comentarios"],
};

const SINONIMOS_PRODUCTO: Sinonimos<CampoProducto> = {
  name: ["nombre", "producto", "nombre del producto", "servicio", "item", "articulo", "referencia", "name"],
  price: ["precio", "precio de venta", "precio venta", "valor", "pvp", "precio unitario", "price"],
  cost: ["costo", "precio de compra", "precio compra", "costo unitario", "cost"],
  category: ["categoria", "grupo", "linea", "tipo", "familia", "category"],
  description: ["descripcion", "detalle", "description"],
  stock: ["stock", "cantidad", "existencias", "inventario", "unidades", "disponible"],
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

/**
 * Que columna es cada campo. Si ningun encabezado se reconoce como el nombre,
 * la primera fila es un dato mas y las columnas se toman por posicion.
 */
function columnas<C extends string>(
  tabla: Tabla,
  sinonimos: Sinonimos<C>,
  orden: C[]
): { indice: Record<C, number>; filas: string[][] } {
  const encabezados = tabla.encabezados.map(normalizar);
  const indice = {} as Record<C, number>;
  const usadas = new Set<number>();
  for (const campo of orden) {
    let i = encabezados.findIndex((h, j) => !usadas.has(j) && sinonimos[campo].includes(h));
    if (i < 0) i = encabezados.findIndex((h, j) => !usadas.has(j) && sinonimos[campo].some((s) => h.startsWith(s + " ")));
    indice[campo] = i;
    if (i >= 0) usadas.add(i);
  }
  if (indice[orden[0]] < 0) {
    orden.forEach((campo, i) => (indice[campo] = i));
    return { indice, filas: [tabla.encabezados, ...tabla.filas] };
  }
  return { indice, filas: tabla.filas };
}

const celda = (fila: string[], i: number, max: number) => (i >= 0 ? (fila[i] ?? "").trim().slice(0, max) : "");

export type FilaCliente = Record<CampoCliente, string>;
export type FilaProducto = Record<CampoProducto, string>;

export function filasDeClientes(texto: string): { filas: FilaCliente[]; sinNombre: number; columnas: CampoCliente[] } {
  const { indice, filas } = columnas(leerTabla(texto), SINONIMOS_CLIENTE, ORDEN_CLIENTES);
  const leidas = filas.slice(0, LIMITE_FILAS).map((f) => ({
    name: celda(f, indice.name, 200),
    phone: celda(f, indice.phone, 40),
    email: celda(f, indice.email, 120),
    document: celda(f, indice.document, 30),
    address: celda(f, indice.address, 200),
    notes: celda(f, indice.notes, 500),
  }));
  return {
    filas: leidas.filter((f) => f.name),
    sinNombre: leidas.filter((f) => !f.name).length,
    columnas: ORDEN_CLIENTES.filter((c) => indice[c] >= 0),
  };
}

export function filasDeProductos(texto: string): { filas: FilaProducto[]; sinNombre: number; columnas: CampoProducto[] } {
  const { indice, filas } = columnas(leerTabla(texto), SINONIMOS_PRODUCTO, ORDEN_PRODUCTOS);
  const leidas = filas.slice(0, LIMITE_FILAS).map((f) => ({
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
  };
}

/** La plantilla que se descarga para llenar en Excel. */
export const PLANTILLA: Record<"clientes" | "productos", string> = {
  clientes: "Nombre;Teléfono;Correo;Documento;Dirección;Notas\nAna Pérez;3001234567;ana@correo.com;1012345678;Calle 10 # 5-20;Cliente frecuente\n",
  productos: "Nombre;Precio;Costo;Categoría;Descripción;Cantidad\nCamiseta básica;35000;18000;Camisetas;Algodón, varias tallas;12\n",
};
