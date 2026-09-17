import type { BusinessType } from "@prisma/client";
import { db } from "./db";
import { parseMoney } from "./format";
import { asegurarCategorias, crearCategoria } from "./categorias-negocio";
import { configurarMesas } from "./mesas";
import { normalizarUsuario, USUARIO_VALIDO } from "./usuario";
import { STAFF_COLORS, teamNoun } from "./staff";
import { normalizeHex } from "./theme";
import type { Herramienta } from "./ai";

/**
 * Lo que el asistente del dueño puede crear por si mismo, cuando se lo piden.
 *
 * Todo lo de aqui es aditivo a proposito: crea o cambia un dato basico, nunca
 * borra ni desactiva nada. Asi lo peor que puede hacer un modelo confundido es
 * crear algo de mas, que el dueño borra el con dos toques, y nunca perder
 * algo que ya tenia.
 *
 * Cada funcion recibe los argumentos crudos que manda el modelo (siempre
 * unknown: nunca hay que confiar en la forma exacta) y devuelve un objeto
 * plano, que es lo que el modelo lee para contarle a la persona como le fue.
 */

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const numero = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));

export async function crearProductoIA(
  userId: string,
  currency: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nombre = texto(args.nombre, 120);
  if (!nombre) return { ok: false, error: "Falta el nombre del producto." };

  const precio = parseMoney(String(args.precio ?? ""), currency);
  if (precio <= 0) return { ok: false, error: "Dame un precio valido, mayor a cero." };

  const categoriaPedida = texto(args.categoria, 40) || "General";
  const category = (await asegurarCategorias(userId, [categoriaPedida])).get(categoriaPedida) ?? "General";

  const creado = await db.service.create({
    data: { userId, name: nombre, price: precio, category, bookable: false },
  });
  return { ok: true, id: creado.id, nombre, categoria: category };
}

export async function crearCategoriaIA(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await crearCategoria(userId, texto(args.nombre, 40));
  return "error" in r ? { ok: false, error: r.error } : { ok: true, mensaje: r.ok };
}

export async function configurarMesasIA(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cantidad = Math.trunc(numero(args.cantidad));
  const r = await configurarMesas(userId, cantidad);
  return "error" in r ? { ok: false, error: r.error } : { ok: true, mensaje: r.ok };
}

export async function agregarEmpleadoIA(
  userId: string,
  businessType: BusinessType,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nombre = texto(args.nombre, 80);
  if (!nombre) return { ok: false, error: "Falta el nombre de la persona." };

  const count = await db.staff.count({ where: { userId } });
  if (count >= 20) return { ok: false, error: "Ya hay 20 personas en el equipo, el máximo. No se puede agregar otra." };

  let username = normalizarUsuario(texto(args.usuario, 30) || nombre);
  if (!USUARIO_VALIDO.test(username)) {
    return { ok: false, error: "Ese usuario no sirve para entrar (letras, números, puntos). Pide otro nombre de usuario." };
  }
  // El usuario de entrar es unico entre TODOS los negocios: si ya lo tiene
  // otra persona, se le agrega un numero en vez de fallarle al dueño.
  if (await db.staff.findUnique({ where: { username }, select: { id: true } })) {
    username = username.slice(0, 25) + Math.floor(10 + Math.random() * 90);
  }

  const noun = teamNoun(businessType);
  await db.staff.create({
    data: {
      userId,
      name: nombre,
      username,
      color: STAFF_COLORS[count % STAFF_COLORS.length],
      role: noun.role === "VENDEDOR" ? "VENDEDOR" : "BARBERO",
      bookable: true,
    },
  });
  return { ok: true, nombre, usuario: username };
}

export async function actualizarNegocioIA(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data: { businessName?: string; tagline?: string | null; brandColor?: string } = {};
  if (typeof args.nombreDelNegocio === "string" && args.nombreDelNegocio.trim()) {
    data.businessName = texto(args.nombreDelNegocio, 80);
  }
  if (typeof args.frase === "string") {
    data.tagline = texto(args.frase, 120) || null;
  }
  if (typeof args.colorDeMarca === "string" && args.colorDeMarca.trim()) {
    data.brandColor = normalizeHex(args.colorDeMarca);
  }
  if (Object.keys(data).length === 0) return { ok: false, error: "No me diste ningún dato para cambiar." };

  await db.user.update({ where: { id: userId }, data });
  return { ok: true, cambios: data };
}

/** Las herramientas que se le ofrecen al modelo. Las de mesas solo si el negocio las usa. */
export function herramientasDeConfiguracion(businessType: BusinessType): Herramienta[] {
  const base: Herramienta[] = [
    {
      name: "crear_producto",
      description: "Crea un producto o plato en el catálogo del negocio, con su precio y categoría.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre del producto." },
          precio: { type: "number", description: "Precio de venta, en la moneda del negocio (solo el número)." },
          categoria: { type: "string", description: "Categoría del producto, por ejemplo 'Bebidas'. Si no se sabe, usa 'General'." },
        },
        required: ["nombre", "precio"],
      },
    },
    {
      name: "crear_categoria",
      description: "Crea una categoría vacía para organizar el catálogo, sin crear ningún producto todavía.",
      parameters: {
        type: "object",
        properties: { nombre: { type: "string", description: "Nombre de la categoría." } },
        required: ["nombre"],
      },
    },
    {
      name: "agregar_empleado",
      description: "Agrega una persona al equipo. Entra sin contraseña, escribiendo su usuario.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre de la persona." },
          usuario: { type: "string", description: "Usuario para entrar, sin espacios ni tildes. Si no lo dan, se saca del nombre." },
        },
        required: ["nombre"],
      },
    },
    {
      name: "actualizar_negocio",
      description: "Cambia el nombre del negocio, su frase de presentación o su color de marca. Solo cambia lo que se le pida.",
      parameters: {
        type: "object",
        properties: {
          nombreDelNegocio: { type: "string" },
          frase: { type: "string", description: "Frase corta de presentación, la que sale en el portafolio." },
          colorDeMarca: { type: "string", description: "Color en formato #RRGGBB." },
        },
      },
    },
  ];

  if (businessType === "RESTAURANTE" || businessType === "COMIDAS_RAPIDAS") {
    base.push({
      name: "configurar_mesas",
      description: "Dice cuántas mesas tiene el negocio, para que cada una quede con su código QR para pedir.",
      parameters: {
        type: "object",
        properties: { cantidad: { type: "number", description: "Número total de mesas." } },
        required: ["cantidad"],
      },
    });
  }

  return base;
}
